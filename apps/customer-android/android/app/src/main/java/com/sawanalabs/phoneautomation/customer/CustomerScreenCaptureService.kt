package com.sawanalabs.phoneautomation.customer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import java.io.ByteArrayOutputStream

data class CustomerScreenCaptureFrame(
  val width: Int,
  val height: Int,
  val frameBase64: String
)

data class CustomerScreenCaptureFailure(
  val code: String,
  val message: String,
  val cause: Throwable? = null
)

class CustomerScreenCaptureService : Service() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private lateinit var captureThread: HandlerThread
  private lateinit var captureHandler: Handler
  @Volatile private var mediaProjection: MediaProjection? = null
  private var imageReader: ImageReader? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var captureWidth = 0
  private var captureHeight = 0
  private var pendingFrame: PendingFrame? = null

  override fun onCreate() {
    super.onCreate()
    captureThread = HandlerThread("CustomerScreenCaptureThread")
    captureThread.start()
    captureHandler = Handler(captureThread.looper)
    activeService = this
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START_CAPTURE -> startProjectionFromPendingRequest()
      ACTION_STOP_CAPTURE -> {
        releaseProjection()
        stopSelf()
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    releaseProjection()
    if (activeService === this) {
      activeService = null
    }
    captureThread.quitSafely()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun startProjectionFromPendingRequest() {
    val request = pendingStartRequest
    pendingStartRequest = null
    if (request == null) {
      Log.i(TAG, "Screen capture service started without a pending request.")
      return
    }

    try {
      startForegroundForProjection()
      val projectionManager =
        getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      val projection = projectionManager.getMediaProjection(request.resultCode, request.data)
        ?: throw IllegalStateException("MediaProjectionManager returned null.")

      releaseProjection(stopProjection = false)
      mediaProjection = projection
      projection.registerCallback(
        object : MediaProjection.Callback() {
          override fun onStop() {
            Log.i(TAG, "MediaProjection stopped.")
            captureHandler.post {
              releaseProjection(stopProjection = false)
              mainHandler.post {
                stopSelf()
              }
            }
          }
        },
        captureHandler
      )
      captureHandler.post {
        if (mediaProjection === projection) {
          Log.i(TAG, "Screen capture foreground service is ready.")
          mainHandler.post { request.onReady(null) }
        } else {
          mainHandler.post {
            request.onReady(
              CustomerScreenCaptureFailure(
                "SCREEN_CAPTURE_UNAVAILABLE",
                "Screen capture session stopped before it became ready."
              )
            )
          }
        }
      }
    } catch (error: Exception) {
      releaseProjection(stopProjection = false)
      stopSelf()
      request.onReady(
        CustomerScreenCaptureFailure(
          "SCREEN_CAPTURE_UNAVAILABLE",
          "Screen capture session is unavailable.",
          error
        )
      )
    }
  }

  private fun captureCurrentFrame(
    width: Int,
    height: Int,
    densityDpi: Int,
    timeoutMs: Long,
    onResult: (CustomerScreenCaptureFrame) -> Unit,
    onError: (CustomerScreenCaptureFailure) -> Unit
  ) {
    if (Looper.myLooper() != captureHandler.looper) {
      captureHandler.post {
        captureCurrentFrame(width, height, densityDpi, timeoutMs, onResult, onError)
      }
      return
    }

    if (mediaProjection == null) {
      onError(
        CustomerScreenCaptureFailure(
          "SCREEN_CAPTURE_MISSING",
          "Grant screen capture before requesting hosted decisions."
        )
      )
      return
    }

    if (pendingFrame != null) {
      onError(
        CustomerScreenCaptureFailure(
          "SCREEN_CAPTURE_BUSY",
          "A screen capture request is already in progress."
        )
      )
      return
    }

    try {
      ensureVirtualDisplay(width, height, densityDpi)
    } catch (error: Exception) {
      onError(
        CustomerScreenCaptureFailure(
          "SCREEN_CAPTURE_FAILED",
          "Failed to start screen capture.",
          error
        )
      )
      return
    }

    val pending = PendingFrame(width, height, onResult, onError)
    pendingFrame = pending
    pollForFrame(pending, SystemClock.uptimeMillis() + timeoutMs)
  }

  private fun ensureVirtualDisplay(width: Int, height: Int, densityDpi: Int) {
    if (virtualDisplay != null && width == captureWidth && height == captureHeight) {
      return
    }

    releaseVirtualDisplay()
    captureWidth = width
    captureHeight = height
    imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)

    virtualDisplay = mediaProjection?.createVirtualDisplay(
      "CustomerAutomationScreenCapture",
      width,
      height,
      densityDpi,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      imageReader?.surface,
      null,
      captureHandler
    )
  }

  private fun pollForFrame(pending: PendingFrame, deadlineMs: Long) {
    if (pendingFrame !== pending) {
      return
    }

    val image = try {
      imageReader?.acquireLatestImage()
    } catch (error: Exception) {
      pendingFrame = null
      pending.timeoutRunnable = null
      pending.onError(
        CustomerScreenCaptureFailure(
          "SCREEN_CAPTURE_FAILED",
          "Failed to read screen capture.",
          error
        )
      )
      return
    }

    if (image != null) {
      pendingFrame = null
      pending.timeoutRunnable = null
      resolveFrame(image, pending.width, pending.height, pending.onResult, pending.onError)
      return
    }

    if (SystemClock.uptimeMillis() >= deadlineMs) {
      pendingFrame = null
      pending.timeoutRunnable = null
      pending.onError(
        CustomerScreenCaptureFailure(
          "SCREEN_CAPTURE_TIMEOUT",
          "Timed out while capturing screen state."
        )
      )
      return
    }

    val pollRunnable = Runnable {
      pollForFrame(pending, deadlineMs)
    }
    pending.timeoutRunnable = pollRunnable
    captureHandler.postDelayed(pollRunnable, SCREEN_CAPTURE_POLL_INTERVAL_MS)
  }

  private fun resolveFrame(
    image: Image,
    width: Int,
    height: Int,
    onResult: (CustomerScreenCaptureFrame) -> Unit,
    onError: (CustomerScreenCaptureFailure) -> Unit
  ) {
    try {
      onResult(CustomerScreenCaptureFrame(width, height, encodeImageAsJpeg(image, width, height)))
    } catch (error: Exception) {
      onError(
        CustomerScreenCaptureFailure(
          "SCREEN_CAPTURE_FAILED",
          "Failed to encode screen capture.",
          error
        )
      )
    } finally {
      image.close()
    }
  }

  private fun encodeImageAsJpeg(image: Image, width: Int, height: Int): String {
    val plane = image.planes[0]
    val buffer = plane.buffer
    val pixelStride = plane.pixelStride
    val rowStride = plane.rowStride
    val rowPadding = rowStride - pixelStride * width
    val bitmapWidth = width + rowPadding / pixelStride
    val bitmap = Bitmap.createBitmap(bitmapWidth, height, Bitmap.Config.ARGB_8888)
    bitmap.copyPixelsFromBuffer(buffer)

    val croppedBitmap =
      if (bitmapWidth == width) bitmap else Bitmap.createBitmap(bitmap, 0, 0, width, height)
    val output = ByteArrayOutputStream()
    croppedBitmap.compress(Bitmap.CompressFormat.JPEG, 70, output)

    if (croppedBitmap !== bitmap) {
      croppedBitmap.recycle()
    }
    bitmap.recycle()

    return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
  }

  private fun releaseProjection(stopProjection: Boolean = true) {
    val projection = mediaProjection
    mediaProjection = null
    releaseVirtualDisplay()
    if (stopProjection) {
      projection?.stop()
    }
  }

  private fun releaseVirtualDisplay() {
    pendingFrame?.timeoutRunnable?.let { captureHandler.removeCallbacks(it) }
    pendingFrame = null
    virtualDisplay?.release()
    virtualDisplay = null
    imageReader?.close()
    imageReader = null
    captureWidth = 0
    captureHeight = 0
  }

  private fun startForegroundForProjection() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
      )
      return
    }

    startForeground(NOTIFICATION_ID, notification)
  }

  private fun buildNotification(): Notification {
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(this)
      }

    return builder
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setContentTitle("Customer Phone Agent")
      .setContentText("Screen capture is active")
      .setOngoing(true)
      .build()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      NOTIFICATION_CHANNEL_ID,
      "Customer Phone Agent",
      NotificationManager.IMPORTANCE_LOW
    )
    manager.createNotificationChannel(channel)
  }

  private data class PendingFrame(
    val width: Int,
    val height: Int,
    val onResult: (CustomerScreenCaptureFrame) -> Unit,
    val onError: (CustomerScreenCaptureFailure) -> Unit,
    var timeoutRunnable: Runnable? = null
  )

  private data class ProjectionStartRequest(
    val resultCode: Int,
    val data: Intent,
    val onReady: (CustomerScreenCaptureFailure?) -> Unit
  )

  companion object {
    private const val TAG = "CustomerScreenCapture"
    private const val ACTION_START_CAPTURE =
      "com.sawanalabs.phoneautomation.customer.START_SCREEN_CAPTURE"
    private const val ACTION_STOP_CAPTURE =
      "com.sawanalabs.phoneautomation.customer.STOP_SCREEN_CAPTURE"
    private const val NOTIFICATION_CHANNEL_ID = "customer-screen-capture"
    private const val NOTIFICATION_ID = 41032
    private const val SCREEN_CAPTURE_POLL_INTERVAL_MS = 50L

    @Volatile private var activeService: CustomerScreenCaptureService? = null
    @Volatile private var pendingStartRequest: ProjectionStartRequest? = null

    fun startProjection(
      context: Context,
      resultCode: Int,
      data: Intent,
      onReady: (CustomerScreenCaptureFailure?) -> Unit
    ) {
      val appContext = context.applicationContext
      pendingStartRequest = ProjectionStartRequest(resultCode, data, onReady)
      val intent = Intent(appContext, CustomerScreenCaptureService::class.java).apply {
        action = ACTION_START_CAPTURE
      }

      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          appContext.startForegroundService(intent)
        } else {
          appContext.startService(intent)
        }
      } catch (error: Exception) {
        pendingStartRequest = null
        onReady(
          CustomerScreenCaptureFailure(
            "SCREEN_CAPTURE_UNAVAILABLE",
            "Screen capture service could not be started.",
            error
          )
        )
      }
    }

    fun stopProjection(context: Context) {
      val appContext = context.applicationContext
      val intent = Intent(appContext, CustomerScreenCaptureService::class.java).apply {
        action = ACTION_STOP_CAPTURE
      }
      try {
        appContext.startService(intent)
      } catch (_: Exception) {
        activeService?.releaseProjection()
      }
    }

    fun isCaptureReady(): Boolean = activeService?.mediaProjection != null

    fun captureFrame(
      width: Int,
      height: Int,
      densityDpi: Int,
      timeoutMs: Long,
      onResult: (CustomerScreenCaptureFrame) -> Unit,
      onError: (CustomerScreenCaptureFailure) -> Unit
    ) {
      val service = activeService
      if (service == null) {
        onError(
          CustomerScreenCaptureFailure(
            "SCREEN_CAPTURE_MISSING",
            "Grant screen capture before requesting hosted decisions."
          )
        )
        return
      }

      val posted = service.captureHandler.post {
        service.captureCurrentFrame(width, height, densityDpi, timeoutMs, onResult, onError)
      }
      if (!posted) {
        onError(
          CustomerScreenCaptureFailure(
            "SCREEN_CAPTURE_UNAVAILABLE",
            "Screen capture worker is unavailable."
          )
        )
      }
    }
  }
}
