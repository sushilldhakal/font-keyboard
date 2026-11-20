package np.vedicnepali.keyboard

import android.content.Context
import android.graphics.Typeface
import np.vedicnepali.engine.Scheme
import np.vedicnepali.engine.Speller
import np.vedicnepali.engine.Suggester
import org.json.JSONObject

/** Bundled data, copied from the repository at build time (assets/vedicnepali/...). Cached per process. */
object VedicNepaliAssets {
    private var typeface: Typeface? = null
    private var inscript: JSONObject? = null

    private fun read(ctx: Context, path: String) =
        ctx.assets.open("vedicnepali/$path").bufferedReader(Charsets.UTF_8).use { it.readText() }

    fun typeface(ctx: Context): Typeface =
        typeface ?: runCatching { Typeface.createFromAsset(ctx.assets, "vedicnepali/fonts/VedicNepali-Variable.ttf") }
            .getOrDefault(Typeface.SERIF).also { typeface = it }

    fun scheme(ctx: Context, id: String): Scheme = Scheme.fromJson(read(ctx, "schemes/$id.json"))

    fun dictionary(ctx: Context, lang: String): Suggester = Suggester.fromJson(read(ctx, "dictionaries/$lang.json"))

    fun speller(ctx: Context): Speller = Speller.fromJson(read(ctx, "dictionaries/bigrams.json"))

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
