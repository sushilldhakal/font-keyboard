package np.vedicnepali.keyboard

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.util.TypedValue
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView

/** Launcher screen: enable the keyboard, choose the input scheme, try it out. */
class SetupActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val tf = VedicNepaliAssets.typeface(this)
        val prefs = getSharedPreferences(VedicNepaliIme.PREFS, Context.MODE_PRIVATE)
        val pad = (20 * resources.displayMetrics.density).toInt()

        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 2, pad, pad)
        }
        fun text(s: String, size: Float, bold: Boolean = false) = TextView(this).apply {
            text = s
            typeface = tf
            setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
            if (bold) paint.isFakeBoldText = true
            setPadding(0, pad / 2, 0, pad / 2)
        }

        col.addView(text("वैदिक नेपाली Vedic Nepali", 30f, bold = true))
        col.addView(text("Type Nepali and Sanskrit anywhere. Everything you type is standard Unicode, so it reads correctly in any font and any app.", 16f))
        col.addView(text("1. Turn on the keyboard", 18f, bold = true))
        col.addView(Button(this).apply {
            text = "Open keyboard settings"
            setOnClickListener { startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)) }
        })
        col.addView(text("2. Switch to it", 18f, bold = true))
        col.addView(Button(this).apply {
            text = "Choose keyboard"
            setOnClickListener { (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker() }
        })
        col.addView(text("3. Keyboard (switch any time with ‹ › on the space bar)", 18f, bold = true))
        val group = RadioGroup(this)
        val options = listOf(
            "nepali-traditional" to "नेपाली: traditional keys, one key one letter",
            "nepali-roman" to "नेपाली (Roman): type as it sounds, dhakal → ढकाल",
            "vedic" to "वैदिक: Vedic Sanskrit with svara marks",
            "iast" to "Sanskrit (IAST): saṃskṛtam → संस्कृतम्",
        )
        val current = Keyboards.byId(prefs.getString(VedicNepaliIme.KEY_KEYBOARD, null)).id
        options.forEachIndexed { i, (id, label) ->
            group.addView(RadioButton(this).apply {
                this.id = 1000 + i
                text = label
                typeface = tf
                isChecked = id == current
            })
        }
        group.setOnCheckedChangeListener { _, checkedId ->
            prefs.edit().putString(VedicNepaliIme.KEY_KEYBOARD, options[checkedId - 1000].first).apply()
        }
        col.addView(group)
        col.addView(text("4. Typing", 18f, bold = true))
        col.addView(CheckBox(this).apply {
            text = "Space picks the best word (dhakal → ढकाल). Backspace right after puts back what you typed."
            isChecked = prefs.getBoolean(VedicNepaliIme.KEY_AUTO_PICK, true)
            setOnCheckedChangeListener { _, on -> prefs.edit().putBoolean(VedicNepaliIme.KEY_AUTO_PICK, on).apply() }
        })
        col.addView(Button(this).apply {
            text = "Forget learned words"
            setOnClickListener {
                prefs.edit().remove("learned_ne").remove("learned_sa")
                    .putInt(VedicNepaliIme.KEY_LEARNED_EPOCH, prefs.getInt(VedicNepaliIme.KEY_LEARNED_EPOCH, 0) + 1).apply()
                text = "Learned words forgotten"
            }
        })
        col.addView(text("✍ Handwriting: draw a word on the ✍ page. The Nepali model (about 20 MB) downloads once, then it works offline. Typing never uses the network, and nothing you type leaves the phone.", 14f))
        col.addView(text("Try it", 18f, bold = true))
        col.addView(EditText(this).apply {
            typeface = tf
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
            hint = "यहाँ लेख्नुहोस्…"
            minLines = 3
        }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        col.addView(text("Vedic Nepali font: SIL Open Font License 1.1. github.com/sushilldhakal/font-keyboard", 12f))

        setContentView(ScrollView(this).apply { addView(col) })
    }
}
