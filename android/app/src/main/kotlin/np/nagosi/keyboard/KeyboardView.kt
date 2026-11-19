package np.nagosi.keyboard

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView

/** Keyboard UI built in code: a suggestion strip, four letter rows and a bottom row. */
@SuppressLint("ViewConstructor")
class KeyboardView(
    context: Context,
    private val typeface: Typeface,
    private val listener: Listener,
) : LinearLayout(context) {

    interface Listener {
        fun onKey(ch: String)
        fun onBackspace()
        fun onSuggestion(word: String)
        fun onSwitchScheme()
        fun onNextKeyboard()
        fun onEnter()
    }

    private val dark = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    private val bg = if (dark) 0xFF24212C.toInt() else 0xFFECEBF0.toInt()
    private val keyBg = if (dark) 0xFF34303E.toInt() else Color.WHITE
    private val ink = if (dark) 0xFFECE9F3.toInt() else 0xFF1D1B26.toInt()
    private val sub = if (dark) 0xFFA29EB0.toInt() else 0xFF8A8698.toInt()
    private val accent = if (dark) 0xFFC79CF0.toInt() else 0xFF6B2FA3.toInt()

    private val strip = LinearLayout(context)
    private val rowsBox = LinearLayout(context)
    private var shift = false
    private var scheme = "nepali-roman"

    init {
        orientation = VERTICAL
        setBackgroundColor(bg)
        setPadding(dp(4), dp(4), dp(4), dp(6))
        val scroll = HorizontalScrollView(context).apply {
            isHorizontalScrollBarEnabled = false
            addView(strip)
        }
        strip.orientation = HORIZONTAL
        strip.gravity = Gravity.CENTER_VERTICAL
        addView(scroll, LayoutParams(LayoutParams.MATCH_PARENT, dp(44)))
        rowsBox.orientation = VERTICAL
        addView(rowsBox)
        render()
    }

    fun setScheme(id: String) {
        scheme = id
        shift = false
        render()
        showSuggestions("", emptyList())
    }

    fun showSuggestions(composing: String, words: List<String>) {
        strip.removeAllViews()
        if (composing.isNotEmpty()) {
            strip.addView(TextView(context).apply {
                text = composing
                typeface = this@KeyboardView.typeface
                setTextColor(accent)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
                setPadding(dp(12), 0, dp(12), 0)
            })
        }
        for (w in words) {
            strip.addView(TextView(context).apply {
                text = w
                typeface = this@KeyboardView.typeface
                setTextColor(ink)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 19f)
                setPadding(dp(14), dp(4), dp(14), dp(4))
                background = rounded(keyBg)
                setOnClickListener { listener.onSuggestion(w) }
            }, LayoutParams(LayoutParams.WRAP_CONTENT, dp(36)).apply { marginEnd = dp(6) })
        }
    }

    private fun rows(): List<List<String>> = if (scheme == "inscript") NagosiAssets.inscriptRows(context) else QWERTY

    private fun label(k: String): Pair<String, String> {
        if (scheme == "inscript") {
            val key = if (shift) NagosiAssets.inscriptShift(context)[k] ?: k else k
            return (NagosiAssets.inscript(context)[key] ?: key) to key
        }
        val key = if (shift) k.uppercase() else k
        if (k[0].isDigit()) return "०१२३४५६७८९"[k[0] - '0'].toString() to k
        return (ROMAN_HINT[key] ?: key) to key
    }

    private fun render() {
        rowsBox.removeAllViews()
        val rs = rows()
        rs.forEachIndexed { i, row ->
            val line = row()
            if (i == rs.lastIndex) line.addView(key("⇧", "", 1.5f, if (shift) accent else keyBg) { shift = !shift; render() })
            for (k in row) {
                val (main, ch) = label(k)
                line.addView(key(main, ch, 1f, keyBg) {
                    listener.onKey(ch)
                    if (shift) { shift = false; render() }
                })
            }
            if (i == rs.lastIndex) line.addView(key("⌫", "", 1.5f, keyBg, repeat = true) { listener.onBackspace() })
            rowsBox.addView(line)
        }
        val bottom = row()
        val schemeLabel = when (scheme) { "nepali-roman" -> "नेपाली"; "iast" -> "IAST"; else -> "INSCRIPT" }
        bottom.addView(key("🌐", "", 1.2f, keyBg) { listener.onNextKeyboard() })
        bottom.addView(key(schemeLabel, "", 1.6f, keyBg) { listener.onSwitchScheme() })
        bottom.addView(key("।", "", 1f, keyBg) { listener.onKey(if (scheme == "inscript") ">" else "|") })
        bottom.addView(key("space", "", 4f, keyBg) { listener.onKey(" ") })
        bottom.addView(key("↵", "", 1.5f, accent) { listener.onEnter() })
        rowsBox.addView(bottom)
    }

    private fun row() = LinearLayout(context).apply {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun key(main: String, small: String, weight: Float, color: Int, repeat: Boolean = false, onPress: () -> Unit): View {
        val box = LinearLayout(context).apply {
            orientation = VERTICAL
            gravity = Gravity.CENTER
            background = rounded(color)
            contentDescription = if (small.isNotEmpty()) "$main $small" else main
            isClickable = true
            isFocusable = true
        }
        box.addView(TextView(context).apply {
            text = main
            typeface = this@KeyboardView.typeface
            setTextColor(if (color == accent) Color.WHITE else ink)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, if (main.length > 3) 14f else 21f)
            gravity = Gravity.CENTER
            includeFontPadding = false
        })
        if (small.isNotEmpty()) {
            box.addView(TextView(context).apply {
                text = small
                setTextColor(sub)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
                gravity = Gravity.CENTER
            })
        }
        if (repeat) {
            val repeater = object : Runnable {
                override fun run() { onPress(); box.postDelayed(this, 60) }
            }
            box.setOnTouchListener { v, e ->
                when (e.action) {
                    MotionEvent.ACTION_DOWN -> { v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); onPress(); v.postDelayed(repeater, 400) }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> v.removeCallbacks(repeater)
                }
                true
            }
        } else {
            box.setOnClickListener { it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); onPress() }
        }
        box.layoutParams = LayoutParams(0, dp(52), weight).apply { setMargins(dp(2), dp(3), dp(2), dp(3)) }
        return box
    }

    private fun rounded(color: Int) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(7).toFloat()
    }

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    companion object {
        val QWERTY = listOf(
            listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "0"),
            listOf("q", "w", "e", "r", "t", "y", "u", "i", "o", "p"),
            listOf("a", "s", "d", "f", "g", "h", "j", "k", "l"),
            listOf("z", "x", "c", "v", "b", "n", "m"),
        )

        /** What a roman key produces on its own in Romanized Nepali (labels only; same as web). */
        val ROMAN_HINT = mapOf(
            "q" to "क़", "w" to "व", "e" to "े", "r" to "र", "t" to "त", "y" to "य", "u" to "ु", "i" to "ि", "o" to "ो", "p" to "प",
            "a" to "ा", "s" to "स", "d" to "द", "f" to "फ", "g" to "ग", "h" to "ह", "j" to "ज", "k" to "क", "l" to "ल",
            "z" to "ज़", "x" to "क्ष", "c" to "च", "v" to "व", "b" to "ब", "n" to "न", "m" to "म",
            "Q" to "क़", "W" to "व", "E" to "ै", "R" to "ृ", "T" to "ट", "Y" to "य", "U" to "ू", "I" to "ी", "O" to "ौ", "P" to "प",
            "A" to "ा", "S" to "श", "D" to "ड", "F" to "फ", "G" to "ग", "H" to "ः", "J" to "ज", "K" to "क", "L" to "ळ",
            "Z" to "ज़", "X" to "क्ष", "C" to "छ", "V" to "व", "B" to "ब", "N" to "ण", "M" to "ं",
        )
    }
}
