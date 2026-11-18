package app.harbor.tech

import android.content.Context
import android.content.Intent
import android.net.Uri

/** The tech's GPS app (Settings > Navigation app). */
enum class NavApp(val label: String) { GOOGLE("Google Maps"), WAZE("Waze") }

object Nav {
    private fun where(j: Job): String =
        if (j.lat != null && j.lon != null) "${j.lat},${j.lon}" else Uri.encode(j.address ?: j.customer)

    private fun start(ctx: Context, uri: String, fallback: String? = null) {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { ctx.startActivity(i) } catch (_: Exception) {
            if (fallback != null) ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fallback)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    /** Drive to one customer. */
    fun stop(ctx: Context, app: NavApp, j: Job) {
        when (app) {
            NavApp.GOOGLE -> start(ctx, "google.navigation:q=${where(j)}",
                "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${where(j)}")
            NavApp.WAZE -> start(ctx,
                if (j.lat != null && j.lon != null) "https://waze.com/ul?ll=${j.lat},${j.lon}&navigate=yes"
                else "https://waze.com/ul?q=${Uri.encode(j.address ?: j.customer)}&navigate=yes")
        }
    }

    /**
     * The whole route in order. Google Maps takes the last stop as the destination and up to 9 stops in between,
     * starting from where the tablet is; longer routes open the first 10 stops (open it again after those).
     * Waze only navigates to one place, so it opens the next stop.
     * Returns a short note for the tech, or null.
     */
    fun route(ctx: Context, app: NavApp, stops: List<Job>): String? {
        if (stops.isEmpty()) return "No stops left."
        if (app == NavApp.WAZE) { stop(ctx, app, stops.first()); return "Waze goes one stop at a time: opened the next stop." }
        val part = stops.take(10)
        val dest = where(part.last())
        val via = part.dropLast(1).joinToString("%7C") { where(it) }
        val url = "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=$dest" + (if (via.isNotEmpty()) "&waypoints=$via" else "")
        start(ctx, url)
        return if (stops.size > 10) "Opened the first 10 stops. Open the route again after those." else null
    }
}
