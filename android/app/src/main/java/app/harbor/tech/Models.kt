package app.harbor.tech

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class Job(
    val id: String,
    val position: Int,
    val customer: String,
    val address: String?,
    val lat: Double?,
    val lon: Double?,
    val windowStart: Instant?,
    val windowEnd: Instant?,
    val device: String?,
    val filedParts: String?,
    val problem: String?,
    val carrier: String?,
    val partSku: String = "",
    val bgSku: String = "",
    val batterySku: String = "",
    val rw: String = "",
    val partStatus: String? = null,   // used | returned
    val outcome: String? = null,      // completed | rescheduled | unrepaired
    val reason: String = "",
) {
    val done: Boolean get() = outcome != null

    companion object {
        fun from(j: JSONObject) = Job(
            id = j.getString("id"),
            position = j.optInt("position"),
            customer = j.str("customer_name") ?: "Customer",
            address = j.str("address"),
            lat = j.dbl("lat"), lon = j.dbl("lon"),
            windowStart = j.str("window_start")?.let { parseTime(it) },
            windowEnd = j.str("window_end")?.let { parseTime(it) },
            device = j.str("device"), filedParts = j.str("filed_parts"),
            problem = j.str("problem"), carrier = j.str("carrier"),
            partSku = j.str("part_sku") ?: "", bgSku = j.str("bg_sku") ?: "",
            batterySku = j.str("battery_sku") ?: "", rw = j.str("rw") ?: "",
            partStatus = j.str("part_status"), outcome = j.str("outcome"), reason = j.str("reason") ?: "",
        )
    }
}

data class Sheet(
    val id: String,
    val date: LocalDate,
    val techName: String?,
    val van: String?,
    val clockIn: Instant?,
    val bodDone: Boolean,
    val clockOut: Instant?,
    val endMileage: Int?,
    val eodDone: Boolean,
    val submitted: Boolean,
    val jobs: List<Job>,
) {
    companion object {
        fun from(j: JSONObject) = Sheet(
            id = j.getString("id"),
            date = LocalDate.parse(j.getString("sheet_date")),
            techName = j.str("tech_name"), van = j.str("van"),
            clockIn = j.str("clock_in_at")?.let { parseTime(it) },
            bodDone = j.optBoolean("bod_done"),
            clockOut = j.str("clock_out_at")?.let { parseTime(it) },
            endMileage = if (j.isNull("end_mileage")) null else j.optInt("end_mileage"),
            eodDone = j.optBoolean("eod_done"),
            submitted = !j.isNull("submitted_at"),
            jobs = (j.optJSONArray("sheet_jobs") ?: JSONArray()).objects().map { Job.from(it) }.sortedBy { it.position },
        )
    }
}

data class GuideStep(val title: String, val detail: String)
data class Guide(val device: String, val repair: String, val steps: List<GuideStep>, val warnings: String?) {
    companion object {
        fun from(j: JSONObject) = Guide(
            device = j.optString("device"), repair = j.optString("repair"),
            steps = (j.optJSONArray("steps") ?: JSONArray()).objects().map {
                GuideStep(it.optString("title"), it.optString("detail"))
            },
            warnings = j.str("warnings"),
        )
    }
}

private fun parseTime(s: String): Instant? = try {
    java.time.OffsetDateTime.parse(s).toInstant()
} catch (_: Exception) {
    try { Instant.parse(s) } catch (_: Exception) { null }
}

private val clock = DateTimeFormatter.ofPattern("h:mm a").withZone(ZoneId.systemDefault())
private val hour = DateTimeFormatter.ofPattern("h a").withZone(ZoneId.systemDefault())
fun Instant.clockText(): String = clock.format(this)
fun windowText(a: Instant?, b: Instant?): String =
    if (a == null) "No window" else if (b == null) clock.format(a) else hour.format(a) + " – " + hour.format(b)
