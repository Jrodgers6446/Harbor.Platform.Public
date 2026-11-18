package app.harbor.tech

import java.time.Duration
import java.time.Instant
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Orders the stops that are left.
 *  - FASTEST: least driving time, windows ignored.
 *  - ON_TIME: keeps stops inside their windows first (arriving early means waiting), then least driving.
 * Drive times are estimated from straight-line distance (x1.35 for roads, ~45 km/h average);
 * Google Maps does the turn-by-turn when the tech taps Navigate.
 */
object RoutePlanner {
    enum class Mode { FASTEST, ON_TIME }

    data class Stop(val job: Job, val eta: Instant, val driveMin: Int, val lateMin: Int, val earlyMin: Int = 0)
    data class Plan(val mode: Mode, val stops: List<Stop>, val driveMin: Int, val km: Double) {
        val inWindow: Int get() = stops.count { it.lateMin == 0 && it.earlyMin == 0 }
    }

    var serviceMinutes = 35L
    private const val ROAD = 1.35
    private const val KMH = 45.0

    fun plan(jobs: List<Job>, startLat: Double?, startLon: Double?, start: Instant, mode: Mode): Plan {
        val todo = jobs.filter { !it.done && it.lat != null && it.lon != null }
        if (todo.isEmpty()) return Plan(mode, emptyList(), 0, 0.0)
        val sLat = startLat ?: todo.first().lat!!
        val sLon = startLon ?: todo.first().lon!!

        val order: List<Job> = if (todo.size <= 8) {
            var best: List<Job> = todo
            var bestCost = Double.MAX_VALUE
            permutations(todo) { p ->
                val c = cost(p, sLat, sLon, start, mode)
                if (c < bestCost) { bestCost = c; best = p.toList() }
            }
            best
        } else {
            improve(greedy(todo, sLat, sLon, start, mode), sLat, sLon, start, mode)
        }
        return simulate(order, sLat, sLon, start, mode)
    }

    private fun simulate(order: List<Job>, sLat: Double, sLon: Double, start: Instant, mode: Mode): Plan {
        var t = start; var lat = sLat; var lon = sLon; var drive = 0; var km = 0.0
        val stops = order.map { j ->
            val d = km(lat, lon, j.lat!!, j.lon!!) * ROAD
            val m = (d / KMH * 60).toInt()
            km += d; drive += m
            t = t.plus(Duration.ofMinutes(m.toLong()))
            var early = 0
            if (j.windowStart != null && t.isBefore(j.windowStart)) {
                if (mode == Mode.ON_TIME) t = j.windowStart else early = Duration.between(t, j.windowStart).toMinutes().toInt()
            }
            val late = if (j.windowEnd != null && t.isAfter(j.windowEnd)) Duration.between(j.windowEnd, t).toMinutes().toInt() else 0
            val s = Stop(j, t, m, late, early)
            t = t.plus(Duration.ofMinutes(serviceMinutes)); lat = j.lat!!; lon = j.lon!!
            s
        }
        return Plan(mode, stops, drive, km)
    }

    private fun cost(order: List<Job>, sLat: Double, sLon: Double, start: Instant, mode: Mode): Double {
        val p = simulate(order, sLat, sLon, start, mode)
        return when (mode) {
            Mode.FASTEST -> p.driveMin.toDouble()
            Mode.ON_TIME -> p.stops.sumOf { it.lateMin } * 20.0 + p.stops.count { it.lateMin > 0 } * 300.0 + p.driveMin
        }
    }

    private fun greedy(todo: List<Job>, sLat: Double, sLon: Double, start: Instant, mode: Mode): List<Job> =
        if (mode == Mode.ON_TIME) {
            todo.sortedWith(compareBy<Job> { it.windowEnd ?: Instant.MAX }.thenBy { it.windowStart ?: Instant.MAX })
        } else {
            val left = todo.toMutableList(); val out = mutableListOf<Job>()
            var lat = sLat; var lon = sLon
            while (left.isNotEmpty()) {
                val n = left.minBy { km(lat, lon, it.lat!!, it.lon!!) }
                out += n; left -= n; lat = n.lat!!; lon = n.lon!!
            }
            out
        }

    /** 2-opt style improvement for long days. */
    private fun improve(order: List<Job>, sLat: Double, sLon: Double, start: Instant, mode: Mode): List<Job> {
        var best = order; var bestCost = cost(best, sLat, sLon, start, mode); var better = true
        while (better) {
            better = false
            for (i in 0 until best.size - 1) for (k in i + 1 until best.size) {
                val cand = best.subList(0, i) + best.subList(i, k + 1).reversed() + best.subList(k + 1, best.size)
                val c = cost(cand, sLat, sLon, start, mode)
                if (c < bestCost - 0.01) { best = cand; bestCost = c; better = true }
            }
        }
        return best
    }

    private fun <T> permutations(list: List<T>, visit: (List<T>) -> Unit) {
        val a = list.toMutableList()
        fun go(k: Int) {
            if (k == a.size) { visit(a); return }
            for (i in k until a.size) {
                a[k] = a[i].also { a[i] = a[k] }
                go(k + 1)
                a[k] = a[i].also { a[i] = a[k] }
            }
        }
        go(0)
    }

    fun km(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
        val r = 6371.0
        val dLat = Math.toRadians(bLat - aLat); val dLon = Math.toRadians(bLon - aLon)
        val h = sin(dLat / 2).pow(2) + cos(Math.toRadians(aLat)) * cos(Math.toRadians(bLat)) * sin(dLon / 2).pow(2)
        return 2 * r * asin(sqrt(h))
    }
}
