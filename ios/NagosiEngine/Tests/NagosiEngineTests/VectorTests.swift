import Foundation
import XCTest
@testable import NagosiEngine

final class VectorTests: XCTestCase {
    /// tests/vectors at the repository root (shared with the TypeScript and Kotlin ports).
    private let root = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private func cases(_ name: String) throws -> [[String: String]] {
        let data = try Data(contentsOf: root.appendingPathComponent("tests/vectors/\(name).json"))
        let o = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        return o["cases"] as! [[String: String]]
    }

    func testTransliterationVectors() throws {
        var schemes: [String: Scheme] = [:]
        for c in try cases("transliteration") {
            let id = c["scheme"]!
            if schemes[id] == nil { schemes[id] = try Scheme.bundled(id) }
            XCTAssertEqual(Transliterator.transliterate(c["input"]!, schemes[id]!), c["output"]!, c["input"]!)
        }
    }

    func testSkeletonVectors() throws {
        for c in try cases("skeleton") {
            XCTAssertEqual(Skeleton.of(c["input"]!), c["output"]!, c["input"]!)
        }
    }

    func testComposerBackspacesByRomanKey() throws {
        let c = Composer(scheme: try Scheme.bundled("nepali-roman"))
        "namast".forEach { c.key(String($0)) }
        XCTAssertEqual(c.composing, "नमस्त")
        c.backspace()
        XCTAssertEqual(c.composing, "नमस")
        "te".forEach { c.key(String($0)) }
        XCTAssertEqual(c.key(" ").commit, "नमस्ते ")
    }

    func testSuggestions() throws {
        let s = try Suggester.bundled("ne")
        XCTAssertGreaterThan(s.count, 3000)
        let typed = Transliterator.transliterate("saba", try Scheme.bundled("nepali-roman"))
        XCTAssertTrue(s.suggest(typed).contains("सबै"))
    }

    func testInscriptLayout() throws {
        let l = try DirectLayout.bundled()
        XCTAssertEqual(l.keys["k"], "क")
        XCTAssertEqual(l.keys[l.shiftOf["k"] ?? ""], "ख")
    }
}
