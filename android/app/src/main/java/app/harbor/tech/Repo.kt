package app.harbor.tech

import android.content.Context
import android.location.Geocoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate

/** Everything the screens read and write. */
class Repo(private val context: Context) {
    val api = Api.get(context)

    // store (franchise)
    data class Me(val store: String, val role: String, val techId: String?, val name: String?)

    /** null when this login hasn't joined a store yet. */
    suspend fun me(): Me? {
        val arr = JSONArray(api.get("/rest/v1/profiles?select=role,tech_id,display_name,franchises(name)&limit=1"))
        if (arr.length() == 0) return null
        val j = arr.getJSONObject(0)
        val m = Me(j.optJSONObject("franchises")?.optString("name") ?: "Store", j.optString("role"), j.str("tech_id"), j.str("display_name"))
        api.putPref("store", m.store); api.putPref("tech_id", m.techId)
        return m
    }

    suspend fun joinStore(code: String): Me {
        val arr = JSONArray(api.rpc("join_store", JSONObject().put("p_code", code.trim())))
        val j = arr.getJSONObject(0)
        return me() ?: Me(j.optString("store"), j.optString("role"), null, null)
    }

    // pairing
    data class PairInfo(val deviceId: String, val code: String)

    suspend fun requestPairing(): PairInfo {
        val model = android.os.Build.MODEL ?: "Tablet"
        val args = JSONObject().put("p_name", "Tablet · $model").put("p_model", model)
            .put("p_app_version", BuildConfig.VERSION_NAME)
        val row = JSONArray(api.rpc("request_pairing", args)).getJSONObject(0)
        api.deviceId = row.getString("device_id")
        api.pairCode = row.getString("pair_code")
        api.deviceToken = null
        return PairInfo(api.deviceId!!, api.pairCode!!)
    }

    /** Tablet QR: pairs this tablet to the QR's store with no approval step, then claims the device token. */
    suspend fun pairWithInvite(token: String): String {
        val model = android.os.Build.MODEL ?: "Tablet"
        val args = JSONObject().put("p_token", token).put("p_name", "Tablet · $model").put("p_model", model)
            .put("p_app_version", BuildConfig.VERSION_NAME)
        val row = JSONArray(api.rpc("pair_with_invite", args)).getJSONObject(0)
        api.deviceId = row.getString("device_id")
        api.pairCode = null
        api.deviceToken = null
        checkPairing()
        me()
        return row.optString("store")
    }

    /** Returns "active" once the token is saved, otherwise the device status (pending / revoked / claimed). */
    suspend fun checkPairing(): String {
        val id = api.deviceId ?: return "none"
        val arr = JSONArray(api.rpc("claim_device_token", JSONObject().put("p_device_id", id)))
        if (arr.length() == 0) return "none"
        val row = arr.getJSONObject(0)
        val status = row.optString("status")
        val token = row.str("device_token")
        if (token != null) {
            api.deviceToken = token
            api.pairCode = null
            return "active"
        }
        return if (status == "active") "claimed" else status
    }

    // sheet
    suspend fun loadSheet(day: LocalDate = LocalDate.now()): Sheet? {
        val path = "/rest/v1/sheets?sheet_date=eq.$day&select=*,sheet_jobs(*)&order=created_at.desc&limit=1"
        val arr = JSONArray(api.get(path))
        if (arr.length() == 0) return null
        val sheet = Sheet.from(arr.getJSONObject(0))
        return sheet.copy(jobs = geocodeMissing(sheet.jobs))
    }

    suspend fun saveJob(j: Job) {
        api.rpc("save_job", JSONObject()
            .put("p_job_id", j.id)
            .put("p_part_sku", j.partSku).put("p_bg_sku", j.bgSku).put("p_battery_sku", j.batterySku)
            .put("p_rw", j.rw).put("p_part_status", j.partStatus ?: "").put("p_outcome", j.outcome ?: "")
            .put("p_reason", j.reason))
    }

    suspend fun saveHeader(s: Sheet) {
        api.rpc("save_sheet", JSONObject()
            .put("p_sheet_id", s.id)
            .put("p_clock_in_at", s.clockIn?.toString() ?: JSONObject.NULL)
            .put("p_bod_done", s.bodDone)
            .put("p_clock_out_at", s.clockOut?.toString() ?: JSONObject.NULL)
            .put("p_end_mileage", s.endMileage ?: JSONObject.NULL)
            .put("p_eod_done", s.eodDone))
    }

    suspend fun submit(s: Sheet, manager: String, signature: String) {
        saveHeader(s)
        api.rpc("submit_sheet", JSONObject().put("p_sheet_id", s.id).put("p_manager_name", manager)
            .put("p_signature", signature))
    }

    // repair guides
    /** Built-in starter guides plus any the store added in Supabase (store guides win on the same device + repair). */
    suspend fun guides(): List<Guide> {
        val builtIn = withContext(Dispatchers.IO) {
            val text = context.assets.open("guides.json").bufferedReader().use { it.readText() }
            JSONArray(text).objects().map { Guide.from(it) }
        }
        val store = try {
            JSONArray(api.get("/rest/v1/repair_guides?select=device,repair,steps,warnings&order=device")).objects().map { Guide.from(it) }
        } catch (_: Exception) { emptyList() }
        val keys = store.map { (it.device + "|" + it.repair).lowercase() }.toSet()
        return store + builtIn.filter { (it.device + "|" + it.repair).lowercase() !in keys }
    }

    @Suppress("DEPRECATION")
    private suspend fun geocodeMissing(jobs: List<Job>): List<Job> = withContext(Dispatchers.IO) {
        if (!Geocoder.isPresent()) return@withContext jobs
        val geo = Geocoder(context)
        jobs.map { j ->
            if (j.lat != null || j.address.isNullOrBlank()) return@map j
            val cacheKey = "geo:" + j.address
            api.prefString(cacheKey)?.split(",")?.let { p ->
                return@map j.copy(lat = p[0].toDoubleOrNull(), lon = p.getOrNull(1)?.toDoubleOrNull())
            }
            try {
                val hit = geo.getFromLocationName(j.address, 1)?.firstOrNull() ?: return@map j
                api.putPref(cacheKey, "${hit.latitude},${hit.longitude}")
                j.copy(lat = hit.latitude, lon = hit.longitude)
            } catch (_: Exception) { j }
        }
    }

    fun now(): Instant = Instant.now()
}
