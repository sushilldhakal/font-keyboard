import UIKit
#if canImport(MLKitDigitalInkRecognition)
import MLKitCommon
import MLKitDigitalInkRecognition
#endif

/// Handwriting for the Vedic Nepali keyboard: a pad the user writes Devanagari on, recognised on the
/// device with Google ML Kit Digital Ink (Nepali model, ~20 MB, downloaded once and then offline).
///
/// ML Kit comes from CocoaPods (see ios/Podfile). Without it the pad still opens and says so.
/// Downloading the model from a keyboard needs Full Access; nothing else in the keyboard does.
final class HandwritingPad: UIView {
    enum State { case downloading, ready, unavailable(String) }

    /// Recognised candidates for the current ink, best first.
    var onCandidates: (([String]) -> Void)?
    /// The user started a new word while candidates for the last one were showing.
    var onNewWord: (() -> Void)?
    private(set) var isEmpty = true

    private let hint = UILabel()
    private var strokes: [[(CGPoint, TimeInterval)]] = []
    private var current: [(CGPoint, TimeInterval)] = []
    private let shape = CAShapeLayer()
    private var timer: Timer?
    private let lang: String

    #if canImport(MLKitDigitalInkRecognition)
    private var recognizer: DigitalInkRecognizer?
    private var model: DigitalInkRecognitionModel?
    #endif

    private let fullAccess: Bool

    init(lang: String, font: UIFont, fullAccess: Bool) {
        self.lang = lang
        self.fullAccess = fullAccess
        super.init(frame: .zero)
        backgroundColor = .systemBackground
        layer.cornerRadius = 8
        shape.strokeColor = UIColor.label.cgColor
        shape.fillColor = nil
        shape.lineWidth = 5
        shape.lineCap = .round
        shape.lineJoin = .round
        layer.addSublayer(shape)
        hint.font = font.withSize(18)
        hint.textColor = .secondaryLabel
        hint.textAlignment = .center
        hint.numberOfLines = 0
        hint.translatesAutoresizingMaskIntoConstraints = false
        addSubview(hint)
        NSLayoutConstraint.activate([
            hint.centerXAnchor.constraint(equalTo: centerXAnchor),
            hint.centerYAnchor.constraint(equalTo: centerYAnchor),
            hint.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 12),
        ])
        prepare()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    private func show(_ s: State) {
        switch s {
        case .downloading: hint.text = "हस्तलेखन मोडेल डाउनलोड हुँदैछ… (एक पटक मात्र)"
        case .ready: hint.text = "यहाँ लेख्नुहोस्…"
        case .unavailable(let why): hint.text = why
        }
    }

    private func prepare() {
        #if canImport(MLKitDigitalInkRecognition)
        guard let id = (try? DigitalInkRecognitionModelIdentifier(forLanguageTag: lang))
                ?? (try? DigitalInkRecognitionModelIdentifier(forLanguageTag: "hi")) else {
            show(.unavailable("हस्तलेखन यो भाषामा उपलब्ध छैन।")); return
        }
        let m = DigitalInkRecognitionModel(modelIdentifier: id)
        model = m
        let manager = ModelManager.modelManager()
        if manager.isModelDownloaded(m) { ready(m); return }
        guard fullAccess else {
            show(.unavailable("हस्तलेखन मोडेल एक पटक डाउनलोड गर्न Settings › General › Keyboard › Keyboards › Vedic Nepali › Allow Full Access खोल्नुहोस्।"))
            return
        }
        show(.downloading)
        InkModelLoader.shared.download(m) { [weak self] error in
            if let error {
                self?.show(.unavailable("डाउनलोड भएन (\(error))। इन्टरनेट जोडेर ✍ फेरि थिच्नुहोस्।"))
            } else {
                self?.ready(m)
            }
        }
        #else
        show(.unavailable("हस्तलेखनका लागि ML Kit चाहिन्छ (ios/Podfile)।"))
        #endif
    }

    #if canImport(MLKitDigitalInkRecognition)
    private func ready(_ m: DigitalInkRecognitionModel) {
        recognizer = DigitalInkRecognizer.digitalInkRecognizer(options: DigitalInkRecognizerOptions(model: m))
        show(.ready)
    }
    #endif

    func clear() {
        strokes = []
        current = []
        isEmpty = true
        timer?.invalidate()
        shape.path = nil
    }

    private func redraw() {
        let p = UIBezierPath()
        for s in strokes + [current] where !s.isEmpty {
            p.move(to: s[0].0)
            for pt in s.dropFirst() { p.addLine(to: pt.0) }
        }
        shape.path = p.cgPath
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let t = touches.first else { return }
        timer?.invalidate()
        if isEmpty { hint.text = ""; onNewWord?() }
        current = [(t.location(in: self), Date().timeIntervalSince1970)]
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let t = touches.first else { return }
        current.append((t.location(in: self), Date().timeIntervalSince1970))
        redraw()
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        if let t = touches.first { current.append((t.location(in: self), Date().timeIntervalSince1970)) }
        strokes.append(current)
        current = []
        isEmpty = false
        redraw()
        timer = Timer.scheduledTimer(withTimeInterval: 0.55, repeats: false) { [weak self] _ in self?.recognize() }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { touchesEnded(touches, with: event) }

    private func recognize() {
        #if canImport(MLKitDigitalInkRecognition)
        guard let recognizer else { return }
        let ink = Ink(strokes: strokes.map { s in
            Stroke(points: s.map { StrokePoint(x: Float($0.0.x), y: Float($0.0.y), t: Int($0.1 * 1000)) })
        })
        recognizer.recognize(ink: ink) { [weak self] result, _ in
            let words = result?.candidates.map { $0.text } ?? []
            var seen = Set<String>()
            DispatchQueue.main.async { self?.onCandidates?(words.filter { seen.insert($0).inserted }.prefix(6).map { $0 }) }
        }
        #endif
    }
}

#if canImport(MLKitDigitalInkRecognition)
/// One model download per keyboard process, however many times the pad is opened: later callers
/// wait for the running download, and the notification observers are removed when it ends.
final class InkModelLoader {
    static let shared = InkModelLoader()

    private var callbacks: [(String?) -> Void] = []
    private var observers: [NSObjectProtocol] = []
    private var timeout: Timer?

    func download(_ model: DigitalInkRecognitionModel, done: @escaping (String?) -> Void) {
        BackgroundSessionFix.install()
        let manager = ModelManager.modelManager()
        if manager.isModelDownloaded(model) { done(nil); return }
        callbacks.append(done)
        guard callbacks.count == 1 else { return }  // already downloading: wait for it
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: .mlkitModelDownloadDidSucceed, object: nil, queue: .main) { [weak self] _ in
            self?.finish(nil)
        })
        observers.append(center.addObserver(forName: .mlkitModelDownloadDidFail, object: nil, queue: .main) { [weak self] note in
            let error = note.userInfo?[ModelDownloadUserInfoKey.error.rawValue] as? Error
            self?.finish(error?.localizedDescription ?? "error")
        })
        // Never leave the pad saying "downloading" forever: give up after 3 minutes so ✍ can retry.
        timeout = Timer.scheduledTimer(withTimeInterval: 180, repeats: false) { [weak self] _ in
            self?.finish(manager.isModelDownloaded(model) ? nil : "timeout")
        }
        manager.download(model, conditions: ModelDownloadConditions(allowsCellularAccess: true, allowsBackgroundDownloading: false))
    }

    private func finish(_ error: String?) {
        timeout?.invalidate()
        timeout = nil
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
        let pending = callbacks
        callbacks = []
        pending.forEach { $0(error) }
    }
}

/// ML Kit downloads models through a background `URLSession`. In an app extension iOS runs a
/// background session only when its configuration names a shared container, which ML Kit doesn't
/// set, so the download never starts and the pad says "downloading" forever. This fills in the
/// keyboard's App Group for background configurations made in this process that have none.
/// (Same fix as theGBguy/nepali-unicode-keyboard, iosApp/Keyboard/MLKitHandwriting.swift.)
enum BackgroundSessionFix {
    private static var installed = false

    static func install() {
        guard !installed else { return }
        installed = true
        guard let original = class_getClassMethod(URLSessionConfiguration.self, #selector(URLSessionConfiguration.background(withIdentifier:))),
              let replacement = class_getClassMethod(URLSessionConfiguration.self, #selector(URLSessionConfiguration.vn_background(withIdentifier:)))
        else { return }
        method_exchangeImplementations(original, replacement)
    }
}

extension URLSessionConfiguration {
    @objc fileprivate class func vn_background(withIdentifier identifier: String) -> URLSessionConfiguration {
        // The implementations are exchanged, so this calls iOS's own method.
        let configuration = vn_background(withIdentifier: identifier)
        if configuration.sharedContainerIdentifier == nil {
            configuration.sharedContainerIdentifier = VedicNepaliSettings.appGroup
        }
        return configuration
    }
}
#endif
