package np.nagosi.engine

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class VectorTest {
    private val root = File(System.getProperty("nagosi.root") ?: "../..")
    private fun scheme(id: String) =
        Scheme.fromJson(File(root, "engine/transliteration/schemes/$id.json").readText())

    private fun cases(name: String): JSONArray =
        JSONObject(File(root, "tests/vectors/$name.json").readText()).getJSONArray("cases")

    @Test
    fun transliterationVectors() {
        val schemes = HashMap<String, Scheme>()
        val c = cases("transliteration")
        for (i in 0 until c.length()) {
            val v = c.getJSONObject(i)
            val s = schemes.getOrPut(v.getString("scheme")) { scheme(v.getString("scheme")) }
            assertEquals(v.getString("output"), Transliterator.transliterate(v.getString("input"), s), v.getString("input"))
        }
    }

    @Test
    fun skeletonVectors() {
        val c = cases("skeleton")
        for (i in 0 until c.length()) {
            val v = c.getJSONObject(i)
            assertEquals(v.getString("output"), Skeleton.of(v.getString("input")), v.getString("input"))
        }
    }

    @Test
    fun composerBackspacesByRomanKey() {
        val c = Composer(scheme("nepali-roman"))
        "namast".forEach { c.key(it.toString()) }
        assertEquals("नमस्त", c.composing)
        c.backspace()
        assertEquals("नमस", c.composing)
        "te".forEach { c.key(it.toString()) }
        assertEquals("नमस्ते ", c.key(" ").commit)
    }

    @Test
    fun suggestsFromTheNepaliDictionary() {
        val s = Suggester.fromJson(File(root, "engine/suggestions/data/ne.json").readText())
        assertTrue(s.size > 3000)
        assertTrue("सबै" in s.suggest(Transliterator.transliterate("saba", scheme("nepali-roman"))))
    }
}
