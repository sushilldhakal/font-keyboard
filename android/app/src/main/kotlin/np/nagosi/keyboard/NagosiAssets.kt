package np.nagosi.keyboard

import android.content.Context
import android.graphics.Typeface
import np.nagosi.engine.Scheme
import np.nagosi.engine.Speller
import np.nagosi.engine.Suggester
import org.json.JSONObject

/** Bundled data, copied from the repository at build time (assets/nagosi/...). Cached per process. */
object NagosiAssets {
    private var typeface: Typeface? = null
    private var inscript: JSONObject? = null

    private fun read(ctx: Context, path: String) =
        ctx.assets.open("nagosi/$path").bufferedReader(Charsets.UTF_8).use { it.readText() }

    fun typeface(ctx: Context): Typeface =
        typeface ?: runCatching { Typeface.createFromAsset(ctx.assets, "nagosi/fonts/Nagosi-Variable.ttf") }
            .getOrDefault(Typeface.SERIF).also { typeface = it }

    fun scheme(ctx: Context, id: String): Scheme = Scheme.fromJson(read(ctx, "schemes/$id.json"))

    fun dictionary(ctx: Context, lang: String): Suggester = Suggester.fromJson(read(ctx, "dictionaries/$lang.json"))

    fun speller(ctx: Context): Speller = Speller.fromJson(read(ctx, "dictionaries/bigrams.json"))

    private var phone: List<List<List<String>>>? = null
    private var phoneBottom: List<List<String>>? = null
    private var phoneNumbers: List<List<List<String>>>? = null

    private fun pairs(a: org.json.JSONArray): List<List<String>> =
        (0 until a.length()).map { i -> a.getJSONArray(i).let { listOf(it.getString(0), it.getString(1)) } }

    private fun loadPhone(ctx: Context) {
        if (phone != null) return
        val o = JSONObject(read(ctx, "keyboards/nepali-traditional.json"))
        fun grid(name: String) = o.getJSONArray(name).let { rows -> (0 until rows.length()).map { pairs(rows.getJSONArray(it)) } }
        phone = grid("rows")
        phoneNumbers = grid("numbers")
        phoneBottom = pairs(o.getJSONArray("bottom"))
    }

    /** Nepali traditional phone layout: rows of [tap, hold] (engine/keyboards/nepali-traditional.json). */
    fun traditionalRows(ctx: Context): List<List<List<String>>> { loadPhone(ctx); return phone!! }
    fun traditionalNumbers(ctx: Context): List<List<List<String>>> { loadPhone(ctx); return phoneNumbers!! }
    fun traditionalBottom(ctx: Context): List<List<String>> { loadPhone(ctx); return phoneBottom!! }

    private fun layout(ctx: Context): JSONObject = inscript ?: JSONObject(read(ctx, "layouts/inscript.json")).also { inscript = it }

    fun inscript(ctx: Context): Map<String, String> {
        val keys = layout(ctx).getJSONObject("keys")
        return keys.keys().asSequence().associateWith { keys.getString(it) }
    }

    fun inscriptShift(ctx: Context): Map<String, String> {
        val s = layout(ctx).getJSONObject("shiftOf")
        return s.keys().asSequence().associateWith { s.getString(it) }
    }

    fun inscriptRows(ctx: Context): List<List<String>> {
        val rows = layout(ctx).getJSONArray("rows")
        return (0 until rows.length()).map { r ->
            val row = rows.getJSONArray(r)
            (0 until row.length()).map { row.getString(it) }
        }
    }
}
