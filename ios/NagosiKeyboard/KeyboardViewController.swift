import CoreText
import NagosiEngine
import UIKit

/// Nagosi keyboard extension. Works without Full Access: no network, everything is bundled.
///
/// Roman keys update marked (composing) text in the host field via setMarkedText; space, return or
/// punctuation commits; a suggestion tap replaces the composing word. Backspace removes the last
/// roman key while composing.
final class KeyboardViewController: UIInputViewController {
    private enum Mode: String, CaseIterable { case nepali = "nepali-roman", iast, inscript }

    private var mode: Mode = Mode(rawValue: UserDefaults.standard.string(forKey: "scheme") ?? "") ?? .nepali
    private var composer: Composer!
    private var dictionaries: [String: Suggester] = [:]
    private var inscript: DirectLayout?
    private var shift = false

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
        if mode == .inscript {
            textDocumentProxy.insertText(inscript?.keys[ch] ?? ch)
            return
        }
        let r = composer.key(ch)
        if !r.commit.isEmpty {
            textDocumentProxy.setMarkedText("", selectedRange: NSRange(location: 0, length: 0))
            textDocumentProxy.unmarkText()
            textDocumentProxy.insertText(r.commit)
            let word = r.commit.trimmingCharacters(in: CharacterSet(charactersIn: "\u{0900}"..."\u{097F}").inverted)
            if !word.isEmpty { dictionary?.learn(word) }
        } else {
            textDocumentProxy.setMarkedText(r.composing, selectedRange: NSRange(location: (r.composing as NSString).length, length: 0))
        }
        updateSuggestions()
    }

    private func backspace() {
        if composer.backspace() {
            let c = composer.composing
            if c.isEmpty {
                textDocumentProxy.setMarkedText("", selectedRange: NSRange(location: 0, length: 0))
                textDocumentProxy.unmarkText()
            } else {
                textDocumentProxy.setMarkedText(c, selectedRange: NSRange(location: (c as NSString).length, length: 0))
            }
        } else {
            textDocumentProxy.deleteBackward()
        }
        updateSuggestions()
    }

    private func choose(_ word: String) {
        textDocumentProxy.setMarkedText("", selectedRange: NSRange(location: 0, length: 0))
        textDocumentProxy.unmarkText()
        textDocumentProxy.insertText(composer.choose(word))
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
        guard !composing.isEmpty else { return }
        for word in dictionary?.suggest(composing) ?? [] {
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
        rowsStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
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
                keys.append((keyButton(main, sub: ch) { [weak self] in
                    guard let self else { return }
                    self.type(ch)
                    if self.shift { self.shift = false; self.render() }
                }, 1))
            }
            if i == rows.count - 1 {
                keys.append((keyButton("⌫", sub: "") { [weak self] in self?.backspace() }, 1.4))
            }
            rowsStack.addArrangedSubview(row(keys, columns: Self.qwerty[0].count))
        }
        var bottom: [(UIButton, CGFloat)] = []
        if needsInputModeSwitchKey {
            let globe = keyButton("🌐", sub: "") {}
            globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
            bottom.append((globe, 1.2))
        }
        let modeName = mode == .nepali ? "नेपाली" : (mode == .iast ? "IAST" : "INSCRIPT")
        bottom.append((keyButton(modeName, sub: "") { [weak self] in self?.cycleMode() }, 1.8))
        bottom.append((keyButton("।", sub: "") { [weak self] in self?.type(self?.mode == .inscript ? ">" : "|") }, 1))
        bottom.append((keyButton("space", sub: "") { [weak self] in self?.type(" ") }, 4))
        bottom.append((keyButton("↵", sub: "", accent: true) { [weak self] in self?.type("\n") }, 1.6))
        rowsStack.addArrangedSubview(row(bottom, columns: nil))
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

    private func keyButton(_ title: String, sub: String, accent: Bool = false, action: @escaping () -> Void) -> UIButton {
        var config = UIButton.Configuration.filled()
        config.baseBackgroundColor = accent ? UIColor(red: 0.42, green: 0.18, blue: 0.64, alpha: 1) : .systemBackground
        config.baseForegroundColor = accent ? .white : .label
        config.cornerStyle = .medium
        config.contentInsets = NSDirectionalEdgeInsets(top: 2, leading: 0, bottom: 2, trailing: 0)
        var t = AttributedString(title)
        t.font = title.count > 3 ? UIFont.systemFont(ofSize: 14) : font.withSize(21)
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
        b.heightAnchor.constraint(equalToConstant: 46).isActive = true
        return b
    }
}

extension KeyboardViewController: UIInputViewAudioFeedback {
    var enableInputClicksWhenVisible: Bool { true }
}
