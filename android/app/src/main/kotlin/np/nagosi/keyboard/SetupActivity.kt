package np.nagosi.keyboard

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
        val tf = NagosiAssets.typeface(this)
        val prefs = getSharedPreferences(NagosiIme.PREFS, Context.MODE_PRIVATE)
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

        col.addView(text("नगोसी Nagosi", 30f, bold = true))
        col.addView(text("Type Nepali and Sanskrit anywhere. Works offline.", 16f))
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
        val current = Keyboards.byId(prefs.getString(NagosiIme.KEY_KEYBOARD, null)).id
        options.forEachIndexed { i, (id, label) ->
            group.addView(RadioButton(this).apply {
                this.id = 1000 + i
                text = label
                typeface = tf
                isChecked = id == current
            })
        }
        group.setOnCheckedChangeListener { _, checkedId ->
            prefs.edit().putString(NagosiIme.KEY_KEYBOARD, options[checkedId - 1000].first).apply()
        }
        col.addView(group)
        col.addView(text("Try it", 18f, bold = true))
        col.addView(EditText(this).apply {
            typeface = tf
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
            hint = "यहाँ लेख्नुहोस्…"
            minLines = 3
        }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        col.addView(text("Nagosi font: SIL Open Font License 1.1. github.com/sushilldhakal/font-keyboard", 12f))

        setContentView(ScrollView(this).apply { addView(col) })
    }
}
