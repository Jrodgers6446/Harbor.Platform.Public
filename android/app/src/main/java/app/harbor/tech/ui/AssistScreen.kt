package app.harbor.tech.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.harbor.tech.AppModel
import app.harbor.tech.Guide

// Repair assist. Each tab is its own composable: add a name to TABS and a branch in the when below.
// Guides come from the app (starter set) plus the store's own in Supabase (repair_guides), which win on the same device + repair.
private val TABS = listOf("Steps", "Parts", "Checklist", "Notes")

private val CHECKLIST = listOf(
    "Pre-check: screen, touch, Face ID / fingerprint, cameras, speakers, mic, charging, buttons",
    "Note any existing damage with the customer before opening",
    "Battery disconnected before working on the board or display",
    "Post-check: everything from the pre-check works the same or better",
    "Clean the device, show the customer, get the final check done",
)

@Composable
fun AssistScreen(model: AppModel) {
    val job = model.sheet?.jobs?.firstOrNull { it.id == model.assistJobId } ?: model.selected
    var query by remember(job?.id) { mutableStateOf("") }
    var tab by remember { mutableStateOf(0) }
    var stepIdx by remember(job?.id, query) { mutableStateOf(0) }
    val checks = remember(job?.id) { mutableStateOf(setOf<Int>()) }

    val guide: Guide? = remember(model.guides, job?.id, query) { pickGuide(model.guides, job?.device, job?.filedParts, query) }

    val phone = screenSize() == ScreenSize.PHONE
    Column(Modifier.fillMaxSize().padding(horizontal = if (phone) 14.dp else 24.dp, vertical = if (phone) 12.dp else 18.dp),
        verticalArrangement = Arrangement.spacedBy(if (phone) 10.dp else 14.dp)) {
        val heading = @Composable { m: Modifier ->
            Column(m) {
                Text("Repair assist" + (guide?.let { " · ${it.device}" } ?: ""), style = Title)
                Text(job?.let { "For ${it.customer} · ${it.filedParts ?: it.device ?: ""}" } ?: "Search a device or repair", style = Small)
            }
        }
        val search = @Composable { m: Modifier ->
            OutlinedTextField(
                value = query, onValueChange = { query = it }, singleLine = true,
                placeholder = { Text("Search a device or repair", color = C.faint) },
                modifier = m,
                textStyle = TextStyle(fontSize = 15.sp, color = C.text), shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(focusedContainerColor = C.field, unfocusedContainerColor = C.field,
                    focusedBorderColor = C.accent, unfocusedBorderColor = C.fieldLine),
            )
        }
        if (phone) { heading(Modifier.fillMaxWidth()); search(Modifier.fillMaxWidth()) }
        else Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            heading(Modifier.weight(1f))
            search(Modifier.width(320.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            TABS.forEachIndexed { i, t ->
                val on = i == tab
                Text(t, color = if (on) Color.White else Color(0xFFC7C0D8), fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(if (on) C.accent else Color.Transparent)
                        .border(1.dp, if (on) C.accent else C.fieldLine, RoundedCornerShape(12.dp))
                        .clickable { tab = i }.padding(horizontal = 18.dp, vertical = 12.dp))
            }
        }
        Box(Modifier.weight(1f)) {
            when (TABS[tab]) {
                "Steps" -> Steps(guide, stepIdx) { stepIdx = it }
                "Parts" -> Parts(job)
                "Checklist" -> Checklist(checks.value) { i -> checks.value = if (i in checks.value) checks.value - i else checks.value + i }
                "Notes" -> Notes(model, job?.id)
            }
        }
    }
}

private fun pickGuide(all: List<Guide>, device: String?, parts: String?, query: String): Guide? {
    val q = query.trim().lowercase()
    if (q.isNotEmpty()) {
        return all.firstOrNull { (it.device + " " + it.repair).lowercase().contains(q) }
            ?: all.firstOrNull { g -> q.split(" ").all { w -> (g.device + " " + g.repair).lowercase().contains(w) } }
    }
    val d = device?.lowercase() ?: return all.firstOrNull { it.device.equals("Any phone", true) }
    val p = (parts ?: "").lowercase()
    val forDevice = all.filter { d.contains(it.device.lowercase()) || it.device.lowercase().contains(d) }
        .sortedByDescending { it.device.length }
    val general = all.filter { it.device.equals("Any phone", true) }
    fun byRepair(list: List<Guide>) = list.firstOrNull { g -> g.repair.lowercase().split(" ", "/").any { it.length > 2 && p.contains(it) } }
    return byRepair(forDevice) ?: forDevice.firstOrNull() ?: byRepair(general) ?: general.firstOrNull()
}

@Composable
private fun Steps(guide: Guide?, idx: Int, setIdx: (Int) -> Unit) {
    if (guide == null || guide.steps.isEmpty()) {
        Text("No guide for this device yet. Managers can add one in Supabase (repair_guides) and it shows up here.", style = Small)
        return
    }
    val phone = screenSize() == ScreenSize.PHONE
    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(Modifier.weight(1.4f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("${guide.device} · ${guide.repair}", style = Label)
            // Phones have no room for the side column: show the warning above the steps.
            if (phone) guide.warnings?.let { Chip("Watch out: $it", Color(0xFFFBE3B0), C.warnBg) }
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.weight(1f)) {
                itemsIndexed(guide.steps) { i, s ->
                    val done = i < idx; val on = i == idx
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                            .background(when { on -> C.accentBg; done -> Color(0xFF0F1A16); else -> C.card })
                            .border(if (on) 2.dp else 1.dp, when { on -> C.accent; done -> C.okLine; else -> C.cardLine }, RoundedCornerShape(14.dp))
                            .clickable { setIdx(i) }.padding(14.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.size(32.dp).clip(CircleShape).background(when { done -> Color(0xFF34D399); on -> C.accent; else -> Color(0xFF1F1B29) }),
                            contentAlignment = Alignment.Center) {
                            Text(if (done) "✓" else "${i + 1}", fontWeight = FontWeight.Bold, color = if (done) Color(0xFF062016) else Color.White)
                        }
                        Column {
                            Text(s.title, fontWeight = FontWeight.Bold, color = C.text)
                            if (s.detail.isNotBlank()) Text(s.detail, fontSize = 13.sp, color = if (on) Color(0xFFC7C0D8) else C.muted)
                        }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Secondary("Back", enabled = idx > 0) { setIdx(idx - 1) }
                Primary(if (idx >= guide.steps.size - 1) "Finish" else "Step done") { setIdx((idx + 1).coerceAtMost(guide.steps.size)) }
            }
        }
        if (!phone) Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            guide.warnings?.let {
                Card(Modifier.fillMaxWidth(), bg = C.warnBg, line = Color(0xFF4A3A17)) {
                    Column { Text("Watch out", fontWeight = FontWeight.Bold, color = Color(0xFFFBE3B0)); Text(it, fontSize = 13.sp, color = Color(0xFFFBE3B0)) }
                }
            }
            Box(Modifier.fillMaxWidth().heightIn(min = 140.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, C.accentLine, RoundedCornerShape(14.dp)).padding(14.dp),
                contentAlignment = Alignment.Center) {
                Text("Room for more tools later:\nphotos, part lookup, warranty check, ask a lead.", style = Small)
            }
        }
    }
}

@Composable
private fun Parts(job: app.harbor.tech.Job?) {
    Card(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("PARTS FOR THIS JOB", style = Label)
            if (job == null) { Text("Pick a customer on the Forms tab first.", style = Small); return@Column }
            Text("Filed: ${job.filedParts ?: "—"}", style = Body)
            Text("Part SKU: ${job.partSku.ifBlank { "—" }}   Back glass SKU: ${job.bgSku.ifBlank { "—" }}   Battery SKU: ${job.batterySku.ifBlank { "—" }}", style = Body)
            Text("SKUs come from the daily forms. Fill them in on the Forms tab.", style = Small)
        }
    }
}

@Composable
private fun Checklist(checked: Set<Int>, toggle: (Int) -> Unit) {
    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        CHECKLIST.forEachIndexed { i, item ->
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(C.card).clickable { toggle(i) }.padding(8.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = i in checked, onCheckedChange = { toggle(i) },
                    colors = CheckboxDefaults.colors(checkedColor = C.accent, uncheckedColor = C.muted))
                Text(item, style = Body)
            }
        }
    }
}

@Composable
private fun Notes(model: AppModel, jobId: String?) {
    val key = "note:" + (jobId ?: "general")
    var text by remember(key) { mutableStateOf(model.repo.api.prefString(key) ?: "") }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Notes stay on this tablet.", style = Small)
        OutlinedTextField(
            value = text, onValueChange = { text = it; model.repo.api.putPref(key, it) },
            modifier = Modifier.fillMaxWidth().heightIn(min = 220.dp),
            textStyle = TextStyle(fontSize = 16.sp, color = C.text), shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(focusedContainerColor = C.field, unfocusedContainerColor = C.field,
                focusedBorderColor = C.accent, unfocusedBorderColor = C.fieldLine),
        )
    }
}
