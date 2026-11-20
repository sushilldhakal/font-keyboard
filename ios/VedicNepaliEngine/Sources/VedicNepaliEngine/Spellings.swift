import Foundation

/// Loose Romanized Nepali: spelling variants, the candidate bar and the word Space commits.
/// Port of engine/suggestions/spellings.ts (the reference; see it for the reasoning), checked
/// against tests/vectors/spellings.json. Strings are compared as UTF-16, like the TypeScript port.
public enum Spellings {
    /// Roman tokens and the strict spellings each may stand for, longest token first.
    public static let alternatives: [(String, [String])] = [
        ("chh", ["chh"]),
        ("aa", ["aa"]), ("ii", ["ii"]), ("uu", ["uu"]), ("ee", ["ee"]), ("oo", ["oo"]),
        ("ai", ["ai", "aai", "aaii"]), ("au", ["au", "aau"]),
        ("sh", ["sh", "Sh"]), ("dh", ["dh", "Dh"]), ("th", ["th", "Th"]), ("ch", ["ch", "chh"]),
        ("ri", ["ri", "rii", "R"]), ("ng", ["ng", "~g", "Mg"]),
        ("a", ["a", "aa"]), ("i", ["i", "ii"]), ("u", ["u", "uu"]), ("e", ["e", "ai"]), ("o", ["o", "au"]),
        ("d", ["d", "D"]), ("t", ["t", "T"]), ("n", ["n", "N"]), ("s", ["s", "sh", "Sh"]),
        ("b", ["b", "w"]), ("v", ["v", "b"]), ("w", ["w", "b"]),
    ]

    public static func tokenize(_ roman: String) -> [[String]] {
        let r = Array(roman.utf16)
        var out: [[String]] = []
        var i = 0
        while i < r.count {
            if let hit = alternatives.first(where: { t in
                let tt = Array(t.0.utf16)
                return i + tt.count <= r.count && Array(r[i..<(i + tt.count)]) == tt
            }) {
                out.append(hit.1)
                i += hit.0.utf16.count
            } else {
                out.append([String(utf16CodeUnits: [r[i]], count: 1)])
                i += 1
            }
        }
        return out
    }

    static func hasUpper(_ s: String) -> Bool { s.unicodeScalars.contains { $0.value >= 65 && $0.value <= 90 } }
    static func hasLower(_ s: String) -> Bool { s.unicodeScalars.contains { $0.value >= 97 && $0.value <= 122 } }

    static func wholeKey(_ word: String) -> String {
        var scalars = Array(word.unicodeScalars)
        while let last = scalars.last, last.value == 0x0902 || last.value == 0x0901 { scalars.removeLast() }
        var s = ""
        s.unicodeScalars.append(contentsOf: scalars)
        return Skeleton.of(s)
    }

    struct Lookup { var whole: [String]; var variants: [String]; var longer: [String] }

    static func lookup(_ roman: String, _ composed: String, _ scheme: Scheme, _ suggester: Suggester?, _ speller: Speller?, limit: Int = 6) -> Lookup {
        let variants = (speller != nil && scheme.id == "nepali-roman") ? speller!.variants(roman, scheme, limit: 8) : []
        var whole: [String] = []
        var longer: [String] = []
        if let suggester = suggester, !composed.isEmpty {
            let lastRoman = roman.unicodeScalars.last.map { String($0) } ?? ""
            let bareEnd = scheme.id == "nepali-roman" && !"aeiouAEIOU~M".contains(lastRoman.isEmpty ? "#" : lastRoman)
            for form in [composed] + variants {
                let key = wholeKey(form)
                for w in suggester.suggest(form, limit: limit * 2) {
                    let isWhole = wholeKey(w) == key && !(bareEnd && w.unicodeScalars.last?.value == 0x093E)
                    if isWhole { if !whole.contains(w) { whole.append(w) } } else if !longer.contains(w) { longer.append(w) }
                }
            }
            let indexed = whole.enumerated().map { ($0.offset, $0.element, suggester.weight($0.element)) }
            whole = indexed.sorted { a, b in a.2 != b.2 ? a.2 > b.2 : a.0 < b.0 }.map { $0.1 }
        }
        return Lookup(whole: whole, variants: variants, longer: longer)
    }

    /// What the candidate bar shows for the word being typed (see spellings.ts).
    public static func candidates(_ roman: String, _ composed: String, _ scheme: Scheme, _ suggester: Suggester?, _ speller: Speller?, limit: Int = 6) -> [String] {
        guard !composed.isEmpty else { return [] }
        let l = lookup(roman, composed, scheme, suggester, speller, limit: limit)
        var out: [String] = []
        func push(_ w: String) { if !w.isEmpty, !out.contains(w), out.count < limit { out.append(w) } }
        l.whole.prefix(3).forEach(push)
        l.variants.prefix(1).forEach(push)
        l.longer.prefix(2).forEach(push)
        l.whole.forEach(push)
        l.variants.prefix(2).forEach(push)
        l.longer.forEach(push)
        if out.isEmpty { push(composed) }
        return out
    }

    /// The word Space should insert: the best whole-word dictionary match, else what was typed.
    public static func commitWord(_ roman: String, _ composed: String, _ scheme: Scheme, _ suggester: Suggester?, _ speller: Speller?) -> String {
        if composed.isEmpty || roman.utf16.count < 2 || hasUpper(roman) || scheme.id != "nepali-roman" { return composed }
        func nukta(_ w: String) -> Int { w.decomposedStringWithCanonicalMapping.unicodeScalars.filter { $0.value == 0x093C }.count }
        let best = lookup(roman, composed, scheme, suggester, speller).whole.first { nukta($0) == nukta(composed) }
        guard let b = best else { return composed }
        return Array(b.decomposedStringWithCanonicalMapping.unicodeScalars) == Array(composed.decomposedStringWithCanonicalMapping.unicodeScalars) ? composed : b
    }
}

/// Ranks Devanagari spellings by letter pairs (engine/suggestions/data/bigrams.json).
public final class Speller {
    private var pair: [UInt32: Int] = [:]
    private var first: [UInt16: Int] = [:]
    private static let beamWidth = 24
    private static let alpha = 0.5
    private static let vocab = 100.0

    public init(bigrams: [String: Int]) {
        for (k, n) in bigrams {
            let u = Array(k.utf16)
            guard u.count == 2 else { continue }
            pair[UInt32(u[0]) << 16 | UInt32(u[1])] = n
            first[u[0], default: 0] += n
        }
    }

    public convenience init(json: Data) throws {
        let o = (try JSONSerialization.jsonObject(with: json) as? [String: Int]) ?? [:]
        self.init(bigrams: o)
    }

    public static func bundled() throws -> Speller {
        guard let url = Bundle.module.url(forResource: "bigrams", withExtension: "json", subdirectory: "Resources/dictionaries") else {
            throw NSError(domain: "Vedic Nepali", code: 5, userInfo: [NSLocalizedDescriptionKey: "no bigrams.json"])
        }
        return try Speller(json: Data(contentsOf: url))
    }

    public func score(_ word: String, final: Bool) -> Double {
        let s = Array(("^" + word + (final ? "$" : "")).utf16)
        var total = 0.0
        var i = 0
        while i + 1 < s.count {
            let n = Double(pair[UInt32(s[i]) << 16 | UInt32(s[i + 1])] ?? 0)
            total += log((n + Speller.alpha) / (Double(first[s[i]] ?? 0) + Speller.alpha * Speller.vocab))
            i += 1
        }
        return total
    }

    private struct Cand { let text: String; let score: Double }

    private static func before(_ a: Cand, _ b: Cand) -> Bool {
        if a.score != b.score { return a.score > b.score }
        return Array(a.text.utf16).lexicographicallyPrecedes(Array(b.text.utf16))
    }

    public func variants(_ roman: String, _ scheme: Scheme, limit: Int = 5) -> [String] {
        guard !roman.isEmpty, !Spellings.hasUpper(roman), Spellings.hasLower(roman) else { return [] }
        var beam = [Cand(text: "", score: 0)]
        for readings in Spellings.tokenize(roman) {
            var next: [Cand] = []
            for b in beam {
                for r in readings {
                    let rr = b.text + r
                    next.append(Cand(text: rr, score: score(Transliterator.transliterate(rr, scheme), final: false)))
                }
            }
            next.sort(by: Speller.before)
            beam = Array(next.prefix(Speller.beamWidth))
        }
        let done = beam.map { b -> Cand in
            let w = Transliterator.transliterate(b.text, scheme)
            return Cand(text: w, score: score(w, final: true))
        }.sorted(by: Speller.before)
        var out: [String] = []
        for d in done where !out.contains(d.text) {
            out.append(d.text)
            if out.count >= limit { break }
        }
        return out
    }
}
