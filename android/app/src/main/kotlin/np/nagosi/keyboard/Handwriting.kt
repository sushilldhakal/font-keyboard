package np.nagosi.keyboard

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.View
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.vision.digitalink.DigitalInkRecognition
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModel
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModelIdentifier
import com.google.mlkit.vision.digitalink.DigitalInkRecognizer
import com.google.mlkit.vision.digitalink.DigitalInkRecognizerOptions
import com.google.mlkit.vision.digitalink.Ink

/**
 * Handwriting recognition for Devanagari with ML Kit Digital Ink (on-device). The Nepali model is
 * downloaded once (~20 MB, needs a connection the first time) and then works offline.
 */
class Handwriting(lang: String) {
    enum class State { DOWNLOADING, READY, FAILED }

    private val id = DigitalInkRecognitionModelIdentifier.fromLanguageTag(lang)
        ?: DigitalInkRecognitionModelIdentifier.fromLanguageTag("hi")
    private val model = id?.let { DigitalInkRecognitionModel.builder(it).build() }
    private var recognizer: DigitalInkRecognizer? = null
    var state = State.DOWNLOADING
        private set

    /** Make sure the model is on the phone; [done] runs on the main thread. */
    fun prepare(done: (State) -> Unit) {
        val m = model ?: run { state = State.FAILED; done(state); return }
        val manager = RemoteModelManager.getInstance()
        manager.isModelDownloaded(m).addOnSuccessListener { have ->
            if (have) ready(m, done)
            else manager.download(m, DownloadConditions.Builder().build())
                .addOnSuccessListener { ready(m, done) }
                .addOnFailureListener { state = State.FAILED; done(state) }
        }.addOnFailureListener { state = State.FAILED; done(state) }
    }

    private fun ready(m: DigitalInkRecognitionModel, done: (State) -> Unit) {
        recognizer = DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(m).build())
        state = State.READY
        done(state)
    }

    /** Candidate words for the ink, best first. */
    fun recognize(ink: Ink, result: (List<String>) -> Unit) {
        val r = recognizer ?: return result(emptyList())
        r.recognize(ink)
            .addOnSuccessListener { res -> result(res.candidates.map { it.text }.distinct().take(6)) }
            .addOnFailureListener { result(emptyList()) }
    }

    fun close() {
        recognizer?.close()
        recognizer = null
    }
}

/** A writing pad: draws strokes with a finger and, after a short pause, asks for recognition. */
@SuppressLint("ViewConstructor")
class InkPad(context: Context, ink: Int, private val onPause: (Ink) -> Unit) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = ink
        style = Paint.Style.STROKE
        strokeWidth = 6f * resources.displayMetrics.density
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val path = Path()
    private var builder = Ink.builder()
    private var stroke: Ink.Stroke.Builder? = null
    private var empty = true
    private val handler = Handler(Looper.getMainLooper())
    private val fire = Runnable { if (!empty) onPause(builder.build()) }

    /** Called when the user starts a new word while candidates for the last one are showing. */
    var onNewWord: (() -> Unit)? = null

    val isEmpty get() = empty

    fun clear() {
        path.reset()
        builder = Ink.builder()
        empty = true
        handler.removeCallbacks(fire)
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        canvas.drawPath(path, paint)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        val t = System.currentTimeMillis()
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                handler.removeCallbacks(fire)
                if (empty) onNewWord?.invoke()
                path.moveTo(e.x, e.y)
                stroke = Ink.Stroke.builder().apply { addPoint(Ink.Point.create(e.x, e.y, t)) }
            }
            MotionEvent.ACTION_MOVE -> {
                path.lineTo(e.x, e.y)
                stroke?.addPoint(Ink.Point.create(e.x, e.y, t))
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                stroke?.addPoint(Ink.Point.create(e.x, e.y, t))
                stroke?.let { builder.addStroke(it.build()) }
                stroke = null
                empty = false
                handler.postDelayed(fire, 550)
            }
        }
        invalidate()
        return true
    }
}
