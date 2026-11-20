// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "VedicNepaliEngine",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "VedicNepaliEngine", targets: ["VedicNepaliEngine"])],
    targets: [
        .target(name: "VedicNepaliEngine", resources: [.copy("Resources")]),
        .testTarget(name: "VedicNepaliEngineTests", dependencies: ["VedicNepaliEngine"]),
    ]
)
