package np.nagosi.keyboard

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** One keyboard the space bar's ‹ › arrows switch to (same list as web KEYBOARDS). */
data class KeyboardChoice(val id: String, val label: String, val phone: Boolean, val lang: String)

/** A letter key: tap, hold ("" when none), shift ("" = follow the layout's shift rule). */
data class PhoneKey(val tap: String, val hold: String, val shift: String)

/** A phone layout from engine/keyboards/<id>.json. */
class PhoneLayout(
    val rows: List<List<PhoneKey>>,
    val bottom: List<PhoneKey>,
    val numbers: List<List<PhoneKey>>,
    /** ⇧ changes only keys with a shift value (Vedic) instead of showing every hold letter. */
    val shiftExplicit: Boolean,
) {
    /** What ⇧ turns a key into ("" = unchanged). */
    fun shifted(k: PhoneKey): String = k.shift.ifEmpty { if (shiftExplicit) "" else k.hold }
}

object Keyboards {
    val ALL = listOf(
        KeyboardChoice("nepali-traditional", "नेपाली", phone = true, lang = "ne"),
        KeyboardChoice("nepali-roman", "नेपाली (Roman)", phone = false, lang = "ne"),
        KeyboardChoice("vedic", "वैदिक", phone = true, lang = "sa"),
        KeyboardChoice("iast", "Sanskrit (IAST)", phone = false, lang = "sa"),
    )

    fun byId(id: String?): KeyboardChoice = ALL.firstOrNull { it.id == id } ?: ALL[0]

    fun next(id: String, step: Int): KeyboardChoice {
        val i = ALL.indexOfFirst { it.id == id }.coerceAtLeast(0)
        return ALL[(i + step + ALL.size) % ALL.size]
    }

    /** The roman scheme physical keys use on this keyboard. */
    fun romanScheme(c: KeyboardChoice): String = if (!c.phone) c.id else if (c.lang == "sa") "iast" else "nepali-roman"

    private val cache = HashMap<String, PhoneLayout>()

    fun phone(ctx: Context, id: String): PhoneLayout = cache.getOrPut(id) {
        val o = JSONObject(ctx.assets.open("nagosi/keyboards/$id.json").bufferedReader(Charsets.UTF_8).use { it.readText() })
        fun keys(a: JSONArray) = (0 until a.length()).map { i ->
            val k = a.getJSONArray(i)
            PhoneKey(k.getString(0), if (k.length() > 1) k.getString(1) else "", if (k.length() > 2) k.getString(2) else "")
        }
        fun grid(name: String) = o.getJSONArray(name).let { r -> (0 until r.length()).map { keys(r.getJSONArray(it)) } }
        PhoneLayout(grid("rows"), keys(o.getJSONArray("bottom")), grid("numbers"), o.optString("shift") == "explicit")
    }
}
