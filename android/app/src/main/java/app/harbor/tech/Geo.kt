package app.harbor.tech

import android.content.Context
import android.location.Geocoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale

/**
 * Finds map coordinates for customers whose address came without them, so the Route map has pins.
 * Tries the tablet's own geocoder first (no key needed), then the free US Census geocoder.
 * Results are kept on the tablet, so each address is looked up once.
 */
class Geo(context: Context) {
    private val ctx = context.applicationContext
    private val prefs = ctx.getSharedPreferences("harbor-geo", Context.MODE_PRIVATE)

    private fun cached(addr: String): Pair<Double, Double>? =
        prefs.getString(addr.lowercase(Locale.US), null)?.split(",")?.let { p ->
            val a = p.getOrNull(0)?.toDoubleOrNull(); val b = p.getOrNull(1)?.toDoubleOrNull()
            if (a != null && b != null) a to b else null
        }

    private fun remember(addr: String, ll: Pair<Double, Double>) =
        prefs.edit().putString(addr.lowercase(Locale.US), "${ll.first},${ll.second}").apply()

    @Suppress("DEPRECATION")
    private fun device(addr: String): Pair<Double, Double>? = try {
        if (!Geocoder.isPresent()) null
        else Geocoder(ctx, Locale.US).getFromLocationName(addr, 1)?.firstOrNull()?.let { it.latitude to it.longitude }
    } catch (_: Exception) { null }

    private fun census(addr: String): Pair<Double, Double>? = try {
        val url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=" +
            URLEncoder.encode(addr, "UTF-8")
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 10_000; c.readTimeout = 15_000
        c.setRequestProperty("User-Agent", "Harbor tablet app")
        val text = c.inputStream.bufferedReader().use { it.readText() }
        c.disconnect()
        val m = JSONObject(text).getJSONObject("result").getJSONArray("addressMatches")
        if (m.length() == 0) null else m.getJSONObject(0).getJSONObject("coordinates").let { it.getDouble("y") to it.getDouble("x") }
    } catch (_: Exception) { null }

    /** Returns the jobs with lat/lon filled in wherever an address could be found. */
    suspend fun fill(jobs: List<Job>): List<Job> = withContext(Dispatchers.IO) {
        jobs.map { j ->
            if (j.lat != null && j.lon != null) return@map j
            val addr = j.address?.trim().orEmpty()
            if (addr.length < 6) return@map j
            val ll = cached(addr) ?: (device(addr) ?: census(addr))?.also { remember(addr, it) }
            if (ll == null) j else j.copy(lat = ll.first, lon = ll.second)
        }
    }
}
