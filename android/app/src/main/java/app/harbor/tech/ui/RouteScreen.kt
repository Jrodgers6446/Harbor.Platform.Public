package app.harbor.tech.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.viewinterop.AndroidView
import app.harbor.tech.AppModel
import app.harbor.tech.RoutePlanner
import app.harbor.tech.clockText
import app.harbor.tech.windowText
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.MapTileProviderBasic
import org.osmdroid.tileprovider.tilesource.OnlineTileSourceBase
import org.osmdroid.util.MapTileIndex
import org.osmdroid.views.overlay.TilesOverlay
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline

// Esri's free dark-gray map (CARTO's tiles now need an API key, which is why the map was blank).
// Esri orders tiles as {z}/{y}/{x}; the street names come on a second, see-through layer.
private class EsriTiles(name: String, path: String) : OnlineTileSourceBase(
    name, 0, 16, 256, "",
    arrayOf("https://server.arcgisonline.com/ArcGIS/rest/services/$path/MapServer/tile/"), "Tiles © Esri",
) {
    override fun getTileURLString(index: Long): String =
        baseUrl + MapTileIndex.getZoom(index) + "/" + MapTileIndex.getY(index) + "/" + MapTileIndex.getX(index)
}
private val darkTiles = EsriTiles("EsriDarkGray", "Canvas/World_Dark_Gray_Base")
private val darkLabels = EsriTiles("EsriDarkGrayLabels", "Canvas/World_Dark_Gray_Reference")

@Composable
fun RouteScreen(model: AppModel) {
    val ctx = LocalContext.current
    var plan by remember { mutableStateOf<RoutePlanner.Plan?>(null) }
    var other by remember { mutableStateOf<RoutePlanner.Plan?>(null) }
    val jobs = model.sheet?.jobs ?: emptyList()

    LaunchedEffect(model.mode, model.sheet, model.here) {
        val (fast, onTime) = model.planBoth()
        plan = if (model.mode == RoutePlanner.Mode.FASTEST) fast else onTime
        other = if (model.mode == RoutePlanner.Mode.FASTEST) onTime else fast
    }

    val size = screenSize()
    var note by remember { mutableStateOf<String?>(null) }
    val mapPart = @Composable { boxMod: Modifier ->
        Box(boxMod) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { c ->
                    Configuration.getInstance().apply {
                        userAgentValue = c.packageName
                        osmdroidBasePath = java.io.File(c.cacheDir, "osmdroid")
                        osmdroidTileCache = java.io.File(c.cacheDir, "osmdroid/tiles")
                    }
                    MapView(c).apply {
                        setTileSource(darkTiles)
                        maxZoomLevel = 19.0
                        // street names on top of the dark map (kept across redraws via the tag)
                        tag = TilesOverlay(MapTileProviderBasic(c, darkLabels), c).apply { setLoadingBackgroundColor(android.graphics.Color.TRANSPARENT); setLoadingLineColor(android.graphics.Color.TRANSPARENT) }
                        setMultiTouchControls(true)
                        zoomController.setVisibility(org.osmdroid.views.CustomZoomButtonsController.Visibility.NEVER)
                        controller.setZoom(11.0)
                        controller.setCenter(GeoPoint(33.749, -84.388))   // Atlanta until we know better
                    }
                },
                update = { map -> drawPlan(map, plan, jobs, model.here) },
            )
            Row(
                Modifier.padding(16.dp).clip(RoundedCornerShape(14.dp)).background(Color(0xE60C0B10))
                    .border(1.dp, C.fieldLine, RoundedCornerShape(14.dp)).padding(4.dp),
            ) {
                listOf(RoutePlanner.Mode.FASTEST to "Fastest", RoutePlanner.Mode.ON_TIME to "On time").forEach { (m, label) ->
                    val on = model.mode == m
                    Text(label, color = if (on) Color.White else C.muted, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(if (on) C.accent else Color.Transparent)
                            .clickable { model.mode = m }.padding(horizontal = 20.dp, vertical = 13.dp))
                }
            }
            Text(
                if (model.mode == RoutePlanner.Mode.ON_TIME) "On time keeps every stop inside its window."
                else "Fastest drives the least, even if a window is missed.",
                style = Small,
                modifier = Modifier.align(Alignment.BottomStart).padding(16.dp)
                    .clip(RoundedCornerShape(14.dp)).background(Color(0xE60C0B10)).padding(horizontal = 14.dp, vertical = 10.dp),
            )
        }
    }
    val panel = @Composable { panelMod: Modifier ->
        Column(panelMod.padding(if (size == ScreenSize.PHONE) 14.dp else 18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Route · " + if (model.mode == RoutePlanner.Mode.ON_TIME) "On time" else "Fastest", style = Title, modifier = Modifier.weight(1f))
                val stops = plan?.stops?.map { it.job } ?: emptyList()
                if (stops.isNotEmpty()) Primary("Open whole route") { note = app.harbor.tech.Nav.route(ctx, model.navApp, stops) }
            }
            note?.let { Text(it, style = Small) }
            val p = plan
            if (p == null || p.stops.isEmpty()) {
                Text(when {
                    jobs.isEmpty() -> "No customers on today's sheet."
                    jobs.all { it.done } -> "All customers are done. Nice work."
                    else -> "Finding the customers on the map… If this stays, the addresses on the sheet couldn't be found."
                }, style = Small)
                return@Column
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Stat2("%.0f mi".format(p.km * 0.621), "left today", Modifier.weight(1f))
                Stat2(minutes(p.driveMin), "driving", Modifier.weight(1f))
                Stat2("${p.inWindow} / ${p.stops.size}", "in window", Modifier.weight(1f), ok = p.inWindow == p.stops.size)
            }
            other?.let { o -> tradeoff(p, o)?.let { Chip(it, C.warn, C.warnBg) } }
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                itemsIndexed(p.stops, key = { _, s -> s.job.id }) { i, s ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                            .background(if (i == 0) C.accentBg else C.card)
                            .border(if (i == 0) 2.dp else 1.dp, if (i == 0) C.accent else C.cardLine, RoundedCornerShape(14.dp))
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.size(30.dp).clip(CircleShape).background(if (i == 0) C.accent else Color(0xFF1F1B29)),
                            contentAlignment = Alignment.Center) { Text("${i + 1}", color = Color.White, fontWeight = FontWeight.Bold) }
                        Column(Modifier.weight(1f)) {
                            Text(s.job.customer, fontWeight = FontWeight.Bold, color = C.text)
                            Text("ETA ${s.eta.clockText()} · ${windowText(s.job.windowStart, s.job.windowEnd)} · ${s.driveMin} min",
                                fontSize = 13.sp, color = C.muted)
                        }
                        if (i == 0) Primary("Navigate") { app.harbor.tech.Nav.stop(ctx, model.navApp, s.job) }
                        else if (s.lateMin > 0) Text("${s.lateMin} min late", color = C.warn, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        else if (s.earlyMin > 0) Text("${s.earlyMin} min early", color = C.warn, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        else Text("On time", color = C.ok, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            Text("Navigate and Open whole route use ${model.navApp.label} (change it in Settings). Lines on the map are straight; the order updates when a customer is marked done.",
                fontSize = 12.sp, color = C.faint)
        }
    }
    if (size == ScreenSize.PHONE) {
        Column(Modifier.fillMaxSize()) {
            mapPart(Modifier.fillMaxWidth().height(260.dp))
            Box(Modifier.fillMaxWidth().height(1.dp).background(C.line))
            panel(Modifier.fillMaxWidth().weight(1f))
        }
    } else {
        Row(Modifier.fillMaxSize()) {
            mapPart(Modifier.weight(1f).fillMaxHeight())
            Box(Modifier.width(1.dp).fillMaxHeight().background(C.line))
            panel(Modifier.width(if (size == ScreenSize.SMALL) 330.dp else 400.dp).fillMaxHeight())
        }
    }
}

@Composable
private fun Stat2(value: String, label: String, modifier: Modifier, ok: Boolean = false) {
    Card(modifier, bg = if (ok) C.okBg else C.card, line = if (ok) C.okLine else C.cardLine) {
        Column {
            Text(value, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = if (ok) C.ok else C.text)
            Text(label, fontSize = 12.sp, color = C.muted)
        }
    }
}

private fun minutes(m: Int) = if (m >= 60) "${m / 60} h ${m % 60} m" else "$m min"

private fun tradeoff(p: RoutePlanner.Plan, o: RoutePlanner.Plan): String? {
    val saved = p.driveMin - o.driveMin
    return when {
        p.mode == RoutePlanner.Mode.ON_TIME && saved > 2 && o.inWindow < p.inWindow ->
            "Fastest would save $saved min but misses ${p.inWindow - o.inWindow} window(s)."
        p.mode == RoutePlanner.Mode.ON_TIME && saved > 2 -> "Fastest would save $saved min and still make every window."
        p.mode == RoutePlanner.Mode.FASTEST && p.inWindow < o.inWindow ->
            "${o.inWindow - p.inWindow} stop(s) miss their window. On time adds ${-saved} min."
        else -> null
    }
}

private fun drawPlan(map: MapView, plan: RoutePlanner.Plan?, jobs: List<app.harbor.tech.Job>, here: Pair<Double, Double>?) {
    map.overlays.clear()
    (map.tag as? TilesOverlay)?.let { map.overlays.add(it) }
    val pts = mutableListOf<GeoPoint>()
    here?.let { (lat, lon) ->
        val g = GeoPoint(lat, lon); pts += g
        map.overlays += Marker(map).apply {
            position = g; title = "You"; icon = dot(map, 0xFF60A5FA.toInt(), "", 26)
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
        }
    }
    // finished customers in green
    jobs.filter { it.done && it.lat != null }.forEach { j ->
        map.overlays += Marker(map).apply {
            position = GeoPoint(j.lat!!, j.lon!!); title = j.customer; icon = dot(map, 0xFF34D399.toInt(), "✓", 40)
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
        }
    }
    plan?.stops?.forEachIndexed { i, s ->
        val g = GeoPoint(s.job.lat!!, s.job.lon!!); pts += g
        map.overlays += Marker(map).apply {
            position = g; title = "${i + 1}. ${s.job.customer}"; snippet = "ETA ${s.eta.clockText()}"
            icon = dot(map, if (i == 0) 0xFF8B5CF6.toInt() else 0xFF2B2540.toInt(), "${i + 1}", 44)
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
        }
    }
    if (pts.size > 1) {
        map.overlays.add(0, Polyline(map).apply {
            setPoints(pts)
            outlinePaint.color = 0xFF8B5CF6.toInt()
            outlinePaint.strokeWidth = 10f
            outlinePaint.strokeCap = Paint.Cap.ROUND
        })
        val box = BoundingBox.fromGeoPoints(pts)
        map.post { map.zoomToBoundingBox(box.increaseByScale(1.3f), false) }
    } else if (pts.size == 1) {
        map.controller.setCenter(pts[0])
    }
    map.invalidate()
}

private fun dot(map: MapView, color: Int, label: String, sizeDp: Int): BitmapDrawable {
    val d = map.resources.displayMetrics.density
    val px = (sizeDp * d).toInt()
    val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val p = Paint(Paint.ANTI_ALIAS_FLAG)
    p.color = 0xFFFFFFFF.toInt(); c.drawCircle(px / 2f, px / 2f, px / 2f, p)
    p.color = color; c.drawCircle(px / 2f, px / 2f, px / 2f - 3 * d, p)
    if (label.isNotEmpty()) {
        p.color = 0xFFFFFFFF.toInt(); p.textSize = px * 0.42f; p.textAlign = Paint.Align.CENTER; p.isFakeBoldText = true
        c.drawText(label, px / 2f, px / 2f - (p.descent() + p.ascent()) / 2, p)
    }
    return BitmapDrawable(map.resources, bmp)
}
