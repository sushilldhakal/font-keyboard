import Foundation

/// Settings shared by the Vedic Nepali app (where the reader changes them) and the keyboard extension
/// (which reads them). Both targets carry the App Group entitlement below; without it (an unsigned
/// simulator build) each side falls back to its own defaults and the keyboard still works.
enum VedicNepaliSettings {
    static let appGroup = "group.np.vedicnepali.keyboard"
    static let defaults: UserDefaults = UserDefaults(suiteName: appGroup) ?? .standard

    /// The keyboards, in the order the keyboard's ⚙ panel lists them.
    static let keyboards: [(id: String, label: String, detail: String)] = [
        ("nepali-traditional", "नेपाली", "Traditional keys: tap the big letter, hold for the small one"),
        ("nepali-roman", "नेपाली (Roman)", "Type as it sounds: dhakal → ढकाल, with suggestions"),
        ("english", "English", "Plain English QWERTY"),
    ]

    /// The chosen keyboard; one that no longer exists (the old Vedic and IAST ones) reads as nil.
    static var keyboard: String? {
        get { defaults.string(forKey: "keyboard").flatMap { id in keyboards.contains { $0.id == id } ? id : nil } }
        set { defaults.set(newValue, forKey: "keyboard") }
    }

    /// Space takes the best dictionary word for loosely typed roman (default on).
    static var autoPick: Bool {
        get { defaults.object(forKey: "autoPick") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "autoPick") }
    }

    static func learned(_ lang: String) -> [String: Int] {
        defaults.dictionary(forKey: "learned_\(lang)") as? [String: Int] ?? [:]
    }

    static func saveLearned(_ lang: String, _ words: [String: Int]) {
        defaults.set(words, forKey: "learned_\(lang)")
    }

    /// Bumped by "Forget learned words", so a running keyboard drops what it holds.
    static var learnedEpoch: Int { defaults.integer(forKey: "learnedEpoch") }

    static func forgetLearned() {
        for lang in ["ne", "sa"] { defaults.removeObject(forKey: "learned_\(lang)") }
        defaults.set(learnedEpoch + 1, forKey: "learnedEpoch")
    }
}
