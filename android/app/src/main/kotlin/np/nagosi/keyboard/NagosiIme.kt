package np.nagosi.keyboard

import android.content.Context
import android.graphics.Typeface
import android.inputmethodservice.InputMethodService
import android.os.Build
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import np.nagosi.engine.Composer
import np.nagosi.engine.Scheme
import np.nagosi.engine.Speller
import np.nagosi.engine.Spellings
import np.nagosi.engine.Suggester
import org.json.JSONObject

/**
 * The Nagosi input method. Typing works fully offline: the scheme, dictionary and font are bundled
 * assets (copied from the repository at build time, see app/build.gradle.kts).
 *
 * Roman keys update an inline composing word (setComposingText). Space, enter or punctuation
 * commits it: for loosely typed Romanized Nepali the best dictionary word ("dhakal" → ढकाल), and a
 * Backspace straight after puts the typed word back. A suggestion tap replaces the word. Backspace
 * removes the last roman key while composing. The default Nepali traditional keys type Devanagari
 * letters directly, with suggestions for the word before the cursor.
 */
class NagosiIme : InputMethodService() {
    private lateinit var composer: Composer
    private val schemes = HashMap<String, Scheme>()
    private val dictionaries = HashMap<String, Suggester>()
    private var keyboard: KeyboardView? = null
    private lateinit var typeface: Typeface
    private val speller: Speller by lazy { NagosiAssets.speller(this) }

    /** Last automatic pick (text committed, roman typed), so an immediate Backspace can undo it. */
    private var autoPick: Pair<String, String>? = null
    /** After an undo, the next commit keeps the typed spelling. */
    private var keepStrict = false
    /** Letters are being typed directly on the कख page: suggest for the word before the cursor. */
    private var direct = false

    private val prefs by lazy { getSharedPreferences(PREFS, Context.MODE_PRIVATE) }

    override fun onCreate() {
        super.onCreate()
        typeface = NagosiAssets.typeface(this)
        composer = Composer(scheme(romanSchemeId()))
    }

    /** The keyboard on screen (space-bar arrows switch it); saved across fields. */
    private fun currentKeyboard(): KeyboardChoice = Keyboards.byId(prefs.getString(KEY_KEYBOARD, null))

    /** Roman scheme for typed (and on-screen roman) keys on the current keyboard. */
    private fun romanSchemeId(): String = Keyboards.romanScheme(currentKeyboard())

    private fun scheme(id: String): Scheme = schemes.getOrPut(id) { NagosiAssets.scheme(this, id) }

    private var learnedEpoch = -1

    private fun dictionary(): Suggester {
        val epoch = prefs.getInt(KEY_LEARNED_EPOCH, 0)
        if (epoch != learnedEpoch) { dictionaries.clear(); learnedEpoch = epoch }
        val lang = currentKeyboard().lang
        return dictionaries.getOrPut(lang) {
            NagosiAssets.dictionary(this, lang).also { s ->
                prefs.getString("learned_$lang", null)?.let { json ->
                    val o = JSONObject(json)
                    s.importLearned(o.keys().asSequence().associateWith { o.getInt(it) })
                }
            }
        }
    }

    override fun onCreateInputView(): View {
        val view = KeyboardView(this, typeface, object : KeyboardView.Listener {
            override fun onKey(ch: String) = type(ch)
            override fun onInsert(text: String) = insert(text)
            override fun onBackspace() = backspace()
            override fun onSuggestion(word: String) = choose(word)
            override fun onNextKeyboard() = switchToNextInputMethodCompat()
            override fun onEnter() = enter()
            override fun onSwitch(choice: KeyboardChoice) {
                commitComposing()
                prefs.edit().putString(KEY_KEYBOARD, choice.id).apply()
                composer.scheme = scheme(romanSchemeId())
                updateSuggestions()
            }
        })
        keyboard = view
        view.keyboard = currentKeyboard()
        return view
    }

    /** Password field, or the app asked for no learning (incognito): learn nothing typed here. */
    private var privateField = false

    override fun onStartInput(attribute: EditorInfo?, restarting: Boolean) {
        super.onStartInput(attribute, restarting)
        privateField = attribute != null && isPrivate(attribute)
        composer.flush()
        autoPick = null
        keepStrict = false
        direct = false
        composer.scheme = scheme(romanSchemeId()) // the setup screen may have changed it
        keyboard?.keyboard = currentKeyboard()
    }

    override fun onFinishInput() {
        commitComposing()
        saveLearned()
        super.onFinishInput()
    }

    override fun onDestroy() {
        keyboard?.release()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- editing
    private fun type(ch: String) {
        val ic = currentInputConnection ?: return
        autoPick = null
        direct = false
        if (ch in Composer.COMMIT_KEYS) {
            val roman = composer.buffer
            val composing = composer.composing
            val pick = if (keepStrict || !prefs.getBoolean(KEY_AUTO_PICK, true)) composing else Spellings.commitWord(roman, composing, composer.scheme, dictionary(), speller)
            composer.key(ch)
            ic.commitText(pick + ch, 1)
            if (pick != composing) autoPick = (pick + ch) to roman
            else if (pick.isNotEmpty() && !privateField) dictionary().learn(pick)
            keepStrict = false
        } else {
            ic.setComposingText(composer.key(ch).composing, 1)
        }
        updateSuggestions()
    }

    /** Text from the letter page, committed as is. */
    private fun insert(text: String) {
        val ic = currentInputConnection ?: return
        if (composer.buffer.isNotEmpty()) commitComposing()
        autoPick = null
        keepStrict = false
        if (text == "\n") {
            enter()
            return
        }
        ic.commitText(text, 1)
        direct = text.any { it in 'ऀ'..'ॿ' }
        updateSuggestions()
    }

    private fun backspace() {
        val ic = currentInputConnection ?: return
        val undo = autoPick
        autoPick = null
        if (undo != null && composer.buffer.isEmpty() && ic.getTextBeforeCursor(undo.first.length, 0)?.toString() == undo.first) {
            ic.deleteSurroundingText(undo.first.length, 0)
            composer.restore(undo.second)
            ic.setComposingText(composer.composing, 1)
            keepStrict = true
            updateSuggestions()
            return
        }
        if (composer.backspace()) {
            val c = composer.composing
            if (c.isEmpty()) {
                ic.commitText("", 1)
                keepStrict = false
            } else ic.setComposingText(c, 1)
        } else if (Build.VERSION.SDK_INT >= 24) {
            val sel = ic.getSelectedText(0)
            if (!sel.isNullOrEmpty()) ic.commitText("", 1) else ic.deleteSurroundingTextInCodePoints(1, 0)
        } else {
            ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DEL))
            ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DEL))
        }
        updateSuggestions()
    }

    private fun enter() {
        commitComposing()
        val ic = currentInputConnection ?: return
        val action = currentInputEditorInfo?.imeOptions?.and(EditorInfo.IME_MASK_ACTION) ?: EditorInfo.IME_ACTION_NONE
        val multiLine = (currentInputEditorInfo?.inputType ?: 0) and android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE != 0
        if (!multiLine && action != EditorInfo.IME_ACTION_NONE && action != EditorInfo.IME_ACTION_UNSPECIFIED) {
            ic.performEditorAction(action)
        } else {
            ic.commitText("\n", 1)
        }
    }

    private fun choose(word: String) {
        val ic = currentInputConnection ?: return
        autoPick = null
        keepStrict = false
        if (composer.buffer.isNotEmpty()) {
            ic.commitText(composer.choose(word), 1)
        } else if (direct) {
            val run = directWord()
            if (run.isNotEmpty()) ic.deleteSurroundingText(run.length, 0)
            ic.commitText("$word ", 1)
            direct = false
        } else return
        if (!privateField) dictionary().learn(word)
        updateSuggestions()
    }

    private val devanagariRun = Regex("[\u0900-\u0963\u0971-\u097F\u200C\u200D]+$")

    private fun directWord(): String =
        currentInputConnection?.getTextBeforeCursor(48, 0)?.let { devanagariRun.find(it)?.value } ?: ""

    private fun commitComposing() {
        if (composer.buffer.isNotEmpty()) currentInputConnection?.commitText(composer.flush(), 1)
        updateSuggestions()
    }

    private fun updateSuggestions() {
        val composing = composer.composing
        if (composing.isEmpty() && direct) {
            val word = directWord()
            val found = if (word.isEmpty()) emptyList() else dictionary().suggest(word, 40)
            val exact = found.filter { it.startsWith(word) && it != word }
            keyboard?.showSuggestions(word, (exact + found.filter { it !in exact }).take(6))
            return
        }
        keyboard?.showSuggestions(
            composing,
            if (composing.isEmpty()) emptyList()
            else Spellings.candidates(composer.buffer, composing, composer.scheme, dictionary(), speller, 6),
        )
    }

    private fun switchToNextInputMethodCompat() {
        if (Build.VERSION.SDK_INT >= 28) {
            switchToNextInputMethod(false)
        } else {
            @Suppress("DEPRECATION")
            (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager)
                .switchToNextInputMethod(window.window?.attributes?.token, false)
        }
    }

    private fun saveLearned() {
        // the settings screen forgot the learned words while this IME held them: don't write them back
        if (prefs.getInt(KEY_LEARNED_EPOCH, 0) != learnedEpoch) { dictionaries.clear(); return }
        val e = prefs.edit()
        dictionaries.forEach { (lang, s) -> e.putString("learned_$lang", JSONObject(s.learnedWords()).toString()) }
        e.apply()
    }

    // ---------------------------------------------------------------- hardware keyboards
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (event.isCtrlPressed || event.isAltPressed || event.isMetaPressed) return super.onKeyDown(keyCode, event)
        if (keyCode == KeyEvent.KEYCODE_DEL && (composer.buffer.isNotEmpty() || autoPick != null)) {
            backspace()
            return true
        }
        val uc = event.unicodeChar
        if (uc != 0 && !Character.isISOControl(uc)) {
            type(String(Character.toChars(uc)))
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    companion object {
        fun isPrivate(info: EditorInfo): Boolean {
            val cls = info.inputType and android.text.InputType.TYPE_MASK_CLASS
            val v = info.inputType and android.text.InputType.TYPE_MASK_VARIATION
            val password = (cls == android.text.InputType.TYPE_CLASS_TEXT && v in setOf(
                android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD,
                android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
                android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
            )) || (cls == android.text.InputType.TYPE_CLASS_NUMBER && v == android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD)
            return password || info.imeOptions and EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING != 0
        }

        const val PREFS = "nagosi"
        const val KEY_KEYBOARD = "keyboard"
        /** Space takes the best dictionary word for loosely typed roman (default on). */
        const val KEY_AUTO_PICK = "auto_pick"
        /** Bumped by the settings screen's "Forget learned words"; the IME then reloads its dictionaries. */
        const val KEY_LEARNED_EPOCH = "learned_epoch"
    }
}
