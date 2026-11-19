// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "NagosiEngine",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "NagosiEngine", targets: ["NagosiEngine"])],
    targets: [
        .target(name: "NagosiEngine", resources: [.copy("Resources")]),
        .testTarget(name: "NagosiEngineTests", dependencies: ["NagosiEngine"]),
    ]
)
