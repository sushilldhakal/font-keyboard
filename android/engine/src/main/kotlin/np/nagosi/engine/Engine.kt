package np.nagosi.engine

import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer

/**
 * Kotlin port of engine/ (TypeScript is the reference). Same algorithm, same JSON schemes,
 * checked against the JSON files in tests/vectors. See engine/transliteration/transliterator.ts for the rules.
 */
const val HALANT = "्"

private fun nfc(s: String) = Normalizer.normalize(s, Normalizer.Form.NFC)
private fun nfd(s: String) = Normalizer.normalize(s, Normalizer.Form.NFD)

class Scheme private constructor(
    val id: String,
    val name: String,
    val finalVirama: Boolean,
    internal val table: Map<String, Entry>,
    internal val maxKey: Int,
) {
    internal enum class Kind { CONSONANT, VOWEL, MARK, SYMBOL }
    internal data class Entry(val kind: Kind, val out: String, val matra: String)

    companion object {
        /** Parse one of engine/transliteration/schemes/<id>.json. */
        fun fromJson(json: String): Scheme {
            val o = JSONObject(json)
            val table = LinkedHashMap<String, Entry>()
            fun add(arr: JSONArray, kind: Kind) {
                for (i in 0 until arr.length()) {
                    val row = arr.getJSONArray(i)
                    val key = nfc(row.getString(0))
                    if (!table.containsKey(key)) {
                        table[key] = Entry(kind, row.getString(1), if (row.length() > 2) row.getString(2) else "")
                    }
                }
            }
            add(o.getJSONArray("vowels"), Kind.VOWEL)
            add(o.getJSONArray("consonants"), Kind.CONSONANT)
            add(o.getJSONArray("marks"), Kind.MARK)
            add(o.getJSONArray("symbols"), Kind.SYMBOL)
            val maxKey = table.keys.maxOfOrNull { it.length } ?: 1
            return Scheme(o.getString("id"), o.getString("name"), o.getBoolean("finalVirama"), table, maxKey)
        }
    }
}

object Transliterator {
    fun transliterate(input: String, scheme: Scheme): String {
        val text = nfc(input)
        val out = StringBuilder()
        var bare = false
        var i = 0
        while (i < text.length) {
            var len = minOf(scheme.maxKey, text.length - i)
            var entry: Scheme.Entry? = null
            while (len > 0) {
                entry = scheme.table[text.substring(i, i + len)]
                if (entry != null) break
                len--
            }
            if (entry == null) {
                if (bare && scheme.finalVirama) out.append(HALANT)
                out.append(text[i])
                bare = false
                i += 1
                continue
            }
            when (entry.kind) {
                Scheme.Kind.CONSONANT -> {
                    if (bare) out.append(HALANT)
                    out.append(entry.out)
                    bare = true
                }
                Scheme.Kind.VOWEL -> {
                    out.append(if (bare) entry.matra else entry.out)
                    bare = false
                }
                Scheme.Kind.MARK -> {
                    out.append(entry.out)
                    bare = false
                }
                Scheme.Kind.SYMBOL -> {
                    if (bare && scheme.finalVirama) out.append(HALANT)
                    out.append(entry.out)
                    bare = false
                }
            }
            i += len
        }
        if (bare && scheme.finalVirama) out.append(HALANT)
        return out.toString()
    }
}

/** Keyboard state machine: same contract as engine/transliteration/composer.ts. */
class Composer(var scheme: Scheme) {
    data class Result(val buffer: String, val composing: String, val commit: String)

    var buffer: String = ""
        private set

    val composing: String get() = Transliterator.transliterate(buffer, scheme)

    fun key(ch: String): Result {
        if (ch in COMMIT_KEYS) {
            val word = composing
            buffer = ""
            return Result("", "", word + ch)
        }
        buffer += ch
        return Result(buffer, composing, "")
    }

    /** False when nothing was composing (the host should delete normally). */
    fun backspace(): Boolean {
        if (buffer.isEmpty()) return false
        val cps = buffer.codePoints().toArray()
        buffer = String(cps, 0, cps.size - 1)
        return true
    }

    fun flush(): String {
        val word = composing
        buffer = ""
        return word
    }

    fun choose(word: String, trailing: String = " "): String {
        buffer = ""
        return word + trailing
    }

    companion object {
        val COMMIT_KEYS = setOf(" ", "\n", "\t", ",", "?", "!", ";", ":", "\"", "(", ")", "[", "]", "{", "}", "/", "-")
    }
}

/** Phonetic folding for suggestions: same table as engine/suggestions/suggester.ts. */
object Skeleton {
    private val FOLD = mapOf(
        "ी" to "ि", "ू" to "ु", "ई" to "इ", "ऊ" to "उ", "ॄ" to "ृ", "ॠ" to "ऋ",
        "ट" to "त", "ठ" to "थ", "ड" to "द", "ढ" to "ध", "ण" to "न", "ङ" to "न", "ञ" to "न",
        "ष" to "स", "श" to "स", "व" to "ब", "ं" to "न", "ँ" to "न", "ः" to "",
        "ृ" to "रि", "ऋ" to "रि", "ै" to "े", "ऐ" to "ए", "ौ" to "ो", "औ" to "ओ",
        "्" to "", "़" to "", "‌" to "", "‍" to "",
    )

    fun of(word: String): String {
        val sb = StringBuilder()
        for (ch in nfd(nfc(word))) {
            val s = ch.toString()
            sb.append(FOLD[s] ?: s)
        }
        return nfc(sb.toString())
    }
}

class Suggester(entries: List<Pair<String, Int>> = emptyList()) {
    private data class Item(val key: String, val word: String, val freq: Int)

    private var items = mutableListOf<Item>()
    private val learned = HashMap<String, Int>()

    init { add(entries) }

    val size get() = items.size

    fun add(entries: List<Pair<String, Int>>) {
        entries.forEach { (w, f) -> items.add(Item(Skeleton.of(w), w, f)) }
        items.sortWith(compareBy<Item> { it.key }.thenByDescending { it.freq })
    }

    fun learn(word: String) {
        learned[word] = (learned[word] ?: 0) + 1
        if (items.none { it.word == word }) add(listOf(word to 0))
    }

    fun learnedWords(): Map<String, Int> = learned.toMap()

    fun importLearned(words: Map<String, Int>) {
        words.forEach { (w, n) ->
            learned[w] = n
            if (items.none { it.word == w }) add(listOf(w to 0))
        }
    }

    fun suggest(composed: String, limit: Int = 5): List<String> {
        if (composed.isEmpty()) return emptyList()
        val key = Skeleton.of(composed)
        var lo = 0
        var hi = items.size
        while (lo < hi) {
            val mid = (lo + hi) ushr 1
            if (items[mid].key < key) lo = mid + 1 else hi = mid
        }
        val pool = ArrayList<Item>()
        var i = lo
        while (i < items.size && pool.size < 4000 && items[i].key.startsWith(key)) pool.add(items[i++])
        fun score(it: Item): Double =
            (if (it.word == composed) 1e12 else 0.0) + (if (it.key == key) 1e9 else 0.0) +
                (learned[it.word] ?: 0) * 1e6 + it.freq
        pool.sortWith(compareByDescending<Item> { score(it) }.thenBy { it.word.length })
        return pool.map { it.word }.distinct().take(limit)
    }

    companion object {
        /** Parse engine/suggestions/data/<lang>.json: [[word, count], ...]. */
        fun fromJson(json: String): Suggester {
            val arr = JSONArray(json)
            val list = ArrayList<Pair<String, Int>>(arr.length())
            for (i in 0 until arr.length()) {
                val row = arr.getJSONArray(i)
                list.add(row.getString(0) to row.getInt(1))
            }
            return Suggester(list)
        }
    }
}
