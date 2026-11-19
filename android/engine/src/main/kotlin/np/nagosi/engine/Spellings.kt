package np.nagosi.engine

import org.json.JSONObject
import java.text.Normalizer
import kotlin.math.ln

/**
 * Loose Romanized Nepali: spelling variants, the candidate bar and the word Space commits.
 * Port of engine/suggestions/spellings.ts (the reference; see it for the reasoning), checked
 * against tests/vectors/spellings.json.
 */
object Spellings {
    /** Roman tokens and the strict spellings each may stand for, longest token first. */
    val ALTERNATIVES: List<Pair<String, List<String>>> = listOf(
        "chh" to listOf("chh"),
        "aa" to listOf("aa"), "ii" to listOf("ii"), "uu" to listOf("uu"), "ee" to listOf("ee"), "oo" to listOf("oo"),
        "ai" to listOf("ai", "aai", "aaii"), "au" to listOf("au", "aau"),
        "sh" to listOf("sh", "Sh"), "dh" to listOf("dh", "Dh"), "th" to listOf("th", "Th"), "ch" to listOf("ch", "chh"),
        "ri" to listOf("ri", "rii", "R"), "ng" to listOf("ng", "~g", "Mg"),
        "a" to listOf("a", "aa"), "i" to listOf("i", "ii"), "u" to listOf("u", "uu"), "e" to listOf("e", "ai"), "o" to listOf("o", "au"),
        "d" to listOf("d", "D"), "t" to listOf("t", "T"), "n" to listOf("n", "N"), "s" to listOf("s", "sh", "Sh"),
        "b" to listOf("b", "w"), "v" to listOf("v", "b"), "w" to listOf("w", "b"),
    )

    fun tokenize(roman: String): List<List<String>> {
        val out = ArrayList<List<String>>()
        var i = 0
        while (i < roman.length) {
            val hit = ALTERNATIVES.firstOrNull { roman.startsWith(it.first, i) }
            if (hit != null) {
                out.add(hit.second)
                i += hit.first.length
            } else {
                out.add(listOf(roman[i].toString()))
                i += 1
            }
        }
        return out
    }

    private class Lookup(val whole: List<String>, val variants: List<String>, val longer: List<String>)

    private val FINAL_NASAL = Regex("[ंँ]+$")
    private fun wholeKey(word: String) = Skeleton.of(word.replace(FINAL_NASAL, ""))

    private fun lookup(roman: String, composed: String, scheme: Scheme, suggester: Suggester?, speller: Speller?, limit: Int = 6): Lookup {
        val variants = if (speller != null && scheme.id == "nepali-roman") speller.variants(roman, scheme, 8) else emptyList()
        val whole = ArrayList<String>()
        val longer = ArrayList<String>()
        if (suggester != null && composed.isNotEmpty()) {
            val bareEnd = scheme.id == "nepali-roman" && !Regex("[aeiouAEIOU~M]$").containsMatchIn(roman)
            for (form in listOf(composed) + variants) {
                val key = wholeKey(form)
                for (w in suggester.suggest(form, limit * 2)) {
                    val isWhole = wholeKey(w) == key && !(bareEnd && w.endsWith("ा"))
                    val list = if (isWhole) whole else longer
                    if (w !in list) list.add(w)
                }
            }
            val order = whole.withIndex().associate { it.value to it.index }
            whole.sortWith(compareByDescending<String> { suggester.weight(it) }.thenBy { order[it]!! })
        }
        return Lookup(whole, variants, longer)
    }

    /** What the candidate bar shows for the word being typed (see spellings.ts). */
    fun candidates(roman: String, composed: String, scheme: Scheme, suggester: Suggester?, speller: Speller?, limit: Int = 6): List<String> {
        if (composed.isEmpty()) return emptyList()
        val l = lookup(roman, composed, scheme, suggester, speller, limit)
        val out = ArrayList<String>()
        fun push(w: String) {
            if (w.isNotEmpty() && w !in out && out.size < limit) out.add(w)
        }
        l.whole.take(3).forEach(::push)
        l.variants.take(1).forEach(::push)
        l.longer.take(2).forEach(::push)
        l.whole.forEach(::push)
        l.variants.take(2).forEach(::push)
        l.longer.forEach(::push)
        if (out.isEmpty()) push(composed)
        return out
    }

    /** The word Space should insert: the best whole-word dictionary match, else what was typed. */
    fun commitWord(roman: String, composed: String, scheme: Scheme, suggester: Suggester?, speller: Speller?): String {
        if (composed.isEmpty() || roman.length < 2 || roman.any { it in 'A'..'Z' } || scheme.id != "nepali-roman") return composed
        fun nukta(w: String) = Normalizer.normalize(w, Normalizer.Form.NFD).count { it == '़' }
        val best = lookup(roman, composed, scheme, suggester, speller).whole.firstOrNull { nukta(it) == nukta(composed) }
        return if (best == null ||
            Normalizer.normalize(best, Normalizer.Form.NFD) == Normalizer.normalize(composed, Normalizer.Form.NFD)
        ) composed else best
    }
}

/** Ranks Devanagari spellings by letter pairs (engine/suggestions/data/bigrams.json). */
class Speller(bigrams: Map<String, Int>) {
    private val pair = HashMap<String, Int>()
    private val first = HashMap<Char, Int>()

    init {
        for ((k, n) in bigrams) {
            pair[k] = n
            first[k[0]] = (first[k[0]] ?: 0) + n
        }
    }

    fun score(word: String, final: Boolean): Double {
        val s = "^" + word + (if (final) "$" else "")
        var total = 0.0
        for (i in 0 until s.length - 1) {
            val n = pair[s.substring(i, i + 2)] ?: 0
            total += ln((n + ALPHA) / ((first[s[i]] ?: 0) + ALPHA * VOCAB))
        }
        return total
    }

    private class Cand(val text: String, val score: Double)

    private val byScore = Comparator<Cand> { a, b ->
        val d = b.score.compareTo(a.score)
        if (d != 0) d else a.text.compareTo(b.text)
    }

    fun variants(roman: String, scheme: Scheme, limit: Int = 5): List<String> {
        if (roman.isEmpty() || roman.any { it in 'A'..'Z' } || roman.none { it in 'a'..'z' }) return emptyList()
        var beam = listOf(Cand("", 0.0))
        for (readings in Spellings.tokenize(roman)) {
            val next = ArrayList<Cand>()
            for (b in beam) for (r in readings) {
                val rr = b.text + r
                next.add(Cand(rr, score(Transliterator.transliterate(rr, scheme), false)))
            }
            next.sortWith(byScore)
            beam = next.take(BEAM)
        }
        val done = beam.map { val w = Transliterator.transliterate(it.text, scheme); Cand(w, score(w, true)) }.sortedWith(byScore)
        val out = ArrayList<String>()
        for (d in done) {
            if (d.text !in out) out.add(d.text)
            if (out.size >= limit) break
        }
        return out
    }

    companion object {
        private const val BEAM = 24
        private const val ALPHA = 0.5
        private const val VOCAB = 100

        fun fromJson(json: String): Speller {
            val o = JSONObject(json)
            val m = HashMap<String, Int>()
            for (k in o.keys()) m[k] = o.getInt(k)
            return Speller(m)
        }
    }
}
