import CoreText
import SwiftUI

@main
struct NagosiApp: App {
    init() { FontInstaller.registerForThisApp() }
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

/// Fonts bundled in the app (ios/Fonts, copied by scripts/sync-resources.sh).
enum FontInstaller {
    static var fontURLs: [URL] {
        (Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? []).filter { $0.lastPathComponent.hasPrefix("Nagosi-") }
    }

    static func registerForThisApp() {
        CTFontManagerRegisterFontURLs(fontURLs as CFArray, .process, true, nil)
    }

    /// Installs the static weights for every app on the device (Pages, Keynote, Mail, Notes...).
    /// Needs the com.apple.developer.user-fonts entitlement ("system-installation"); iOS asks the
    /// user to confirm, and the fonts then appear under Settings → General → Fonts.
    static func installForAllApps(completion: @escaping (String) -> Void) {
        let urls = fontURLs.filter { $0.lastPathComponent != "Nagosi-Variable.ttf" }
        CTFontManagerRegisterFontURLs(urls as CFArray, .persistent, true) { errors, done in
            if done {
                let errs = (errors as? [Error]) ?? []
                DispatchQueue.main.async {
                    completion(errs.isEmpty ? "Installed \(urls.count) weights. Choose “Nagosi” in any app’s font list."
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

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("नमस्ते! नेपाली र संस्कृत लेख्नुहोस्।")
                        .font(.custom("Nagosi", size: 28))
                        .padding(.vertical, 6)
                    Text("Type Nepali and Sanskrit in any app. Works offline, without Full Access.")
                        .foregroundStyle(.secondary)
                }
                Section("Turn on the keyboard") {
                    Label("Open Settings → General → Keyboard → Keyboards", systemImage: "1.circle")
                    Label("Add New Keyboard… → Nagosi", systemImage: "2.circle")
                    Label("In any app, hold 🌐 and choose Nagosi", systemImage: "3.circle")
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    }
                }
                Section("How to type") {
                    row("Romanized Nepali", "namaste → नमस्ते · nepaal → नेपाल")
                    row("IAST (Sanskrit)", "saṃskṛtam → संस्कृतम्")
                    row("INSCRIPT", "one key, one letter")
                    Text("Tap the नेपाली key to switch style. Suggestions appear above the keys.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("Use the Nagosi font in other apps") {
                    Button("Install Nagosi fonts") {
                        FontInstaller.installForAllApps { status = $0 }
                    }
                    if let status { Text(status).font(.footnote) }
                }
                Section("Try it") {
                    TextField("यहाँ लेख्नुहोस्…", text: $sample, axis: .vertical)
                        .font(.custom("Nagosi", size: 24))
                        .lineLimit(3...8)
                }
                Section {
                    Text("Nagosi font: SIL Open Font License 1.1 · github.com/sushilldhakal/font-keyboard")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Nagosi")
        }
    }

    private func row(_ title: String, _ detail: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.headline)
            Text(detail).font(.custom("Nagosi", size: 17)).foregroundStyle(.secondary)
        }
    }
}
