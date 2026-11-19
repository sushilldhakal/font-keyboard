import UIKit
#if canImport(MLKitDigitalInkRecognition)
import MLKitCommon
import MLKitDigitalInkRecognition
#endif

/// Handwriting for the Nagosi keyboard: a pad the user writes Devanagari on, recognised on the
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

    init(lang: String, font: UIFont) {
        self.lang = lang
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
        show(.downloading)
        NotificationCenter.default.addObserver(forName: .mlkitModelDownloadDidSucceed, object: nil, queue: .main) { [weak self] _ in
            self?.ready(m)
        }
        NotificationCenter.default.addObserver(forName: .mlkitModelDownloadDidFail, object: nil, queue: .main) { [weak self] _ in
            self?.show(.unavailable("डाउनलोड भएन। Settings › Nagosi › Full Access खोलेर इन्टरनेट जोड्नुहोस्।"))
        }
        manager.download(m, conditions: ModelDownloadConditions(allowsCellularAccess: true, allowsBackgroundDownloading: true))
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
