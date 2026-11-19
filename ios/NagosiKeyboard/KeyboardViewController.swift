import CoreText
import NagosiEngine
import UIKit

/// Nagosi keyboard extension. Works without Full Access: no network, everything is bundled.
///
/// Roman keys update marked (composing) text in the host field via setMarkedText. Space, return or
/// punctuation commits: for loosely typed Romanized Nepali the best dictionary word ("dhakal" →
/// ढकाल), and a Backspace straight after puts the typed word back. A suggestion tap replaces the
/// composing word. Backspace removes the last roman key while composing. Hold a roman key for its
/// related letters (d → ध ड ढ). The default Nepali traditional keys type Devanagari letters directly:
/// hold a key, or press ⇧ first, for the small letter in its corner; १२३ opens digits.
final class KeyboardViewController: UIInputViewController {
    private enum Mode: String, CaseIterable { case nepali = "nepali-roman", iast, inscript }

    private var mode: Mode = Mode(rawValue: UserDefaults.standard.string(forKey: "scheme") ?? "") ?? .nepali
    private var composer: Composer!
    private var dictionaries: [String: Suggester] = [:]
    private var inscript: DirectLayout?
    private var shift = false
    private lazy var speller: Speller? = try? Speller.bundled()
    /// Last automatic pick (text committed, roman typed), so an immediate Backspace can undo it.
    private var autoPick: (text: String, roman: String)?
    /// After an undo, the next commit keeps the typed spelling.
    private var keepStrict = false
    /// Letters are being typed directly on the कख page.
    private var direct = false
    /// Nepali traditional keys (default) or romanized keys.
    private var traditional = UserDefaults.standard.object(forKey: "traditional") as? Bool ?? true
    private var page = 0
    private lazy var phone: PhoneLayout? = try? PhoneLayout.bundled()
    private var popup: UIView?

    private let suggestionBar = UIStackView()
    private let rowsStack = UIStackView()
    private var heightConstraint: NSLayoutConstraint?

    private static let qwerty: [[String]] = [
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
        ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
        ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
        ["z", "x", "c", "v", "b", "n", "m"],
    ]
    /// What a roman key produces on its own in Romanized Nepali (labels only; same as web and Android).
    private static let romanHint: [String: String] = [
        "q": "क़", "w": "व", "e": "े", "r": "र", "t": "त", "y": "य", "u": "ु", "i": "ि", "o": "ो", "p": "प",
        "a": "ा", "s": "स", "d": "द", "f": "फ", "g": "ग", "h": "ह", "j": "ज", "k": "क", "l": "ल",
        "z": "ज़", "x": "क्ष", "c": "च", "v": "व", "b": "ब", "n": "न", "m": "म",
        "Q": "क़", "W": "व", "E": "ै", "R": "ृ", "T": "ट", "Y": "य", "U": "ू", "I": "ी", "O": "ौ", "P": "प",
        "A": "ा", "S": "श", "D": "ड", "F": "फ", "G": "ग", "H": "ः", "J": "ज", "K": "क", "L": "ळ",
        "Z": "ज़", "X": "क्ष", "C": "छ", "V": "व", "B": "ब", "N": "ण", "M": "ं",
    ]
    /// Long-press choices on a roman key: label and the roman keys it types (same as web ROMAN_MORE).
    private static let romanMore: [String: [(String, String)]] = [
        "a": [("आ ा", "aa")], "i": [("ई ी", "ii")], "u": [("ऊ ू", "uu")], "e": [("ऐ ै", "ai")], "o": [("औ ौ", "au")],
        "r": [("ऋ ृ", "R")],
        "d": [("ध", "dh"), ("ड", "D"), ("ढ", "Dh")],
        "t": [("थ", "th"), ("ट", "T"), ("ठ", "Th")],
        "n": [("ण", "N"), ("ङ", "ng"), ("ञ", "yn"), ("ं", "M"), ("ँ", "~")],
        "s": [("श", "sh"), ("ष", "Sh"), ("क्ष", "ksh")],
        "c": [("छ", "chh")],
        "k": [("ख", "kh"), ("क्ष", "ksh")],
        "g": [("घ", "gh"), ("ज्ञ", "gy")],
        "j": [("झ", "jh"), ("ज्ञ", "gy")],
        "p": [("फ", "ph")],
        "b": [("भ", "bh"), ("व", "w")],
        "h": [("ः", "H"), ("्", "_")],
        "m": [("ं", "M"), ("ँ", "~")],
        "l": [("ळ", "L")],
        "y": [("ञ", "yn")],
    ]
    private lazy var font: UIFont = {
        if let url = Bundle.main.url(forResource: "Nagosi-Variable", withExtension: "ttf") {
            CTFontManagerRegisterFontURLs([url] as CFArray, .process, true, nil)
        }
        return UIFont(name: "Nagosi", size: 22) ?? UIFont.systemFont(ofSize: 22)
    }()

    // MARK: lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        composer = Composer(scheme: (try? Scheme.bundled(romanSchemeId)) ?? (try! Scheme.bundled("nepali-roman")))
        inscript = try? DirectLayout.bundled()

        let root = UIStackView(arrangedSubviews: [makeSuggestionScroll(), rowsStack])
        root.axis = .vertical
        root.spacing = 4
        root.translatesAutoresizingMaskIntoConstraints = false
        rowsStack.axis = .vertical
        rowsStack.spacing = 8
        view.addSubview(root)
        NSLayoutConstraint.activate([
            root.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 3),
            root.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -3),
            root.topAnchor.constraint(equalTo: view.topAnchor, constant: 4),
            root.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -4),
        ])
        heightConstraint = view.heightAnchor.constraint(equalToConstant: 300)
        heightConstraint?.priority = .defaultHigh
        heightConstraint?.isActive = true
        render()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        composer.flush() // a new field: start clean
        autoPick = nil
        keepStrict = false
        direct = false
        updateSuggestions()
    }

    private var romanSchemeId: String { mode == .inscript ? "nepali-roman" : mode.rawValue }

    private var dictionary: Suggester? {
        let lang = mode == .nepali ? "ne" : "sa"
        if dictionaries[lang] == nil { dictionaries[lang] = try? Suggester.bundled(lang) }
        return dictionaries[lang]
    }

    // MARK: editing

    private func type(_ ch: String) {
        autoPick = nil
        direct = false
        if mode == .inscript {
            textDocumentProxy.insertText(inscript?.keys[ch] ?? ch)
            return
        }
        if Composer.commitKeys.contains(ch) {
            let roman = composer.buffer
            let composing = composer.composing
            let pick = keepStrict ? composing : Spellings.commitWord(roman, composing, composer.scheme, dictionary, speller)
            composer.key(ch)
            if !composing.isEmpty {
                textDocumentProxy.setMarkedText("", selectedRange: NSRange(location: 0, length: 0))
                textDocumentProxy.unmarkText()
            }
            textDocumentProxy.insertText(pick + ch)
            if pick != composing { autoPick = (pick + ch, roman) } else if !pick.isEmpty { dictionary?.learn(pick) }
            keepStrict = false
        } else {
            let r = composer.key(ch)
            textDocumentProxy.setMarkedText(r.composing, selectedRange: NSRange(location: (r.composing as NSString).length, length: 0))
        }
        updateSuggestions()
    }

    /// Text from the letter page, inserted as is.
    private func insert(_ text: String) {
        commitComposing()
        autoPick = nil
        keepStrict = false
        textDocumentProxy.insertText(text)
        direct = text.unicodeScalars.contains { (0x0900...0x097F).contains($0.value) }
        updateSuggestions()
    }

    /// Deletes `text` from just before the cursor, checking the document after each step (a
    /// deleteBackward may remove one code point or a whole cluster, depending on the host).
    private func deleteBefore(_ text: String) -> Bool {
        let before = Array((textDocumentProxy.documentContextBeforeInput ?? "").utf16)
        let t = Array(text.utf16)
        guard before.count >= t.count, Array(before.suffix(t.count)) == t else { return false }
        let target = Array(before.dropLast(t.count).suffix(24))
        for _ in 0..<(t.count + 2) {
            let now = Array((textDocumentProxy.documentContextBeforeInput ?? "").utf16)
            if target.isEmpty ? now.isEmpty : (now.count >= target.count && Array(now.suffix(target.count)) == target) { break }
            textDocumentProxy.deleteBackward()
        }
        return true
    }

    private func backspace() {
        let undo = autoPick
        autoPick = nil
        if let undo, composer.buffer.isEmpty, deleteBefore(undo.text) {
            composer.restore(undo.roman)
            let c = composer.composing
            textDocumentProxy.setMarkedText(c, selectedRange: NSRange(location: (c as NSString).length, length: 0))
            keepStrict = true
            updateSuggestions()
            return
        }
        if composer.backspace() {
            let c = composer.composing
            if c.isEmpty {
                textDocumentProxy.setMarkedText("", selectedRange: NSRange(location: 0, length: 0))
                textDocumentProxy.unmarkText()
                keepStrict = false
            } else {
                textDocumentProxy.setMarkedText(c, selectedRange: NSRange(location: (c as NSString).length, length: 0))
            }
        } else {
            textDocumentProxy.deleteBackward()
        }
        updateSuggestions()
    }

    private func directWord() -> String {
        let scalars = Array((textDocumentProxy.documentContextBeforeInput ?? "").unicodeScalars)
        var i = scalars.count
        while i > 0, (0x0900...0x0963).contains(scalars[i - 1].value) || (0x0971...0x097F).contains(scalars[i - 1].value)
            || scalars[i - 1].value == 0x200C || scalars[i - 1].value == 0x200D { i -= 1 }
        var s = ""
        s.unicodeScalars.append(contentsOf: scalars[i...])
        return s
    }

    private func choose(_ word: String) {
        autoPick = nil
        keepStrict = false
        if !composer.buffer.isEmpty {
            textDocumentProxy.setMarkedText("", selectedRange: NSRange(location: 0, length: 0))
            textDocumentProxy.unmarkText()
            textDocumentProxy.insertText(composer.choose(word))
        } else if direct {
            let run = directWord()
            if !run.isEmpty { _ = deleteBefore(run) }
            textDocumentProxy.insertText(word + " ")
            direct = false
        } else { return }
        dictionary?.learn(word)
        updateSuggestions()
    }

    private func commitComposing() {
        guard !composer.buffer.isEmpty else { return }
        let word = composer.flush()
        textDocumentProxy.setMarkedText(word, selectedRange: NSRange(location: (word as NSString).length, length: 0))
        textDocumentProxy.unmarkText()
        updateSuggestions()
    }

    private func cycleMode() {
        commitComposing()
        let all = Mode.allCases
        mode = all[(all.firstIndex(of: mode)! + 1) % all.count]
        UserDefaults.standard.set(mode.rawValue, forKey: "scheme")
        if mode != .inscript, let s = try? Scheme.bundled(mode.rawValue) { composer.scheme = s }
        shift = false
        render()
    }

    // MARK: UI

    private func makeSuggestionScroll() -> UIView {
        let scroll = UIScrollView()
        scroll.showsHorizontalScrollIndicator = false
        suggestionBar.axis = .horizontal
        suggestionBar.spacing = 6
        suggestionBar.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(suggestionBar)
        NSLayoutConstraint.activate([
            suggestionBar.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 4),
            suggestionBar.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            suggestionBar.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            suggestionBar.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            suggestionBar.heightAnchor.constraint(equalTo: scroll.frameLayoutGuide.heightAnchor),
            scroll.heightAnchor.constraint(equalToConstant: 40),
        ])
        return scroll
    }

    private func updateSuggestions() {
        suggestionBar.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let composing = composer.composing
        var words: [String] = []
        if composing.isEmpty, direct {
            let w = directWord()
            guard !w.isEmpty else { return }
            let found = dictionary?.suggest(w, limit: 40) ?? []
            let exact = found.filter { $0.hasPrefix(w) && $0 != w }
            words = Array((exact + found.filter { !exact.contains($0) }).prefix(6))
        } else {
            guard !composing.isEmpty else { return }
            words = Spellings.candidates(composer.buffer, composing, composer.scheme, dictionary, speller, limit: 6)
        }
        for word in words {
            var config = UIButton.Configuration.filled()
            config.baseBackgroundColor = .secondarySystemBackground
            config.baseForegroundColor = .label
            config.cornerStyle = .medium
            config.contentInsets = NSDirectionalEdgeInsets(top: 2, leading: 12, bottom: 2, trailing: 12)
            var t = AttributedString(word)
            t.font = font.withSize(19)
            config.attributedTitle = t
            let b = UIButton(configuration: config)
            b.addAction(UIAction { [weak self] _ in self?.choose(word) }, for: .touchUpInside)
            suggestionBar.addArrangedSubview(b)
        }
    }

    private func label(for key: String) -> (main: String, ch: String) {
        if mode == .inscript {
            let k = shift ? (inscript?.shiftOf[key] ?? key) : key
            return (inscript?.keys[k] ?? k, k)
        }
        let k = shift ? key.uppercased() : key
        if let d = Int(key) { return (String(Array("०१२३४५६७८९")[d]), key) }
        return (Self.romanHint[k] ?? k, k)
    }

    private func render() {
        popup?.removeFromSuperview()
        popup = nil
        rowsStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        heightConstraint?.constant = traditional ? 316 : 300
        rowsStack.spacing = traditional ? 6 : 8
        if traditional {
            renderTraditional()
            return
        }
        let rows = mode == .inscript ? (inscript?.rows ?? Self.qwerty) : Self.qwerty
        for (i, keyRow) in rows.enumerated() {
            var keys: [(UIButton, CGFloat)] = []
            if i == rows.count - 1 {
                keys.append((keyButton("⇧", sub: "", accent: shift) { [weak self] in
                    self?.shift.toggle(); self?.render()
                }, 1.4))
            }
            for key in keyRow {
                let (main, ch) = label(for: key)
                let b = keyButton(main, sub: ch) { [weak self] in
                    guard let self else { return }
                    self.type(ch)
                    if self.shift { self.shift = false; self.render() }
                }
                if mode == .nepali, !shift, let more = Self.romanMore[key] { addHold(b, more) }
                keys.append((b, 1))
            }
            if i == rows.count - 1 {
                keys.append((keyButton("⌫", sub: "") { [weak self] in self?.backspace() }, 1.4))
            }
            rowsStack.addArrangedSubview(row(keys, columns: Self.qwerty[0].count))
        }
        var bottom: [(UIButton, CGFloat)] = []
        addGlobe(&bottom)
        let modeName = mode == .nepali ? "नेपाली" : (mode == .iast ? "IAST" : "INSCRIPT")
        bottom.append((keyButton(modeName, sub: "") { [weak self] in self?.cycleMode() }, 1.8))
        bottom.append((keyButton("कख", sub: "") { [weak self] in self?.setTraditional(true) }, 1.2))
        bottom.append((keyButton("।", sub: "") { [weak self] in self?.type(self?.mode == .inscript ? ">" : "|") }, 1))
        bottom.append((keyButton("space", sub: "") { [weak self] in self?.type(" ") }, 3.4))
        bottom.append((keyButton("↵", sub: "", accent: true) { [weak self] in self?.type("\n") }, 1.6))
        rowsStack.addArrangedSubview(row(bottom, columns: nil))
    }

    private func setTraditional(_ on: Bool) {
        commitComposing()
        traditional = on
        page = 0
        shift = false
        UserDefaults.standard.set(on, forKey: "traditional")
        render()
    }

    private func renderTraditional() {
        guard let phone else { return }
        let rows = page == 0 ? phone.rows : phone.numbers
        for (i, keyRow) in rows.enumerated() {
            let last = i == rows.count - 1
            var keys: [(UIButton, CGFloat)] = []
            if last, page == 0 {
                keys.append((keyButton("⇧", sub: "", accent: shift, height: 44) { [weak self] in
                    self?.shift.toggle(); self?.render()
                }, 1.4))
            }
            keys += keyRow.map { (phoneKey($0.0, $0.1), 1) }
            if last { keys.append((keyButton("⌫", sub: "", height: 44) { [weak self] in self?.backspace() }, 1.4)) }
            rowsStack.addArrangedSubview(row(keys, columns: 11))
        }
        var bottom: [(UIButton, CGFloat)] = []
        bottom.append((keyButton(page == 0 ? "१२३" : "कख", sub: "", height: 44) { [weak self] in
            guard let self else { return }
            self.page = 1 - self.page
            self.shift = false
            self.render()
        }, 1.4))
        addGlobe(&bottom)
        bottom.append((keyButton("abc", sub: "", height: 44) { [weak self] in self?.setTraditional(false) }, 1.2))
        if phone.bottom.count == 2 {
            bottom.append((phoneKey(phone.bottom[0].0, phone.bottom[0].1), 1))
            bottom.append((keyButton("space", sub: "", height: 44) { [weak self] in self?.insert(" ") }, 3.6))
            bottom.append((phoneKey(phone.bottom[1].0, phone.bottom[1].1), 1))
        }
        bottom.append((keyButton("↵", sub: "", accent: true, height: 44) { [weak self] in self?.insert("\n") }, 1.5))
        rowsStack.addArrangedSubview(row(bottom, columns: nil))
    }

    /// A traditional key: big letter in the middle, the hold letter small in the top-right corner.
    /// Tap types the letter; hold (or ⇧ then tap) types the corner letter.
    private func phoneKey(_ tap: String, _ hold: String) -> UIButton {
        let shown = shift && !hold.isEmpty ? hold : tap
        let corner = shift ? (hold.isEmpty ? "" : tap) : hold
        let b = keyButton(shown, sub: "", height: 44) { [weak self] in
            guard let self else { return }
            self.insert(shown)
            if self.shift { self.shift = false; self.render() }
        }
        b.accessibilityLabel = hold.isEmpty ? tap : "\(tap), hold for \(hold)"
        if !corner.isEmpty {
            let c = UILabel()
            c.text = corner
            c.font = font.withSize(10)
            c.textColor = .secondaryLabel
            c.isUserInteractionEnabled = false
            c.translatesAutoresizingMaskIntoConstraints = false
            b.addSubview(c)
            NSLayoutConstraint.activate([
                c.topAnchor.constraint(equalTo: b.topAnchor, constant: 2),
                c.trailingAnchor.constraint(equalTo: b.trailingAnchor, constant: -3),
            ])
        }
        if !hold.isEmpty {
            let other = shift ? tap : hold
            let g = UILongPressGestureRecognizer()
            g.minimumPressDuration = 0.38
            g.addAction { [weak self] g in
                guard let self, g.state == .began else { return }
                UIDevice.current.playInputClick()
                self.insert(other)
                if self.shift { self.shift = false; self.render() }
            }
            b.addGestureRecognizer(g)
        }
        return b
    }

    private func addGlobe(_ bottom: inout [(UIButton, CGFloat)]) {
        guard needsInputModeSwitchKey else { return }
        let globe = keyButton("🌐", sub: "", height: traditional ? 44 : 46) {}
        globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        bottom.append((globe, 1.2))
    }

    /// Hold a roman key to see its related letters above it; each types its roman keys.
    private func addHold(_ b: UIButton, _ more: [(String, String)]) {
        b.accessibilityHint = "Hold for " + more.map { $0.0 }.joined(separator: " ")
        let g = UILongPressGestureRecognizer()
        g.minimumPressDuration = 0.38
        g.addAction { [weak self, weak b] g in
            guard let self, let b, g.state == .began else { return }
            self.showMore(above: b, more)
        }
        b.addGestureRecognizer(g)
    }

    private func showMore(above anchor: UIView, _ more: [(String, String)]) {
        popup?.removeFromSuperview()
        let stack = UIStackView()
        stack.axis = .horizontal
        stack.spacing = 4
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 4, leading: 4, bottom: 4, trailing: 4)
        stack.backgroundColor = .secondarySystemBackground
        stack.layer.cornerRadius = 10
        stack.layer.shadowOpacity = 0.25
        stack.layer.shadowRadius = 8
        stack.layer.shadowOffset = CGSize(width: 0, height: 3)
        for (label, keys) in more {
            let b = keyButton(label, sub: keys) { [weak self] in
                guard let self else { return }
                keys.forEach { self.type(String($0)) }
                self.popup?.removeFromSuperview()
                self.popup = nil
            }
            b.widthAnchor.constraint(equalToConstant: label.count > 2 ? 64 : 50).isActive = true
            stack.addArrangedSubview(b)
        }
        view.addSubview(stack)
        let size = stack.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
        let r = anchor.convert(anchor.bounds, to: view)
        let x = min(max(0, r.midX - size.width / 2), view.bounds.width - size.width)
        let y = max(0, r.minY - size.height - 4)
        stack.frame = CGRect(x: x, y: y, width: size.width, height: size.height)
        popup = stack
    }

    /// A row whose keys share one unit width: a key of weight 1.4 is 1.4 units wide. Letter rows use
    /// the width of a full 10-key row so shorter rows are centred instead of stretched.
    private func row(_ keys: [(UIButton, CGFloat)], columns: Int?) -> UIView {
        let line = UIStackView(arrangedSubviews: keys.map { $0.0 })
        line.axis = .horizontal
        line.spacing = 5
        line.distribution = .fill
        guard let unitKey = keys.first(where: { $0.1 == 1 })?.0 ?? keys.first?.0 else { return line }
        let unitWeight = keys.first(where: { $0.0 === unitKey })!.1
        for (b, w) in keys where b !== unitKey {
            b.widthAnchor.constraint(equalTo: unitKey.widthAnchor, multiplier: w / unitWeight).isActive = true
        }
        let wrap = UIView()
        line.translatesAutoresizingMaskIntoConstraints = false
        wrap.addSubview(line)
        NSLayoutConstraint.activate([
            line.topAnchor.constraint(equalTo: wrap.topAnchor),
            line.bottomAnchor.constraint(equalTo: wrap.bottomAnchor),
            line.centerXAnchor.constraint(equalTo: wrap.centerXAnchor),
            line.leadingAnchor.constraint(greaterThanOrEqualTo: wrap.leadingAnchor),
        ])
        if let columns {
            // unit = (full width - gaps) / columns
            unitKey.widthAnchor.constraint(equalTo: wrap.widthAnchor, multiplier: 1 / CGFloat(columns), constant: -5).isActive = true
        } else {
            line.leadingAnchor.constraint(equalTo: wrap.leadingAnchor).isActive = true
        }
        return wrap
    }

    private func keyButton(_ title: String, sub: String, accent: Bool = false, height: CGFloat = 46, action: @escaping () -> Void) -> UIButton {
        var config = UIButton.Configuration.filled()
        config.baseBackgroundColor = accent ? UIColor(red: 0.42, green: 0.18, blue: 0.64, alpha: 1) : .systemBackground
        config.baseForegroundColor = accent ? .white : .label
        config.cornerStyle = .medium
        config.contentInsets = NSDirectionalEdgeInsets(top: 2, leading: 0, bottom: 2, trailing: 0)
        var t = AttributedString(title)
        t.font = title.count > 3 ? UIFont.systemFont(ofSize: 14) : font.withSize(height < 46 ? 20 : 21)
        config.attributedTitle = t
        if !sub.isEmpty {
            var s = AttributedString(sub)
            s.font = UIFont.monospacedSystemFont(ofSize: 9, weight: .regular)
            s.foregroundColor = UIColor.secondaryLabel
            config.attributedSubtitle = s
            config.titleAlignment = .center
        }
        let b = UIButton(configuration: config)
        b.accessibilityLabel = sub.isEmpty ? title : "\(title) \(sub)"
        b.addAction(UIAction { _ in UIDevice.current.playInputClick(); action() }, for: .touchUpInside)
        b.heightAnchor.constraint(equalToConstant: height).isActive = true
        return b
    }
}

extension KeyboardViewController: UIInputViewAudioFeedback {
    var enableInputClicksWhenVisible: Bool { true }
}

private extension UIGestureRecognizer {
    /// Closure-based target for gesture recognizers.
    func addAction(_ handler: @escaping (UIGestureRecognizer) -> Void) {
        let box = GestureAction(handler)
        addTarget(box, action: #selector(GestureAction.fire(_:)))
        objc_setAssociatedObject(self, Unmanaged.passUnretained(box).toOpaque(), box, .OBJC_ASSOCIATION_RETAIN)
    }
}

private final class GestureAction: NSObject {
    let handler: (UIGestureRecognizer) -> Void
    init(_ handler: @escaping (UIGestureRecognizer) -> Void) { self.handler = handler }
    @objc func fire(_ g: UIGestureRecognizer) { handler(g) }
}
