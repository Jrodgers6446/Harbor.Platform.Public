package app.harbor.tech

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Sends the tablet's location to Supabase about once a minute while it's paired.
 * Runs as a foreground service so Android keeps it alive; the notification says location is being shared.
 */
class LocationService : Service() {
    private val io = Executors.newSingleThreadExecutor()
    private var lastSent = 0L
    private val client by lazy { LocationServices.getFusedLocationProviderClient(this) }

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val loc = result.lastLocation ?: return
            if (System.currentTimeMillis() - lastSent < 45_000) return
            lastSent = System.currentTimeMillis()
            io.execute { send(loc) }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val api = Api.get(this)
        if (!api.paired || !api.signedIn || !hasLocation(this)) {
            stopSelf(); return START_NOT_STICKY
        }
        val n = notification()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(1, n)
        }
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 60_000)
            .setMinUpdateIntervalMillis(30_000)
            .setMinUpdateDistanceMeters(0f)
            .build()
        try {
            client.removeLocationUpdates(callback)
            client.requestLocationUpdates(req, callback, Looper.getMainLooper())
        } catch (_: SecurityException) {
            stopSelf()
        }
        running = true
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        client.removeLocationUpdates(callback)
        io.shutdown()
        super.onDestroy()
    }

    private fun send(loc: Location) {
        val api = Api.get(this)
        val id = api.deviceId ?: return
        val token = api.deviceToken ?: return
        val battery = (getSystemService(BATTERY_SERVICE) as BatteryManager)
            .getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        try {
            api.rpcBlocking("report_location", JSONObject()
                .put("p_device_id", id).put("p_token", token)
                .put("p_lat", loc.latitude).put("p_lon", loc.longitude)
                .put("p_accuracy", if (loc.hasAccuracy()) loc.accuracy.toDouble() else JSONObject.NULL)
                .put("p_speed", if (loc.hasSpeed()) loc.speed.toDouble() else JSONObject.NULL)
                .put("p_battery", battery)
                .put("p_app_version", BuildConfig.VERSION_NAME))
            lastError = null
            lastReport = System.currentTimeMillis()
        } catch (e: ApiException) {
            lastError = e.message
            if (e.message?.contains("not approved") == true) {
                // A manager revoked this tablet: forget the token and stop.
                api.deviceToken = null
                stopSelf()
            }
        } catch (e: Exception) {
            lastError = e.message ?: "No connection"
        }
    }

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("loc", "Location sharing", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return Notification.Builder(this, "loc")
            .setSmallIcon(R.drawable.ic_stat_harbor)
            .setContentTitle("Harbor is sharing this tablet's location")
            .setContentText("Your store can see where the van is during the day.")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }

    companion object {
        @Volatile var running = false
        @Volatile var lastReport = 0L
        @Volatile var lastError: String? = null

        fun hasLocation(c: Context) =
            ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

        fun start(c: Context) {
            if (!hasLocation(c)) return
            try {
                ContextCompat.startForegroundService(c, Intent(c, LocationService::class.java))
            } catch (_: Exception) { /* not allowed from the background right now */ }
        }

        fun stop(c: Context) = c.stopService(Intent(c, LocationService::class.java))
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val api = Api.get(context)
        if (api.paired && api.signedIn) LocationService.start(context)
    }
}
