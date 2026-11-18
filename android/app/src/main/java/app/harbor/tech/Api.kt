package app.harbor.tech

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class ApiException(message: String, val code: Int = 0) : IOException(message)

/**
 * Small Supabase client: sign-in with an emailed 6-digit code, token refresh, PostgREST reads and RPC calls.
 * Only the session (access + refresh token) is stored.
 */
class Api private constructor(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("harbor", Context.MODE_PRIVATE)
    private val base = BuildConfig.SUPABASE_URL.trimEnd('/')
    private val key = BuildConfig.SUPABASE_KEY
    private val lock = Any()

    val signedIn: Boolean get() = prefs.getString("refresh", null) != null
    val email: String? get() = prefs.getString("email", null)

    // pairing state
    var deviceId: String?
        get() = prefs.getString("device_id", null)
        set(v) = prefs.edit().putString("device_id", v).apply()
    var pairCode: String?
        get() = prefs.getString("pair_code", null)
        set(v) = prefs.edit().putString("pair_code", v).apply()
    var deviceToken: String?
        get() = prefs.getString("device_token", null)
        set(v) = prefs.edit().putString("device_token", v).apply()
    val paired: Boolean get() = deviceToken != null

    fun prefString(k: String): String? = prefs.getString(k, null)
    fun putPref(k: String, v: String?) = prefs.edit().putString(k, v).apply()

    /** Emails a 6-digit code. Only emails a manager added under Employees get one (the server refuses others). */
    suspend fun sendCode(email: String) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("email", email.trim()).put("create_user", true)
        http("POST", "/auth/v1/otp", body.toString(), auth = false)
        Unit
    }

    suspend fun verifyCode(email: String, code: String) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("type", "email").put("email", email.trim()).put("token", code.trim())
        val res = http("POST", "/auth/v1/verify", body.toString(), auth = false)
        saveSession(JSONObject(res))
        prefs.edit().putString("email", email.trim()).apply()
    }

    fun signOut() {
        prefs.edit().remove("access").remove("refresh").remove("expires").remove("email")
            .remove("device_id").remove("pair_code").remove("device_token").apply()
    }

    private fun saveSession(j: JSONObject) {
        val expiresIn = j.optLong("expires_in", 3600)
        prefs.edit()
            .putString("access", j.getString("access_token"))
            .putString("refresh", j.getString("refresh_token"))
            .putLong("expires", System.currentTimeMillis() + expiresIn * 1000)
            .apply()
    }

    private fun accessToken(): String = synchronized(lock) {
        val refresh = prefs.getString("refresh", null) ?: throw ApiException("Signed out", 401)
        val exp = prefs.getLong("expires", 0)
        if (System.currentTimeMillis() > exp - 90_000) {
            val res = http("POST", "/auth/v1/token?grant_type=refresh_token",
                JSONObject().put("refresh_token", refresh).toString(), auth = false)
            saveSession(JSONObject(res))
        }
        prefs.getString("access", null) ?: throw ApiException("Signed out", 401)
    }

    /** POST /rest/v1/rpc/<name>. Returns the raw JSON text. */
    suspend fun rpc(name: String, args: JSONObject): String = withContext(Dispatchers.IO) {
        http("POST", "/rest/v1/rpc/$name", args.toString())
    }

    /** Blocking version for the location service thread. */
    fun rpcBlocking(name: String, args: JSONObject): String = http("POST", "/rest/v1/rpc/$name", args.toString())

    suspend fun get(path: String): String = withContext(Dispatchers.IO) { http("GET", path, null) }

    private fun http(method: String, path: String, body: String?, auth: Boolean = true, retry: Boolean = true): String {
        val conn = URL(base + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.setRequestProperty("apikey", key)
            conn.setRequestProperty("Authorization", "Bearer " + if (auth) accessToken() else key)
            conn.setRequestProperty("Accept", "application/json")
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toByteArray()) }
            }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""
            if (code == 401 && auth && retry) {
                prefs.edit().putLong("expires", 0).apply()   // force a refresh and try once more
                return http(method, path, body, auth, retry = false)
            }
            if (code !in 200..299) throw ApiException(errorText(text, code), code)
            return text
        } finally {
            conn.disconnect()
        }
    }

    private fun errorText(text: String, code: Int): String = try {
        val j = JSONObject(text)
        j.optString("msg").ifBlank { j.optString("message") }.ifBlank { j.optString("error_description") }
            .ifBlank { j.optString("error") }.ifBlank { "Error $code" }
    } catch (_: Exception) {
        if (code == 0) "No connection" else "Error $code"
    }

    companion object {
        @Volatile private var inst: Api? = null
        fun get(context: Context): Api = inst ?: synchronized(this) {
            inst ?: Api(context.applicationContext).also { inst = it }
        }
        fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")
    }
}

fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
fun JSONObject.str(k: String): String? = if (isNull(k)) null else optString(k).ifBlank { null }
fun JSONObject.dbl(k: String): Double? = if (isNull(k) || !has(k)) null else optDouble(k).takeIf { !it.isNaN() }
