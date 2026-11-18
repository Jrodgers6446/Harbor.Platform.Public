# Fast phone driver for Harbor Helper. Keeps a uiautomator2 session open so reading the screen takes
# ~0.3 s instead of 1-3 s with plain `adb uiautomator dump`. Talks JSON lines over stdin/stdout.
# If this can't start, the helper falls back to plain adb automatically.
import json
import sys
import traceback

def out(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

try:
    import uiautomator2 as u2
    d = u2.connect()
    info = d.info
    out({"ready": True, "w": info.get("displayWidth"), "h": info.get("displayHeight"), "rotation": info.get("displayRotation")})
except Exception as e:  # noqa: BLE001
    out({"ready": False, "error": f"{type(e).__name__}: {e}"})
    sys.exit(0)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req = {}
    try:
        req = json.loads(line)
        cmd, a = req["cmd"], req.get("args") or {}
        if cmd == "dump":
            r = d.dump_hierarchy(compressed=False)
        elif cmd == "click":
            d.click(a["x"], a["y"]); r = True
        elif cmd == "swipe":
            d.swipe(a["x1"], a["y1"], a["x2"], a["y2"], a.get("duration", 0.35)); r = True
        elif cmd == "type":
            d.send_keys(a["text"], clear=bool(a.get("clear", True))); r = True
        elif cmd == "paste":
            # Clipboard paste skips the keyboard, so autocorrect / predictive text can't drop or change letters.
            d.set_clipboard(a["text"])
            d.clear_text()
            d.shell("input keyevent 279")  # KEYCODE_PASTE
            r = True
        elif cmd == "settext":
            # Accessibility "set text" on the focused field (also skips the keyboard).
            el = d(focused=True)
            r = bool(el.exists and el.set_text(a["text"]) is not False)
        elif cmd == "clear":
            d.clear_text(); r = True
        elif cmd == "back":
            d.press("back"); r = True
        elif cmd == "size":
            i = d.info; r = {"w": i.get("displayWidth"), "h": i.get("displayHeight"), "rotation": i.get("displayRotation")}
        elif cmd == "ping":
            r = True
        else:
            raise ValueError("unknown command " + str(cmd))
        out({"id": req.get("id"), "ok": True, "result": r})
    except Exception as e:  # noqa: BLE001
        out({"id": req.get("id"), "ok": False, "error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()[-400:]})
