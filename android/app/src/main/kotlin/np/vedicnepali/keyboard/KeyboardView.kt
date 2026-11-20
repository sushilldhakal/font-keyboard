package np.vedicnepali.keyboard

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
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.TextView

/**
 * Keyboard UI built in code: a suggestion strip, the key rows and a bottom row.
 *
 * Several keyboards, switched with the ‹ › arrows on the space bar (Keyboards.ALL): नेपाली (Nepali
 * traditional keys: tap for the letter, hold or ⇧ for the small letter in its corner), नेपाली (Roman),
 * वैदिक (Vedic Sanskrit: ⇧ turns vowels into signs) and Sanskrit (IAST). १२३ opens digits. Same
 * layouts as web/keyboard/src/keyboard.ts.
 */
@SuppressLint("ViewConstructor")
class KeyboardView(
    context: Context,
    private val typeface: Typeface,
    private val listener: Listener,
) : LinearLayout(context) {

    interface Listener {
        fun onKey(ch: String)
        fun onInsert(text: String)
        fun onBackspace()
        fun onSuggestion(word: String)
        fun onNextKeyboard()
        fun onEnter()
        /** The space-bar arrows switched to another keyboard. */
        fun onSwitch(choice: KeyboardChoice)
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
    /** The keyboard on screen (a Keyboards.ALL id). */
    var keyboard: KeyboardChoice = Keyboards.ALL[0]
        set(v) {
            if (field.lang != v.lang) release()
            field = v; page = 0; shift = false; writing = false; render(); showSuggestions("", emptyList())
        }
    private var page = 0
    private var popup: PopupWindow? = null

    /** Handwriting panel open (✍ key). */
    private var writing = false
    private var handwriting: Handwriting? = null
    private var pad: InkPad? = null
    private var inkWords: List<String> = emptyList()
    private val padHint = TextView(context)

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

    fun showSuggestions(composing: String, words: List<String>) {
        if (writing) return
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

    private fun label(k: String): Pair<String, String> {
        val key = if (shift) k.uppercase() else k
        if (k[0].isDigit()) return "०१२३४५६७८९"[k[0] - '0'].toString() to k
        if (keyboard.id == "iast") return key to key
        return (ROMAN_HINT[key] ?: key) to key
    }

    private fun render() {
        popup?.dismiss()
        rowsBox.removeAllViews()
        if (writing) {
            renderWriting()
            return
        }
        if (keyboard.phone) {
            renderPhone(Keyboards.phone(context, keyboard.id))
            return
        }
        val rs = QWERTY
        rs.forEachIndexed { i, row ->
            val line = row()
            if (i == rs.lastIndex) line.addView(key("⇧", "", 1.5f, if (shift) accent else keyBg) { shift = !shift; render() })
            for (k in row) {
                val (main, ch) = label(k)
                val more = if (keyboard.id == "nepali-roman" && !shift) ROMAN_MORE[k] else null
                line.addView(key(main, ch, 1f, keyBg, more = more) {
                    listener.onKey(ch)
                    if (shift) { shift = false; render() }
                })
            }
            if (i == rs.lastIndex) line.addView(key("⌫", "", 1.5f, keyBg, repeat = true) { listener.onBackspace() })
            rowsBox.addView(line)
        }
        val bottom = row()
        bottom.addView(key("🌐", "", 1.2f, keyBg) { listener.onNextKeyboard() })
        bottom.addView(key("✍", "", 1f, keyBg) { openWriting() })
        bottom.addView(key(",", "", 1f, keyBg) { listener.onKey(",") })
        bottom.addView(spaceBar(4.6f) { listener.onKey(" ") })
        bottom.addView(key("।", "", 1f, keyBg) { listener.onKey("|") })
        bottom.addView(key("↵", "", 1.5f, accent) { listener.onEnter() })
        rowsBox.addView(bottom)
    }

    // ---------------------------------------------------------------- handwriting

    private fun openWriting() {
        writing = true
        render()
    }

    private fun closeWriting() {
        commitInk(null)
        writing = false
        pad = null
        render()
    }

    /** Insert a recognised word (the first candidate when [word] is null) and clear the pad. */
    private fun commitInk(word: String?, then: String = "") {
        val w = word ?: inkWords.firstOrNull()
        if (w != null && pad?.isEmpty == false) listener.onInsert(w + then) else if (then.isNotEmpty()) listener.onInsert(then)
        inkWords = emptyList()
        pad?.clear()
        showInkWords()
    }

    private fun showInkWords() {
        strip.removeAllViews()
        for (w in inkWords) {
            strip.addView(TextView(context).apply {
                text = w
                typeface = this@KeyboardView.typeface
                setTextColor(ink)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 19f)
                setPadding(dp(14), dp(4), dp(14), dp(4))
                background = rounded(keyBg)
                setOnClickListener { commitInk(w) }
            }, LayoutParams(LayoutParams.WRAP_CONTENT, dp(36)).apply { marginEnd = dp(6) })
        }
    }

    private fun renderWriting() {
        val lang = if (keyboard.lang == "sa") "sa" else "ne"
        val hw = handwriting ?: Handwriting(lang).also { handwriting = it }
        val p = InkPad(context, ink) { inkData ->
            hw.recognize(inkData) { words -> inkWords = words; showInkWords() }
        }.apply {
            background = rounded(keyBg)
            onNewWord = { if (inkWords.isNotEmpty()) commitInk(null) }
        }
        pad = p
        val frame = FrameLayout(context)
        frame.addView(p, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        padHint.apply {
            typeface = this@KeyboardView.typeface
            setTextColor(sub)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            gravity = Gravity.CENTER
        }
        (padHint.parent as? android.view.ViewGroup)?.removeView(padHint)
        frame.addView(padHint, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        fun hint(state: Handwriting.State) {
            padHint.text = when (state) {
                Handwriting.State.DOWNLOADING -> "हस्तलेखन मोडेल डाउनलोड हुँदैछ… (एक पटक मात्र)"
                Handwriting.State.READY -> "यहाँ लेख्नुहोस्…"
                Handwriting.State.FAILED -> "हस्तलेखन मोडेल डाउनलोड भएन। इन्टरनेट जोडेर फेरि खोल्नुहोस्।"
            }
            padHint.isClickable = false
        }
        hint(hw.state)
        if (hw.state != Handwriting.State.READY) hw.prepare { hint(it) }
        p.onNewWord = {
            padHint.text = ""
            if (inkWords.isNotEmpty()) commitInk(null)
        }
        rowsBox.addView(frame, LayoutParams(LayoutParams.MATCH_PARENT, dp(196)).apply { setMargins(dp(2), dp(3), dp(2), dp(3)) })
        val bottom = row()
        bottom.addView(key(if (keyboard.phone) "कख" else "abc", "", 1.4f, keyBg) { closeWriting() })
        bottom.addView(key("खाली ठाउँ", "", 4.4f, keyBg) { commitInk(null, " ") })
        bottom.addView(key("⌫", "", 1.4f, keyBg, repeat = true) {
            if (pad?.isEmpty == false) { inkWords = emptyList(); pad?.clear(); showInkWords() } else listener.onBackspace()
        })
        bottom.addView(key("↵", "", 1.5f, accent) { commitInk(null); listener.onEnter() })
        rowsBox.addView(bottom)
    }

    /** Release the recognizer (the keyboard is going away). */
    fun release() {
        handwriting?.close()
        handwriting = null
    }

    private fun switchBy(step: Int) {
        val next = Keyboards.next(keyboard.id, step)
        keyboard = next
        listener.onSwitch(next)
    }

    /** Space bar: ‹ name ›. The arrows (or a swipe along the bar) switch keyboard; the middle types a space. */
    @SuppressLint("ClickableViewAccessibility")
    private fun spaceBar(weight: Float, onSpace: () -> Unit): View {
        val box = LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = rounded(keyBg)
            contentDescription = "Space. Keyboard ${keyboard.label}"
        }
        fun arrow(t: String, step: Int, desc: String) = TextView(context).apply {
            text = t
            setTextColor(sub)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            gravity = Gravity.CENTER
            contentDescription = desc
            setPadding(dp(10), 0, dp(10), 0)
            setOnClickListener { it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); switchBy(step) }
        }
        box.addView(arrow("‹", -1, "Previous keyboard"), LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.MATCH_PARENT))
        val name = TextView(context).apply {
            text = keyboard.label
            typeface = this@KeyboardView.typeface
            setTextColor(ink)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            gravity = Gravity.CENTER
            maxLines = 1
        }
        var downX = 0f
        name.setOnTouchListener { v, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { downX = e.rawX; v.isPressed = true }
                MotionEvent.ACTION_UP -> {
                    v.isPressed = false
                    val dx = e.rawX - downX
                    if (kotlin.math.abs(dx) > dp(40)) switchBy(if (dx > 0) -1 else 1)
                    else { v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); onSpace() }
                }
                MotionEvent.ACTION_CANCEL -> v.isPressed = false
            }
            true
        }
        box.addView(name, LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))
        box.addView(arrow("›", 1, "Next keyboard"), LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.MATCH_PARENT))
        box.layoutParams = LayoutParams(0, dp(48), weight).apply { setMargins(dp(1), dp(3), dp(1), dp(3)) }
        return box
    }

    private fun renderPhone(layout: PhoneLayout) {
        val rs = if (page == 0) layout.rows else layout.numbers
        rs.forEachIndexed { i, row ->
            val line = row()
            val last = i == rs.lastIndex
            if (last && page == 0) line.addView(key("⇧", "", 1.4f, if (shift) accent else keyBg, height = 48) { shift = !shift; render() })
            for (k in row) line.addView(phoneKey(layout, k))
            if (last) line.addView(key("⌫", "", 1.4f, keyBg, repeat = true, height = 48) { listener.onBackspace() })
            rowsBox.addView(line)
        }
        val bottom = row()
        bottom.addView(key(if (page == 0) "१२३" else "कख", "", 1.4f, keyBg) { page = 1 - page; shift = false; render() })
        bottom.addView(key("🌐", "", 1.1f, keyBg) { listener.onNextKeyboard() })
        bottom.addView(key("✍", "", 1f, keyBg) { openWriting() })
        if (layout.bottom.size == 2) {
            bottom.addView(phoneKey(layout, layout.bottom[0]))
            bottom.addView(spaceBar(4f) { listener.onInsert(" ") })
            bottom.addView(phoneKey(layout, layout.bottom[1]))
        } else bottom.addView(spaceBar(4f) { listener.onInsert(" ") })
        bottom.addView(key("↵", "", 1.5f, accent) { listener.onEnter() })
        rowsBox.addView(bottom)
    }

    /** A letter key: big letter in the middle, the hold letter small in the top-right corner. */
    private fun phoneKey(layout: PhoneLayout, k: PhoneKey, weight: Float = 1f): View {
        val tap = k.tap
        val hold = k.hold
        val alt = layout.shifted(k)
        val shown = if (shift && alt.isNotEmpty()) alt else tap
        val corner = if (shift && alt.isNotEmpty()) tap else hold
        val box = FrameLayout(context).apply {
            background = rounded(keyBg)
            isClickable = true
            isFocusable = true
            contentDescription = if (hold.isNotEmpty()) "$tap, hold for $hold" else tap
        }
        box.addView(TextView(context).apply {
            text = shown
            typeface = this@KeyboardView.typeface
            setTextColor(ink)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, if (shown.length > 2) 16f else 21f)
            gravity = Gravity.CENTER
            includeFontPadding = false
            setPadding(0, dp(6), 0, 0)
        }, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        if (corner.isNotEmpty()) {
            box.addView(TextView(context).apply {
                text = corner
                typeface = this@KeyboardView.typeface
                setTextColor(sub)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
                includeFontPadding = false
            }, FrameLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.END).apply {
                setMargins(0, dp(2), dp(3), 0)
            })
        }
        box.setOnClickListener {
            it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
            listener.onInsert(shown)
            if (shift) { shift = false; render() }
        }
        if (hold.isNotEmpty()) {
            val other = if (shift && alt.isNotEmpty()) tap else hold
            box.setOnLongClickListener {
                it.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                listener.onInsert(other)
                if (shift) { shift = false; render() }
                true
            }
        }
        box.layoutParams = LayoutParams(0, dp(48), weight).apply { setMargins(dp(1), dp(3), dp(1), dp(3)) }
        return box
    }

    /** Long-press choices above a key; each types its roman keys. */
    private fun showMore(anchor: View, more: List<Pair<String, String>>) {
        popup?.dismiss()
        val content = LinearLayout(context).apply {
            orientation = HORIZONTAL
            background = rounded(bg)
            elevation = dp(8).toFloat()
            setPadding(dp(4), dp(4), dp(4), dp(4))
        }
        val w = PopupWindow(content, LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, true)
        for ((labelText, keys) in more) {
            content.addView(TextView(context).apply {
                text = labelText
                typeface = this@KeyboardView.typeface
                setTextColor(ink)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
                gravity = Gravity.CENTER
                background = rounded(keyBg)
                contentDescription = "$labelText $keys"
                setOnClickListener {
                    it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    keys.forEach { c -> listener.onKey(c.toString()) }
                    w.dismiss()
                }
            }, LayoutParams(dp(if (labelText.length > 2) 64 else 48), dp(50)).apply { setMargins(dp(2), 0, dp(2), 0) })
        }
        w.isOutsideTouchable = true
        w.isClippingEnabled = false
        content.measure(MeasureSpec.UNSPECIFIED, MeasureSpec.UNSPECIFIED)
        w.showAsDropDown(anchor, 0, -(anchor.height + content.measuredHeight + dp(4)))
        popup = w
    }

    private fun row() = LinearLayout(context).apply {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun key(
        main: String,
        small: String,
        weight: Float,
        color: Int,
        repeat: Boolean = false,
        more: List<Pair<String, String>>? = null,
        height: Int = 52,
        onPress: () -> Unit,
    ): View {
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
            setTextSize(TypedValue.COMPLEX_UNIT_SP, if (main.length > 3) 14f else 20f)
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
            if (!more.isNullOrEmpty()) {
                box.contentDescription = "${box.contentDescription}, hold for " + more.joinToString(" ") { it.first }
                box.setOnLongClickListener {
                    it.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                    showMore(it, more)
                    true
                }
            }
        }
        box.layoutParams = LayoutParams(0, dp(height), weight).apply { setMargins(dp(2), dp(3), dp(2), dp(3)) }
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

        /** Long-press choices on a roman key: label to roman keys it types (same as web ROMAN_MORE). */
        val ROMAN_MORE: Map<String, List<Pair<String, String>>> = mapOf(
            "a" to listOf("आ ा" to "aa"), "i" to listOf("ई ी" to "ii"), "u" to listOf("ऊ ू" to "uu"),
            "e" to listOf("ऐ ै" to "ai"), "o" to listOf("औ ौ" to "au"), "r" to listOf("ऋ ृ" to "R"),
            "d" to listOf("ध" to "dh", "ड" to "D", "ढ" to "Dh"),
            "t" to listOf("थ" to "th", "ट" to "T", "ठ" to "Th"),
            "n" to listOf("ण" to "N", "ङ" to "ng", "ञ" to "yn", "ं" to "M", "ँ" to "~"),
            "s" to listOf("श" to "sh", "ष" to "Sh", "क्ष" to "ksh"),
            "c" to listOf("छ" to "chh"),
            "k" to listOf("ख" to "kh", "क्ष" to "ksh"),
            "g" to listOf("घ" to "gh", "ज्ञ" to "gy"),
            "j" to listOf("झ" to "jh", "ज्ञ" to "gy"),
            "p" to listOf("फ" to "ph"),
            "b" to listOf("भ" to "bh", "व" to "w"),
            "h" to listOf("ः" to "H", "्" to "_"),
            "m" to listOf("ं" to "M", "ँ" to "~"),
            "l" to listOf("ळ" to "L"),
            "y" to listOf("ञ" to "yn"),
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
