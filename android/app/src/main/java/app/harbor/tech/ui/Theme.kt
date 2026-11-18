package app.harbor.tech.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object C {
    val bg = Color(0xFF09080C)
    val rail = Color(0xFF0C0B10)
    val line = Color(0xFF1C1825)
    val card = Color(0xFF121018)
    val cardLine = Color(0xFF241F2F)
    val field = Color(0xFF0D0B12)
    val fieldLine = Color(0xFF2A2436)
    val accent = Color(0xFF8B5CF6)
    val accentBg = Color(0xFF1D1630)
    val accentLine = Color(0xFF3A2A63)
    val accentText = Color(0xFFD9CBFF)
    val text = Color(0xFFEDE9F6)
    val muted = Color(0xFFA39CB5)
    val faint = Color(0xFF7D7690)
    val ok = Color(0xFF5EE0A8)
    val okBg = Color(0xFF122A22)
    val okLine = Color(0xFF1F4A39)
    val warn = Color(0xFFFBC767)
    val warnBg = Color(0xFF2A2110)
    val bad = Color(0xFFF87171)
}

@Composable
fun HarborTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = C.accent, onPrimary = Color.White, background = C.bg, surface = C.card,
            onBackground = C.text, onSurface = C.text, error = C.bad,
        ),
        content = content,
    )
}

val Title = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.SemiBold, color = C.text)
val Body = TextStyle(fontSize = 15.sp, color = C.text)
val Small = TextStyle(fontSize = 13.sp, color = C.muted)
val Label = TextStyle(fontSize = 12.sp, color = C.faint, fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp)

@Composable
fun Primary(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick, enabled = enabled, modifier = modifier.heightIn(min = 52.dp),
        shape = RoundedCornerShape(14.dp), contentPadding = PaddingValues(horizontal = 24.dp),
        colors = ButtonDefaults.buttonColors(containerColor = C.accent, contentColor = Color.White),
    ) { Text(text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
}

@Composable
fun Secondary(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick, enabled = enabled, modifier = modifier.heightIn(min = 52.dp),
        shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, C.accentLine),
        contentPadding = PaddingValues(horizontal = 20.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = C.accentText),
    ) { Text(text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
}

/** A segmented choice like Used | RTI. Tapping the selected option clears it. */
@Composable
fun Segmented(options: List<Pair<String, String>>, selected: String?, onSelect: (String?) -> Unit,
              colors: Map<String, Pair<Color, Color>> = emptyMap()) {
    Row(
        Modifier.clip(RoundedCornerShape(12.dp)).background(C.card).border(1.dp, C.cardLine, RoundedCornerShape(12.dp)).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEach { (value, label) ->
            val on = value == selected
            val (bg, fg) = if (on) colors[value] ?: (C.accent to Color.White) else (Color.Transparent to C.muted)
            Box(
                Modifier.clip(RoundedCornerShape(10.dp)).background(bg)
                    .clickable { onSelect(if (on) null else value) }
                    .heightIn(min = 44.dp).padding(horizontal = 20.dp),
                contentAlignment = Alignment.Center,
            ) { Text(label, color = fg, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.padding(vertical = 11.dp)) }
        }
    }
}

@Composable
fun Field(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier,
          number: Boolean = false, password: Boolean = false, placeholder: String = "—") {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = Small)
        OutlinedTextField(
            value = value, onValueChange = onChange, singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(placeholder, color = C.faint) },
            textStyle = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = C.text),
            shape = RoundedCornerShape(12.dp),
            visualTransformation = if (password) androidx.compose.ui.text.input.PasswordVisualTransformation()
                else androidx.compose.ui.text.input.VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = when {
                password -> KeyboardType.Password; number -> KeyboardType.Number; else -> KeyboardType.Text
            }),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = C.field, unfocusedContainerColor = C.field,
                focusedBorderColor = C.accent, unfocusedBorderColor = C.fieldLine, cursorColor = C.accent,
            ),
        )
    }
}

@Composable
fun Card(modifier: Modifier = Modifier, bg: Color = C.card, line: Color = C.cardLine, content: @Composable () -> Unit) {
    Box(modifier.clip(RoundedCornerShape(14.dp)).background(bg).border(1.dp, line, RoundedCornerShape(14.dp)).padding(14.dp)) {
        content()
    }
}

@Composable
fun Chip(text: String, fg: Color, bg: Color) {
    Text(text, color = fg, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(99.dp)).background(bg).padding(horizontal = 12.dp, vertical = 6.dp))
}

/** PHONE: one pane at a time, bottom bar. SMALL: small tablets / tablets in portrait, narrower side panels.
 *  LARGE: 11" tablets in landscape, everything side by side. */
enum class ScreenSize { PHONE, SMALL, LARGE }

@Composable
fun screenSize(): ScreenSize {
    val w = androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp
    return when {
        w < 600 -> ScreenSize.PHONE
        w < 960 -> ScreenSize.SMALL
        else -> ScreenSize.LARGE
    }
}
