import CoreText
import SwiftUI

@main
struct VedicNepaliApp: App {
    init() { FontInstaller.registerForThisApp() }
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

/// Fonts bundled in the app (ios/Fonts, copied by scripts/sync-resources.sh).
enum FontInstaller {
    static var fontURLs: [URL] {
        (Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? []).filter { $0.lastPathComponent.hasPrefix("VedicNepali-") }
    }

    static func registerForThisApp() {
        CTFontManagerRegisterFontURLs(fontURLs as CFArray, .process, true, nil)
    }

    /// Installs the static weights for every app on the device (Pages, Keynote, Mail, Notes...).
    /// Needs the com.apple.developer.user-fonts entitlement ("system-installation"); iOS asks the
    /// user to confirm, and the fonts then appear under Settings → General → Fonts.
    static func installForAllApps(completion: @escaping (String) -> Void) {
        let urls = fontURLs.filter { $0.lastPathComponent != "VedicNepali-Variable.ttf" }
        CTFontManagerRegisterFontURLs(urls as CFArray, .persistent, true) { errors, done in
            if done {
                let errs = (errors as? [Error]) ?? []
                DispatchQueue.main.async {
                    completion(errs.isEmpty ? "Installed \(urls.count) weights. Choose “Vedic Nepali” in any app’s font list."
                                            : "Not installed: \(errs.first!.localizedDescription)")
                }
            }
            return true
        }
    }
}

struct ContentView: View {
    @State private var sample = ""
    @State private var status: String?
    @State private var keyboard = VedicNepaliSettings.keyboard ?? VedicNepaliSettings.keyboards[0].id
    @State private var autoPick = VedicNepaliSettings.autoPick
    @State private var forgot = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("नमस्ते! नेपाली र संस्कृत लेख्नुहोस्।")
                        .font(.custom("Vedic Nepali", size: 28))
                        .padding(.vertical, 6)
                    Text("Type Nepali and Sanskrit in any app. Everything you type is standard Unicode, so it reads correctly in any font.")
                        .foregroundStyle(.secondary)
                }
                Section("Turn on the keyboard") {
                    Label("Open Settings → General → Keyboard → Keyboards", systemImage: "1.circle")
                    Label("Add New Keyboard… → Vedic Nepali", systemImage: "2.circle")
                    Label("In any app, hold 🌐 and choose Vedic Nepali", systemImage: "3.circle")
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    }
                }
                Section {
                    Picker("Keyboard", selection: $keyboard) {
                        ForEach(VedicNepaliSettings.keyboards, id: \.id) { k in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(k.label).font(.custom("Vedic Nepali", size: 18))
                                Text(k.detail).font(.footnote).foregroundStyle(.secondary)
                            }.tag(k.id)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                    .onChange(of: keyboard) { VedicNepaliSettings.keyboard = $0 }
                } header: {
                    Text("Keyboard")
                } footer: {
                    Text("Switch any time with ‹ › on the space bar.")
                }
                Section {
                    Toggle("Space picks the best word", isOn: $autoPick)
                        .onChange(of: autoPick) { VedicNepaliSettings.autoPick = $0 }
                    Button(forgot ? "Learned words forgotten" : "Forget learned words", role: .destructive) {
                        VedicNepaliSettings.forgetLearned()
                        forgot = true
                    }
                    .disabled(forgot)
                } header: {
                    Text("Typing")
                } footer: {
                    Text("dhakal → ढकाल when you press space. Backspace right after puts back what you typed. Words you pick are remembered on this device only.")
                }
                Section {
                    Text("Tap ✍ on the keyboard and draw a word. Recognition runs on the device. The Nepali model (about 20 MB) downloads once, which needs Allow Full Access for Vedic Nepali; after that it works offline. Typing never uses the network and nothing you type leaves the device.")
                        .font(.footnote)
                } header: {
                    Text("Handwriting")
                }
                Section("Use the Vedic Nepali font in other apps") {
                    Button("Install Vedic Nepali fonts") {
                        FontInstaller.installForAllApps { status = $0 }
                    }
                    if let status { Text(status).font(.footnote) }
                }
                Section("Try it") {
                    TextField("यहाँ लेख्नुहोस्…", text: $sample, axis: .vertical)
                        .font(.custom("Vedic Nepali", size: 24))
                        .lineLimit(3...8)
                }
                Section {
                    Text("Vedic Nepali font: SIL Open Font License 1.1 · github.com/sushilldhakal/font-keyboard")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Vedic Nepali")
        }
    }
}
