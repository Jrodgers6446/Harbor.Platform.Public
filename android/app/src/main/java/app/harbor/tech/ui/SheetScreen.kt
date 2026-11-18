package app.harbor.tech.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.harbor.tech.AppModel
import app.harbor.tech.Job
import app.harbor.tech.Tab
import app.harbor.tech.clockText
import app.harbor.tech.windowText
import java.time.Instant
import java.time.format.DateTimeFormatter

private val dayFmt = DateTimeFormatter.ofPattern("EEE, MMM d")

@Composable
fun SheetScreen(model: AppModel) {
    val sheet = model.sheet
    Column(Modifier.fillMaxSize()) {
        // header (wraps onto two lines on phones)
        val size = screenSize()
        val phone = size == ScreenSize.PHONE
        val title = @Composable { m: Modifier ->
            Column(m) {
                Text("Today · " + (sheet?.date?.format(dayFmt) ?: java.time.LocalDate.now().format(dayFmt)),
                    fontSize = if (phone) 19.sp else 22.sp, fontWeight = FontWeight.SemiBold, color = C.text)
                Text(listOfNotNull(sheet?.techName, sheet?.van, sheet?.let { "${it.jobs.size} customers" }).joinToString(" · "), style = Small)
            }
        }
        val actions = @Composable {
            if (app.harbor.tech.LocationService.running) Chip("● Sharing location", C.ok, C.okBg)
            if (sheet != null) {
                if (sheet.clockIn == null) Primary("Clock in") { model.clockIn() }
                else Chip("Clocked in ${sheet.clockIn.clockText()}", C.accentText, C.accentBg)
                Segmented(listOf("y" to if (sheet.bodDone) "BOD done ✓" else "BOD"), if (sheet.bodDone) "y" else null,
                    { v -> model.editHeader { it.copy(bodDone = v != null) } },
                    mapOf("y" to (C.okBg to C.ok)))
            }
            Secondary(if (model.busy) "…" else "Refresh") { model.refresh() }
        }
        if (phone) {
            Column(Modifier.fillMaxWidth().border(1.dp, C.line).padding(horizontal = 14.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                title(Modifier.fillMaxWidth())
                Row(Modifier.horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)) { actions() }
            }
        } else {
            Row(
                Modifier.fillMaxWidth().border(1.dp, C.line).padding(horizontal = 24.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                title(Modifier.weight(1f))
                actions()
            }
        }

        when {
            sheet == null && !model.loaded -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Loading…", style = Small) }
            sheet == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("No sheet for today yet", style = Title)
                    Text(if (model.techId == null) "This login isn't linked to a tech yet. Your manager approves the tablet in Harbor → Devices and picks your name; then refresh."
                        else "Your manager sends it from Harbor (RT Daily Sheet → Send to tablets). Refresh once they have.", style = Small)
                    Secondary("Refresh") { model.refresh() }
                }
            }
            // Phones: the list, then one customer at a time (with a way back to the list).
            phone -> {
                val job = model.selected
                if (model.phoneCard && job != null) CustomerCard(model, job, sheet.submitted, Modifier.fillMaxSize(), onBack = { model.phoneCard = false })
                else CustomerList(model, Modifier.fillMaxSize(), onPick = { model.phoneCard = true })
            }
            else -> Row(Modifier.fillMaxSize()) {
                CustomerList(model, Modifier.width(if (size == ScreenSize.SMALL) 300.dp else 360.dp).fillMaxHeight())
                Box(Modifier.width(1.dp).fillMaxHeight().background(C.line))
                val job = model.selected
                if (job != null) CustomerCard(model, job, sheet.submitted, Modifier.weight(1f).fillMaxHeight())
            }
        }
    }
}

@Composable
private fun CustomerList(model: AppModel, modifier: Modifier, onPick: () -> Unit = {}) {
    val jobs = model.sheet?.jobs ?: emptyList()
    val done = jobs.count { it.done }
    Column(modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Text("CUSTOMERS", style = Label, modifier = Modifier.weight(1f))
            Text("$done of ${jobs.size} done", style = Small)
        }
        LinearProgressIndicator(
            progress = { if (jobs.isEmpty()) 0f else done / jobs.size.toFloat() },
            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(99.dp)),
            color = C.accent, trackColor = Color(0xFF1F1B29),
        )
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
            items(jobs, key = { it.id }) { j ->
                val on = j.id == model.selectedId
                val (bg, line) = when {
                    on -> C.accentBg to C.accent
                    j.done -> Color(0xFF0F1A16) to C.okLine
                    else -> C.card to C.cardLine
                }
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(bg)
                        .border(if (on) 2.dp else 1.dp, line, RoundedCornerShape(14.dp))
                        .clickable { model.select(j.id); onPick() }.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.size(30.dp).clip(CircleShape).background(when {
                        j.done -> Color(0xFF34D399); on -> C.accent; else -> Color(0xFF1F1B29)
                    }), contentAlignment = Alignment.Center) {
                        Text(if (j.done) "✓" else "${jobs.indexOf(j) + 1}", fontWeight = FontWeight.Bold,
                            color = if (j.done) Color(0xFF062016) else Color.White)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(j.customer, fontWeight = FontWeight.Bold, color = C.text)
                        Text(listOfNotNull(windowText(j.windowStart, j.windowEnd), j.device).joinToString(" · "),
                            fontSize = 13.sp, color = C.muted, maxLines = 1)
                    }
                    when {
                        j.outcome == "completed" -> Text("Done", fontSize = 12.sp, color = C.ok, fontWeight = FontWeight.SemiBold)
                        j.outcome == "rescheduled" -> Text("Resched", fontSize = 12.sp, color = C.warn, fontWeight = FontWeight.SemiBold)
                        j.outcome == "unrepaired" -> Text("Unrep", fontSize = 12.sp, color = C.warn, fontWeight = FontWeight.SemiBold)
                        on -> Text("Now", fontSize = 12.sp, color = C.accentText, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        if (model.sheet?.submitted == true) Chip("Sheet submitted ✓", C.ok, C.okBg)
        else Secondary("End of day →", Modifier.fillMaxWidth()) { model.tab = Tab.END_OF_DAY }
    }
}

@Composable
private fun CustomerCard(model: AppModel, job: Job, locked: Boolean, modifier: Modifier, onBack: (() -> Unit)? = null) {
    val ctx = LocalContext.current
    val phone = screenSize() == ScreenSize.PHONE
    Column(modifier.verticalScroll(rememberScrollState()).padding(horizontal = if (phone) 14.dp else 24.dp, vertical = if (phone) 12.dp else 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (onBack != null) Text("← Customers", color = C.accentText, modifier = Modifier.clickable { onBack() })
        val buttons = @Composable {
            Secondary("Navigate") { app.harbor.tech.Nav.stop(ctx, model.navApp, job) }
            Secondary("Repair assist") { model.assistJobId = job.id; model.tab = Tab.ASSIST }
        }
        if (phone) {
            Text(job.customer, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = C.text)
            Text(listOfNotNull(windowText(job.windowStart, job.windowEnd), job.address, job.carrier).joinToString(" · "), style = Small)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { buttons() }
        } else Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                Text(job.customer, fontSize = 26.sp, fontWeight = FontWeight.SemiBold, color = C.text)
                Text(listOfNotNull(windowText(job.windowStart, job.windowEnd), job.address, job.carrier).joinToString(" · "), style = Small)
            }
            buttons()
        }
        Card(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row { Text("Device  ", color = C.faint); Text(job.device ?: "—", color = C.text) }
                Row { Text("Filed  ", color = C.faint); Text(job.filedParts ?: "—", color = C.text) }
                job.problem?.let { Text("“$it”", color = Color(0xFFC7C0D8)) }
            }
        }
        val edit = { change: (Job) -> Job -> if (!locked) model.editJob(job.id, change) }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Field("Part SKU", job.partSku, { v -> edit { it.copy(partSku = v) } }, Modifier.weight(1f), number = true)
            Field("BG SKU", job.bgSku, { v -> edit { it.copy(bgSku = v) } }, Modifier.weight(1f), number = true)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Field("Battery SKU", job.batterySku, { v -> edit { it.copy(batterySku = v) } }, Modifier.weight(1f), number = true)
            Field("RW", job.rw, { v -> edit { it.copy(rw = v) } }, Modifier.weight(1f))
        }
        val status = @Composable {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Part status", style = Small)
                Segmented(listOf("used" to "Used", "rti" to "RTI"), job.partStatus, { v -> edit { it.copy(partStatus = v) } },
                    mapOf("rti" to (C.warnBg to C.warn)))
            }
        }
        val outcome = @Composable {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Outcome", style = Small)
                Segmented(listOf("completed" to "Completed", "rescheduled" to "Rescheduled", "unrepaired" to "Unrepaired"),
                    job.outcome, { v -> edit { it.copy(outcome = v) } },
                    mapOf("completed" to (C.okBg to C.ok), "rescheduled" to (C.warnBg to C.warn), "unrepaired" to (C.warnBg to C.warn)))
            }
        }
        if (phone) { status(); Box(Modifier.horizontalScroll(rememberScrollState())) { outcome() } }
        else Row(horizontalArrangement = Arrangement.spacedBy(24.dp), verticalAlignment = Alignment.Bottom) { status(); outcome() }
        if (job.outcome == "rescheduled" || job.outcome == "unrepaired" || job.reason.isNotBlank()) {
            Field("Reschedule / unrepaired reason", job.reason, { v -> edit { it.copy(reason = v) } }, Modifier.fillMaxWidth(),
                placeholder = "e.g. customer not home, rebooked Monday")
        }
        Spacer(Modifier.height(8.dp))
        if (!locked) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End)) {
            Secondary(if (job.id in model.dirty) "Save" else "Saved") { model.saveJob(job.id) }
            Primary(if (phone) "Done · next" else "Done · next customer") { model.doneAndNext() }
        }
    }
}

// ---------------------------------------------------------------- end of day

@Composable
fun EndOfDayScreen(model: AppModel) {
    val sheet = model.sheet ?: run { SheetScreen(model); return }
    val jobs = sheet.jobs
    var mileage by remember(sheet.id) { mutableStateOf(sheet.endMileage?.toString() ?: "") }
    var manager by remember { mutableStateOf("") }
    val strokes = remember { mutableStateListOf<List<Offset>>() }

    val phone = screenSize() == ScreenSize.PHONE
    val left = @Composable {
            Text("← Back to customers", color = C.accentText, modifier = Modifier.clickable { model.tab = Tab.SHEET })
            Text("End of day", style = Title)
            Text(listOfNotNull(sheet.date.format(dayFmt), sheet.techName, sheet.van).joinToString(" · "), style = Small)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Stat("${jobs.count { it.outcome == "completed" }}", "Completed", C.ok, C.okBg, Modifier.weight(1f))
                Stat("${jobs.count { it.outcome == "rescheduled" || it.outcome == "unrepaired" }}", "Resched / unrep", C.warn, C.warnBg, Modifier.weight(1f))
                Stat("${jobs.count { !it.done }}", "Not marked", C.text, C.card, Modifier.weight(1f))
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Clock out time", style = Small)
                if (sheet.clockOut == null) Primary("Clock out now", Modifier.fillMaxWidth(), enabled = !sheet.submitted) {
                    model.editHeader { it.copy(clockOut = Instant.now()) }
                } else Chip(sheet.clockOut.clockText(), C.text, C.card)
            }
            Field("End mileage", mileage, { v ->
                mileage = v.filter { it.isDigit() }.take(7)
                model.editHeader { it.copy(endMileage = mileage.toIntOrNull()) }
            }, Modifier.fillMaxWidth(), number = true)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("EOD", style = Small)
                Segmented(listOf("y" to "EOD done ✓", "n" to "Not yet"), if (sheet.eodDone) "y" else "n",
                    { v -> model.editHeader { it.copy(eodDone = v == "y") } }, mapOf("y" to (C.okBg to C.ok)))
            }
            }
    val right = @Composable { sigMod: Modifier ->
            if (sheet.submitted) {
                Chip("Submitted ✓ — ask a manager in Harbor if it needs to be reopened", C.ok, C.okBg)
            } else {
            Text("Hand the tablet to the manager. They sign with a finger, then tap Submit.", style = Small)
            Field("Manager", manager, { manager = it }, Modifier.fillMaxWidth(), placeholder = "Manager name")
            SignaturePad(strokes, sigMod)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End)) {
                Secondary("Clear") { strokes.clear() }
                Primary(if (model.busy) "Submitting…" else "Submit sheet",
                    enabled = !model.busy && manager.isNotBlank() && strokes.isNotEmpty() && sheet.clockOut != null) {
                    model.submit(manager, toSvgPath(strokes)) { strokes.clear() }
                }
            }
            if (sheet.clockOut == null) Text("Clock out first.", style = Small)
            }
    }
    if (phone) {
        // Phones: everything in one scrolling column; the signature pad gets a fixed height.
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            left()
            Text("Manager signature", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = C.text)
            right(Modifier.fillMaxWidth().height(240.dp))
        }
    } else Row(Modifier.fillMaxSize().padding(horizontal = 28.dp, vertical = 22.dp), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(14.dp)) { left() }
        Column(Modifier.weight(1.2f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Manager signature", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = C.text)
            right(Modifier.fillMaxWidth().weight(1f))
        }
    }
}

@Composable
private fun Stat(value: String, label: String, fg: Color, bg: Color, modifier: Modifier) {
    Card(modifier, bg = bg) {
        Column {
            Text(value, fontSize = 28.sp, fontWeight = FontWeight.Bold, color = fg)
            Text(label, style = Small)
        }
    }
}

@Composable
private fun SignaturePad(strokes: MutableList<List<Offset>>, modifier: Modifier) {
    var current by remember { mutableStateOf<List<Offset>>(emptyList()) }
    Box(modifier.heightIn(min = 220.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFFF6F3FB))
        .border(2.dp, C.accentLine, RoundedCornerShape(16.dp))) {
        Canvas(Modifier.fillMaxSize().pointerInput(Unit) {
            detectDragGestures(
                onDragStart = { current = listOf(it) },
                onDrag = { change, _ -> current = current + change.position },
                onDragEnd = { if (current.size > 1) strokes.add(current); current = emptyList() },
                onDragCancel = { current = emptyList() },
            )
        }) {
            val y = size.height - 40f
            drawLine(Color(0xFFC9C0DC), Offset(30f, y), Offset(size.width - 30f, y), strokeWidth = 2f)
            (strokes + listOf(current)).forEach { pts ->
                if (pts.size < 2) return@forEach
                val p = Path().apply { moveTo(pts[0].x, pts[0].y); pts.drop(1).forEach { lineTo(it.x, it.y) } }
                drawPath(p, Color(0xFF1D1630), style = Stroke(width = 5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }
        Text("Sign above the line", color = C.faint, fontSize = 12.sp, modifier = Modifier.align(Alignment.BottomStart).padding(14.dp))
    }
}

/** Signature as SVG path data, e.g. "M10 20 L12 22 ...", so Harbor can draw it on the printable sheet. */
private fun toSvgPath(strokes: List<List<Offset>>): String = strokes.joinToString(" ") { pts ->
    "M" + pts.joinToString(" L") { "${it.x.toInt()} ${it.y.toInt()}" }
}
