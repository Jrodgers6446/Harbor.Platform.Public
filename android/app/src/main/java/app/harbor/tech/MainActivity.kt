package app.harbor.tech

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import app.harbor.tech.ui.HarborApp
import app.harbor.tech.ui.HarborTheme

class MainActivity : ComponentActivity() {
    private lateinit var model: AppModel

    private val askLocation = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res ->
        if (res[Manifest.permission.ACCESS_FINE_LOCATION] == true && ::model.isInitialized && Api.get(this).paired) {
            LocationService.start(this)
            model.locate()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        model = AppModel(applicationContext)
        setContent { HarborTheme { HarborApp(model, ::askPermissions) } }
        if (model.screen == Screen.MAIN) model.onMain()
        if (model.screen == Screen.PAIR) model.watchPairing()
        handleInvite(intent)
        askPermissions()
    }

    // Opened from the website's tablet QR page: harbor://pair?t=<token>
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleInvite(intent)
    }

    private fun handleInvite(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme != "harbor" || uri.host != "pair") return
        val token = uri.getQueryParameter("t")?.filter { it.isLetterOrDigit() }?.take(64) ?: return
        if (token.length >= 16) model.useInvite(token)
    }

    private fun askPermissions() {
        val want = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) want += Manifest.permission.POST_NOTIFICATIONS
        askLocation.launch(want.toTypedArray())
    }

    override fun onResume() {
        super.onResume()
        if (::model.isInitialized && model.screen == Screen.MAIN) {
            LocationService.start(this)
            model.locate()
        }
    }
}
