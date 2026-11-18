package app.harbor.tech

import android.annotation.SuppressLint
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job as CJob
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant

enum class Screen { SIGN_IN, STORE, PAIR, MAIN }
enum class Tab { SHEET, END_OF_DAY, ROUTE, ASSIST, SETTINGS }

/** App-wide state for the Compose screens. Lives as long as the activity process. */
class AppModel(private val context: Context) {
    val repo = Repo(context)
    private val api get() = repo.api
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    var screen by mutableStateOf(when {
        !api.signedIn -> Screen.SIGN_IN
        api.prefString("store") == null -> Screen.STORE
        !api.paired -> Screen.PAIR
        else -> Screen.MAIN
    })
    val store: String? get() = api.prefString("store")
    val techId: String? get() = api.prefString("tech_id")
    var tab by mutableStateOf(Tab.SHEET)
    var phoneCard by mutableStateOf(false)   // phones: showing one customer instead of the list
    var busy by mutableStateOf(false)
    var message by mutableStateOf<String?>(null)

    // pairing
    var pairCode by mutableStateOf(api.pairCode)
    var pairStatus by mutableStateOf("")

    // sheet
    var sheet by mutableStateOf<Sheet?>(null)
    var loaded by mutableStateOf(false)
    var selectedId by mutableStateOf<String?>(null)
    var dirty by mutableStateOf(setOf<String>())
    val selected: Job? get() = sheet?.jobs?.firstOrNull { it.id == selectedId }

    // route
    var mode by mutableStateOf(RoutePlanner.Mode.ON_TIME)
    var here by mutableStateOf<Pair<Double, Double>?>(null)

    // repair assist
    var guides by mutableStateOf<List<Guide>>(emptyList())
    var assistJobId by mutableStateOf<String?>(null)

    private var poll: CJob? = null

    // navigation app + map pins
    private val geo = Geo(context)
    var navApp by mutableStateOf(runCatching { NavApp.valueOf(api.prefString("navApp") ?: "GOOGLE") }.getOrDefault(NavApp.GOOGLE))
        private set
    fun chooseNavApp(a: NavApp) { navApp = a; api.putPref("navApp", a.name) }

    /** Looks up map coordinates for customers that came without them (kept on the tablet), so the map has pins. */
    private fun locateJobs() = scope.launch {
        val s = sheet ?: return@launch
        if (s.jobs.none { it.lat == null && !it.address.isNullOrBlank() }) return@launch
        val found = geo.fill(s.jobs).associateBy { it.id }
        val cur = sheet ?: return@launch
        sheet = cur.copy(jobs = cur.jobs.map { j ->
            val f = found[j.id]
            if (j.lat == null && f?.lat != null) j.copy(lat = f.lat, lon = f.lon) else j
        })
    }

    fun toast(m: String?) { message = m }

    // tablet QR (website: Download > Tablet)
    /** A setup token from the QR, kept until the tech has signed in and the tablet is paired. */
    var invite by mutableStateOf(api.prefString("invite"))

    fun useInvite(token: String) {
        if (api.paired) { toast("This tablet is already set up. Sign out first to set it up again."); return }
        api.putPref("invite", token); invite = token
        if (api.signedIn) scope.launch { busy = true; try { pairWithInvite() } finally { busy = false } }
        else toast("Sign in to finish setting up this tablet")
    }

    /** Returns true when the tablet got paired from the QR. */
    private suspend fun pairWithInvite(): Boolean {
        val token = invite ?: return false
        return try {
            val store = repo.pairWithInvite(token)
            api.putPref("invite", null); invite = null
            screen = Screen.MAIN; onMain()
            toast("Tablet set up for $store")
            true
        } catch (e: Exception) {
            api.putPref("invite", null); invite = null
            toast(e.message ?: "Couldn't use the QR code"); false
        }
    }

    // sign in / pairing
    var codeSentTo by mutableStateOf<String?>(null)

    fun sendCode(email: String) = scope.launch {
        busy = true
        try {
            api.sendCode(email)
            codeSentTo = email.trim()
            toast("Code sent to ${email.trim()}")
        } catch (e: Exception) {
            toast(friendlyAuth(e.message))
        } finally { busy = false }
    }

    fun verifyCode(code: String) = scope.launch {
        val email = codeSentTo ?: return@launch
        busy = true
        try {
            api.verifyCode(email, code)
            codeSentTo = null
            afterSignIn()
        } catch (e: Exception) {
            toast(if (e.message?.contains("expired", true) == true || e.message?.contains("invalid", true) == true)
                "That code is wrong or expired. Send a new one." else friendlyAuth(e.message))
        } finally { busy = false }
    }

    private fun friendlyAuth(m: String?): String = when {
        m == null -> "Couldn't sign in"
        m.contains("added to a store", true) || m.contains("not allowed", true) -> "This email hasn't been added to a store yet. Ask your manager."
        m.contains("security purposes", true) || m.contains("rate", true) -> "Too many codes asked for. Wait a minute and try again."
        else -> m
    }

    /** Decides the next screen from what the server knows about this login. */
    private suspend fun afterSignIn() {
        if (invite != null && !api.paired && pairWithInvite()) return
        val me = try { repo.me() } catch (e: ApiException) { if (e.code == 401) null else throw e }
        screen = when {
            me == null -> Screen.STORE
            !api.paired -> Screen.PAIR
            else -> Screen.MAIN
        }
        if (screen == Screen.MAIN) onMain()
    }

    fun joinStore(code: String) = scope.launch {
        busy = true
        try {
            repo.joinStore(code)
            screen = if (api.paired) Screen.MAIN else Screen.PAIR
            if (screen == Screen.MAIN) onMain()
        } catch (e: Exception) { toast(e.message ?: "Couldn't join the store") } finally { busy = false }
    }

    fun signOut() {
        LocationService.stop(context)
        api.signOut()
        api.putPref("store", null); api.putPref("tech_id", null); api.putPref("invite", null); invite = null
        sheet = null; loaded = false; pairCode = null
        screen = Screen.SIGN_IN
    }

    fun startPairing() = scope.launch {
        busy = true
        try {
            pairCode = repo.requestPairing().code
            pairStatus = "pending"
            watchPairing()
        } catch (e: Exception) { toast(e.message) } finally { busy = false }
    }

    fun watchPairing() {
        poll?.cancel()
        if (api.deviceId == null) return
        poll = scope.launch {
            while (true) {
                try {
                    val s = repo.checkPairing()
                    pairStatus = s
                    when (s) {
                        "active" -> { screen = Screen.MAIN; onMain(); return@launch }
                        "revoked", "claimed", "none" -> return@launch
                    }
                } catch (e: Exception) { pairStatus = e.message ?: "offline" }
                delay(5_000)
            }
        }
    }

    // main
    fun onMain() {
        LocationService.start(context)
        refresh()
        scope.launch { guides = try { repo.guides() } catch (_: Exception) { emptyList() } }
        locate()
    }

    fun refresh() = scope.launch {
        busy = true
        try {
            flushDirty()
            try { repo.me() } catch (_: Exception) { }
            val s = repo.loadSheet()
            sheet = s
            locateJobs()
            if (selectedId == null || s?.jobs?.none { it.id == selectedId } == true) {
                selectedId = s?.jobs?.firstOrNull { !it.done }?.id ?: s?.jobs?.firstOrNull()?.id
            }
        } catch (e: ApiException) {
            if (e.code == 401) signOut() else toast(e.message)
        } catch (e: Exception) {
            toast(e.message ?: "Couldn't load today's sheet")
        } finally { busy = false; loaded = true }
    }

    @SuppressLint("MissingPermission")
    fun locate() {
        if (!LocationService.hasLocation(context)) return
        LocationServices.getFusedLocationProviderClient(context).lastLocation
            .addOnSuccessListener { l -> if (l != null) here = l.latitude to l.longitude }
    }

    // editing the sheet
    fun editJob(id: String, change: (Job) -> Job) {
        val s = sheet ?: return
        if (s.submitted) return
        sheet = s.copy(jobs = s.jobs.map { if (it.id == id) change(it) else it })
        dirty = dirty + id
    }

    fun select(id: String) {
        val prev = selectedId
        selectedId = id
        if (prev != null && prev in dirty) saveJob(prev, quiet = true)
    }

    fun saveJob(id: String, quiet: Boolean = false) = scope.launch {
        val j = sheet?.jobs?.firstOrNull { it.id == id } ?: return@launch
        try {
            repo.saveJob(j)
            dirty = dirty - id
            if (!quiet) toast("Saved")
        } catch (e: Exception) { toast("Not saved: " + (e.message ?: "no connection") + ". It will retry.") }
    }

    /** Marks the selected customer done (Completed if no outcome was picked), saves, and moves to the next one. */
    fun doneAndNext() {
        val j = selected ?: return
        if (j.outcome == null) editJob(j.id) { it.copy(outcome = "completed") }
        if (j.outcome != null && j.outcome != "completed" && j.reason.isBlank()) {
            toast("Add the reschedule / unrepaired reason first"); return
        }
        saveJob(j.id, quiet = true)
        val jobs = sheet?.jobs ?: return
        val next = jobs.drop(jobs.indexOfFirst { it.id == j.id } + 1).firstOrNull { !it.done }
            ?: jobs.firstOrNull { !it.done && it.id != j.id }
        if (next != null) selectedId = next.id else tab = Tab.END_OF_DAY
    }

    private suspend fun flushDirty() {
        val s = sheet ?: return
        for (id in dirty) {
            val j = s.jobs.firstOrNull { it.id == id } ?: continue
            try { repo.saveJob(j); dirty = dirty - id } catch (_: Exception) { }
        }
    }

    fun editHeader(change: (Sheet) -> Sheet) = scope.launch {
        val s = sheet ?: return@launch
        if (s.submitted) return@launch
        val n = change(s)
        sheet = n
        try { repo.saveHeader(n) } catch (e: Exception) { toast("Not saved: " + (e.message ?: "no connection")) }
    }

    fun clockIn() = editHeader { it.copy(clockIn = it.clockIn ?: Instant.now()) }

    fun submit(manager: String, signature: String, done: () -> Unit) = scope.launch {
        val s = sheet ?: return@launch
        busy = true
        try {
            flushDirty()
            if (dirty.isNotEmpty()) throw ApiException("Some customers aren't saved yet. Check the connection.")
            repo.submit(s, manager, signature)
            toast("Sheet submitted")
            done()
            refresh()
        } catch (e: Exception) { toast(e.message ?: "Couldn't submit") } finally { busy = false }
    }

    suspend fun plan(): RoutePlanner.Plan = withContext(Dispatchers.Default) {
        val jobs = sheet?.jobs ?: emptyList()
        RoutePlanner.plan(jobs, here?.first, here?.second, Instant.now(), mode)
    }

    suspend fun planBoth(): Pair<RoutePlanner.Plan, RoutePlanner.Plan> = withContext(Dispatchers.Default) {
        val jobs = sheet?.jobs ?: emptyList()
        val now = Instant.now()
        RoutePlanner.plan(jobs, here?.first, here?.second, now, RoutePlanner.Mode.FASTEST) to
            RoutePlanner.plan(jobs, here?.first, here?.second, now, RoutePlanner.Mode.ON_TIME)
    }
}
