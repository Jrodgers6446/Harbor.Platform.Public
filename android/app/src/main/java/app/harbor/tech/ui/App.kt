package app.harbor.tech.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.harbor.tech.AppModel
import app.harbor.tech.BuildConfig
import app.harbor.tech.LocationService
import app.harbor.tech.NavApp
import app.harbor.tech.Screen
import app.harbor.tech.Tab
import kotlinx.coroutines.delay

@Composable
fun HarborApp(model: AppModel, askPermissions: () -> Unit) {
    Box(Modifier.fillMaxSize().background(C.bg)) {
        when (model.screen) {
            Screen.SIGN_IN -> SignIn(model)
            Screen.STORE -> StoreScreen(model)
            Screen.PAIR -> PairScreen(model)
            Screen.MAIN -> Shell(model, askPermissions)
        }
        model.message?.let { m ->
            LaunchedEffect(m) { delay(3500); if (model.message == m) model.toast(null) }
            Box(Modifier.align(Alignment.BottomCenter).padding(24.dp)
                .clip(RoundedCornerShape(12.dp)).background(Color(0xFF241F2F))
                .clickable { model.toast(null) }.padding(horizontal = 18.dp, vertical = 12.dp)) {
                Text(m, style = Body)
            }
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 460.dp).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) { content() }
    }
}

@Composable
private fun SignIn(model: AppModel) {
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    val sentTo = model.codeSentTo
    Centered {
        Logo(56)
        Text("Harbor", style = Title)
        if (model.invite != null) Chip("Setting up this tablet from the QR code. Sign in to finish.", C.accentText, C.accentBg)
        if (sentTo == null) {
            Text("Enter your work email. We'll email you a 6-digit code. Your manager has to add your email first.", style = Small)
            Field("Email", email, { email = it.trim() }, placeholder = "you@example.com")
            Primary(if (model.busy) "Sending…" else "Email me a code", Modifier.fillMaxWidth(),
                enabled = !model.busy && email.contains("@")) { model.sendCode(email) }
        } else {
            Text("We emailed a code to $sentTo. It works for 1 hour.", style = Small)
            Field("6-digit code", code, { code = it.filter { c -> c.isDigit() }.take(6) }, number = true, placeholder = "123456")
            Primary(if (model.busy) "Checking…" else "Sign in", Modifier.fillMaxWidth(),
                enabled = !model.busy && code.length == 6) { model.verifyCode(code); code = "" }
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Text("Send again", color = C.accentText, modifier = Modifier.clickable { model.sendCode(sentTo) })
                Text("Use a different email", color = C.accentText, modifier = Modifier.clickable { model.codeSentTo = null })
            }
        }
    }
}

@Composable
private fun StoreScreen(model: AppModel) {
    var code by remember { mutableStateOf("") }
    Centered {
        Logo(56)
        Text("Which store?", style = Title)
        Text("Type the store code your manager gave you. It links this login to that store only.", style = Small)
        Field("Store code", code, { code = it.uppercase().filter { c -> c.isLetterOrDigit() }.take(6) }, placeholder = "ABC123")
        Primary(if (model.busy) "Joining…" else "Join store", Modifier.fillMaxWidth(), enabled = !model.busy && code.length == 6) {
            model.joinStore(code)
        }
        Text("Signed in as ${model.repo.api.email ?: ""}", style = Small)
        Text("Sign out", color = C.accentText, modifier = Modifier.clickable { model.signOut() })
    }
}

@Composable
private fun PairScreen(model: AppModel) {
    Centered {
        Logo(56)
        Text("Pair this tablet", style = Title)
        model.store?.let { Chip(it, C.accentText, C.accentBg) }
        val code = model.pairCode
        if (code == null) {
            Text("Your manager approves the tablet in Harbor → Devices. Tap below to get a code to show them.", style = Small)
            Primary(if (model.busy) "Asking…" else "Get pairing code", Modifier.fillMaxWidth(), enabled = !model.busy) { model.startPairing() }
        } else {
            Text("Show this code to your manager. They approve it in Harbor → Devices.", style = Small)
            Text(code.chunked(3).joinToString(" "), fontSize = 64.sp, fontWeight = FontWeight.Bold, color = C.text,
                letterSpacing = 6.sp)
            when (model.pairStatus) {
                "revoked" -> Text("The manager denied this tablet. Ask them, then get a new code.", color = C.warn)
                "claimed" -> Text("This tablet was already set up once. Get a new code and have it approved again.", color = C.warn)
                else -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CircularProgressIndicator(Modifier.size(18.dp), color = C.accent, strokeWidth = 2.dp)
                    Text("Waiting for approval…", style = Small)
                }
            }
            Secondary("Get a new code", Modifier.fillMaxWidth(), enabled = !model.busy) { model.startPairing() }
        }
        Text("Signed in as ${model.repo.api.email ?: ""}", style = Small)
        Text("Sign out", color = C.accentText, modifier = Modifier.clickable { model.signOut() })
    }
}

@Composable
fun Logo(size: Int) {
    Box(Modifier.size(size.dp).clip(RoundedCornerShape((size / 4).dp)).background(C.accent), contentAlignment = Alignment.Center) {
        Text("⚓", fontSize = (size / 2).sp, color = Color.White)
    }
}

@Composable
private fun Shell(model: AppModel, askPermissions: () -> Unit) {
    val size = screenSize()
    val tabs = listOf(Triple(Tab.SHEET, "Sheet", "▤"), Triple(Tab.ROUTE, "Route", "➜"), Triple(Tab.ASSIST, "Assist", "🔧"))
    val isOn = { t: Tab -> model.tab == t || (t == Tab.SHEET && model.tab == Tab.END_OF_DAY) }
    val content = @Composable { m: Modifier ->
        Box(m) {
            when (model.tab) {
                Tab.SHEET -> SheetScreen(model)
                Tab.END_OF_DAY -> EndOfDayScreen(model)
                Tab.ROUTE -> RouteScreen(model)
                Tab.ASSIST -> AssistScreen(model)
                Tab.SETTINGS -> SettingsScreen(model, askPermissions)
            }
        }
    }
    if (size == ScreenSize.PHONE) {
        // Phones: one screen at a time with a bar along the bottom.
        Column(Modifier.fillMaxSize()) {
            content(Modifier.weight(1f).fillMaxWidth())
            Row(
                Modifier.fillMaxWidth().background(C.rail).border(1.dp, C.line).padding(horizontal = 6.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                tabs.forEach { (t, label, icon) -> RailButton(label, icon, isOn(t), compact = true) { model.tab = t } }
                RailButton("Settings", "⚙", model.tab == Tab.SETTINGS, compact = true) { model.tab = Tab.SETTINGS }
            }
        }
        return
    }
    Row(Modifier.fillMaxSize()) {
        Column(
            Modifier.width(if (size == ScreenSize.SMALL) 76.dp else 88.dp).fillMaxHeight().background(C.rail).border(1.dp, C.line).padding(vertical = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Logo(if (size == ScreenSize.SMALL) 40 else 44)
            Spacer(Modifier.height(10.dp))
            tabs.forEach { (t, label, icon) -> RailButton(label, icon, isOn(t)) { model.tab = t } }
            Spacer(Modifier.weight(1f))
            RailButton("Settings", "⚙", model.tab == Tab.SETTINGS) { model.tab = Tab.SETTINGS }
        }
        content(Modifier.weight(1f).fillMaxHeight())
    }
}

@Composable
private fun RailButton(label: String, icon: String, on: Boolean, compact: Boolean = false, onClick: () -> Unit) {
    Column(
        Modifier.size(if (compact) 58.dp else 64.dp).clip(RoundedCornerShape(14.dp))
            .background(if (on) C.accentBg else Color.Transparent)
            .border(1.dp, if (on) C.accentLine else Color.Transparent, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Text(icon, fontSize = if (compact) 18.sp else 20.sp, color = if (on) C.text else C.muted)
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = if (on) C.text else C.muted)
    }
}

@Composable
private fun SettingsScreen(model: AppModel, askPermissions: () -> Unit) {
    val ctx = LocalContext.current
    val api = model.repo.api
    Column(Modifier.verticalScroll(rememberScrollState()).padding(if (screenSize() == ScreenSize.PHONE) 16.dp else 24.dp).widthIn(max = 640.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Settings", style = Title)
        Card(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Signed in as ${api.email ?: "—"}", style = Body)
                Text("Store: ${model.store ?: "not joined"}" + (model.techId?.let { " · tech $it" } ?: " · not linked to a tech yet"), style = Small)
                Text("Tablet paired: ${if (api.paired) "yes" else "no"}", style = Small)
                val last = LocationService.lastReport
                Text("Location: " + when {
                    !LocationService.hasLocation(ctx) -> "permission needed"
                    LocationService.lastError != null -> "error: ${LocationService.lastError}"
                    last > 0 -> "last sent ${((System.currentTimeMillis() - last) / 60000)} min ago"
                    LocationService.running -> "starting"
                    else -> "off"
                }, style = Small)
                Text("App version ${BuildConfig.VERSION_NAME}", style = Small)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            Secondary("Allow location") { askPermissions() }
            Secondary("Allow all the time") {
                // Android only lets apps ask for background location from the app's settings page.
                ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.packageName))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
        Text("Pick “Allow all the time” under Location so sharing keeps working after a restart.", style = Small)
        Spacer(Modifier.height(6.dp))
        Text("Navigation app", fontWeight = FontWeight.SemiBold, color = C.text)
        Text("Navigate and “Open whole route” use this app.", style = Small)
        Segmented(NavApp.values().map { it.name to it.label }, model.navApp.name, { v -> if (v != null) model.chooseNavApp(NavApp.valueOf(v)) })
        Spacer(Modifier.height(10.dp))
        Secondary("Sign out", Modifier.fillMaxWidth()) { model.signOut() }
    }
}
