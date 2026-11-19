import Foundation

/// Swift port of engine/ (TypeScript is the reference). Same algorithm and JSON schemes, checked
/// against tests/vectors/*.json. Strings are processed as Unicode scalars so key matching is
/// identical to the UTF-16 matching in TypeScript and Kotlin (all keys are in the BMP).
public let halant = "\u{094D}"

public struct Scheme {
    enum Kind { case consonant, vowel, mark, symbol }
    struct Entry { let kind: Kind; let out: String; let matra: String }

    public let id: String
    public let name: String
    public let finalVirama: Bool
    let table: [String: Entry]
    let maxKey: Int

    public init(json: Data) throws {
        guard let o = try JSONSerialization.jsonObject(with: json) as? [String: Any] else {
            throw NSError(domain: "Nagosi", code: 1, userInfo: [NSLocalizedDescriptionKey: "scheme is not an object"])
        }
        var table: [String: Entry] = [:]
        var maxKey = 1
        func add(_ name: String, _ kind: Kind) {
            for row in (o[name] as? [[String]]) ?? [] where row.count >= 2 {
                let key = row[0].precomposedStringWithCanonicalMapping
                if table[key] == nil {
                    table[key] = Entry(kind: kind, out: row[1], matra: row.count > 2 ? row[2] : "")
                    maxKey = max(maxKey, key.unicodeScalars.count)
                }
            }
        }
        add("vowels", .vowel)
        add("consonants", .consonant)
        add("marks", .mark)
        add("symbols", .symbol)
        id = o["id"] as? String ?? ""
        name = o["name"] as? String ?? ""
        finalVirama = o["finalVirama"] as? Bool ?? false
        self.table = table
        self.maxKey = maxKey
    }

    /// Load a bundled scheme: "nepali-roman", "iast", "itrans", "harvard-kyoto".
    public static func bundled(_ id: String) throws -> Scheme {
        guard let url = Bundle.module.url(forResource: id, withExtension: "json", subdirectory: "Resources/schemes") else {
            throw NSError(domain: "Nagosi", code: 2, userInfo: [NSLocalizedDescriptionKey: "no scheme \(id)"])
        }
        return try Scheme(json: Data(contentsOf: url))
    }
}

public enum Transliterator {
    public static func transliterate(_ input: String, _ scheme: Scheme) -> String {
        let scalars = Array(input.precomposedStringWithCanonicalMapping.unicodeScalars)
        var out = String.UnicodeScalarView()
        var bare = false
        var i = 0
        func emit(_ s: String) { out.append(contentsOf: s.unicodeScalars) }
        while i < scalars.count {
            var len = min(scheme.maxKey, scalars.count - i)
            var entry: Scheme.Entry?
            while len > 0 {
                var key = String.UnicodeScalarView()
                key.append(contentsOf: scalars[i..<(i + len)])
                if let e = scheme.table[String(key)] { entry = e; break }
                len -= 1
            }
            guard let e = entry else {
                if bare && scheme.finalVirama { emit(halant) }
                out.append(scalars[i])
                bare = false
                i += 1
                continue
            }
            switch e.kind {
            case .consonant:
                if bare { emit(halant) }
                emit(e.out)
                bare = true
            case .vowel:
                emit(bare ? e.matra : e.out)
                bare = false
            case .mark:
                emit(e.out)
                bare = false
            case .symbol:
                if bare && scheme.finalVirama { emit(halant) }
                emit(e.out)
                bare = false
            }
            i += len
        }
        if bare && scheme.finalVirama { emit(halant) }
        return String(out)
    }
}

/// Keyboard state machine: same contract as engine/transliteration/composer.ts.
public final class Composer {
    public struct Result { public let buffer: String; public let composing: String; public let commit: String }
    public static let commitKeys: Set<String> = [" ", "\n", "\t", ",", "?", "!", ";", ":", "\"", "(", ")", "[", "]", "{", "}", "/", "-"]

    public var scheme: Scheme
    public private(set) var buffer = ""

    public init(scheme: Scheme) { self.scheme = scheme }

    public var composing: String { Transliterator.transliterate(buffer, scheme) }

    @discardableResult
    public func key(_ ch: String) -> Result {
        if Composer.commitKeys.contains(ch) {
            let word = composing
            buffer = ""
            return Result(buffer: "", composing: "", commit: word + ch)
        }
        buffer += ch
        return Result(buffer: buffer, composing: composing, commit: "")
    }

    /// False when nothing was composing (the host should delete normally).
    @discardableResult
    public func backspace() -> Bool {
        guard !buffer.isEmpty else { return false }
        var s = buffer.unicodeScalars
        s.removeLast()
        buffer = String(s)
        return true
    }

    @discardableResult
    public func flush() -> String {
        let word = composing
        buffer = ""
        return word
    }

    /// Start composing these roman keys again (undoing an automatic pick puts the word back).
    public func restore(_ buf: String) { buffer = buf }

    public func choose(_ word: String, trailing: String = " ") -> String {
        buffer = ""
        return word + trailing
    }
}

/// Phonetic folding for suggestions: same table as engine/suggestions/suggester.ts.
public enum Skeleton {
    static let fold: [Unicode.Scalar: String] = {
        let pairs: [(String, String)] = [
            ("ी", "ि"), ("ू", "ु"), ("ई", "इ"), ("ऊ", "उ"), ("ॄ", "ृ"), ("ॠ", "ऋ"),
            ("ट", "त"), ("ठ", "थ"), ("ड", "द"), ("ढ", "ध"), ("ण", "न"), ("ङ", "न"), ("ञ", "न"),
            ("ष", "स"), ("श", "स"), ("व", "ब"), ("ं", "न"), ("ँ", "न"), ("ः", ""),
            ("ृ", "रि"), ("ऋ", "रि"), ("ै", "े"), ("ऐ", "ए"), ("ौ", "ो"), ("औ", "ओ"),
            ("ा", ""), ("आ", "अ"), ("छ", "च"),
            ("\u{094D}", ""), ("\u{093C}", ""), ("\u{200C}", ""), ("\u{200D}", ""),
        ]
        var m: [Unicode.Scalar: String] = [:]
        for (k, v) in pairs { m[k.unicodeScalars.first!] = v }
        return m
    }()

    public static func of(_ word: String) -> String {
        var out = ""
        let w = word.precomposedStringWithCanonicalMapping.replacingOccurrences(of: "ज्ञ", with: "ग्य")
        for u in w.decomposedStringWithCanonicalMapping.unicodeScalars {
            if let f = fold[u] { out += f } else { out.unicodeScalars.append(u) }
        }
        return out.precomposedStringWithCanonicalMapping
    }
}

public final class Suggester {
    struct Item { let key: [Unicode.Scalar]; let keyString: String; let word: String; let freq: Int }

    private var items: [Item] = []
    private var learned: [String: Int] = [:]
    private var freqOf: [String: Int] = [:]

    public init(entries: [(String, Int)] = []) { add(entries) }

    /// Parse engine/suggestions/data/<lang>.json: [[word, count], ...].
    public convenience init(json: Data) throws {
        let rows = (try JSONSerialization.jsonObject(with: json) as? [[Any]]) ?? []
        self.init(entries: rows.compactMap { r in
            guard r.count == 2, let w = r[0] as? String, let n = r[1] as? Int else { return nil }
            return (w, n)
        })
    }

    public static func bundled(_ lang: String) throws -> Suggester {
        guard let url = Bundle.module.url(forResource: lang, withExtension: "json", subdirectory: "Resources/dictionaries") else {
            throw NSError(domain: "Nagosi", code: 3, userInfo: [NSLocalizedDescriptionKey: "no dictionary \(lang)"])
        }
        return try Suggester(json: Data(contentsOf: url))
    }

    public var count: Int { items.count }

    // Order by scalar value, which matches the UTF-16 order used by the TypeScript port for the BMP.
    private static func less(_ a: [Unicode.Scalar], _ b: [Unicode.Scalar]) -> Bool {
        for (x, y) in zip(a, b) where x != y { return x.value < y.value }
        return a.count < b.count
    }

    public func add(_ entries: [(String, Int)]) {
        for (w, f) in entries {
            let k = Skeleton.of(w)
            items.append(Item(key: Array(k.unicodeScalars), keyString: k, word: w, freq: f))
            freqOf[w] = max(f, freqOf[w] ?? 0)
        }
        items.sort { a, b in
            if a.key != b.key { return Suggester.less(a.key, b.key) }
            return a.freq > b.freq
        }
    }

    /// Times the user chose a word (weighted heavily), then its corpus count.
    public func weight(_ word: String) -> Double { Double(learned[word] ?? 0) * 1e6 + Double(freqOf[word] ?? 0) }

    public func learn(_ word: String) {
        learned[word, default: 0] += 1
        if !items.contains(where: { $0.word == word }) { add([(word, 0)]) }
    }

    public var learnedWords: [String: Int] { learned }

    public func importLearned(_ words: [String: Int]) {
        for (w, n) in words {
            learned[w] = n
            if !items.contains(where: { $0.word == w }) { add([(w, 0)]) }
        }
    }

    public func suggest(_ composed: String, limit: Int = 5) -> [String] {
        guard !composed.isEmpty else { return [] }
        let keyString = Skeleton.of(composed)
        let key = Array(keyString.unicodeScalars)
        var lo = 0, hi = items.count
        while lo < hi {
            let mid = (lo + hi) / 2
            if Suggester.less(items[mid].key, key) { lo = mid + 1 } else { hi = mid }
        }
        var pool: [Item] = []
        var i = lo
        while i < items.count, pool.count < 20000, items[i].key.starts(with: key) {
            pool.append(items[i]); i += 1
        }
        func score(_ it: Item) -> Double {
            (it.key == key ? 1e9 : 0) + Double(learned[it.word] ?? 0) * 1e6 + Double(it.freq) + (it.word == composed ? 0.5 : 0)
        }
        pool.sort { a, b in
            let sa = score(a), sb = score(b)
            return sa != sb ? sa > sb : a.word.unicodeScalars.count < b.word.unicodeScalars.count
        }
        var out: [String] = []
        for it in pool where !out.contains(it.word) {
            out.append(it.word)
            if out.count >= limit { break }
        }
        return out
    }
}

/// INSCRIPT direct layout (key → letter).
public struct DirectLayout {
    public let rows: [[String]]
    public let shiftOf: [String: String]
    public let keys: [String: String]

    public static func bundled(_ id: String = "inscript") throws -> DirectLayout {
        guard let url = Bundle.module.url(forResource: id, withExtension: "json", subdirectory: "Resources/layouts"),
              let o = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] else {
            throw NSError(domain: "Nagosi", code: 4, userInfo: [NSLocalizedDescriptionKey: "no layout \(id)"])
        }
        return DirectLayout(rows: o["rows"] as? [[String]] ?? [], shiftOf: o["shiftOf"] as? [String: String] ?? [:],
                            keys: o["keys"] as? [String: String] ?? [:])
    }
}

/// A phone keyboard whose keys type Devanagari directly: each key is (tap, hold), hold "" when none.
/// engine/keyboards/<id>.json; the default is the Nepali traditional layout.
public struct PhoneLayout {
    public let rows: [[(String, String)]]
    public let bottom: [(String, String)]
    public let numbers: [[(String, String)]]

    public static func bundled(_ id: String = "nepali-traditional") throws -> PhoneLayout {
        guard let url = Bundle.module.url(forResource: id, withExtension: "json", subdirectory: "Resources/keyboards"),
              let o = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] else {
            throw NSError(domain: "Nagosi", code: 6, userInfo: [NSLocalizedDescriptionKey: "no keyboard \(id)"])
        }
        func keys(_ a: Any?) -> [(String, String)] {
            ((a as? [[String]]) ?? []).map { ($0.first ?? "", $0.count > 1 ? $0[1] : "") }
        }
        func grid(_ a: Any?) -> [[(String, String)]] { ((a as? [Any]) ?? []).map { keys($0) } }
        return PhoneLayout(rows: grid(o["rows"]), bottom: keys(o["bottom"]), numbers: grid(o["numbers"]))
    }
}
