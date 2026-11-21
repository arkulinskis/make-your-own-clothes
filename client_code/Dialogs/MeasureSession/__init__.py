import json

from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import MeasureSessionTemplate
from ... import my

MODES = [("alone", "Just me"), ("helper", "A friend is helping")]
MODE_TIPS = {
    "alone": "Stand in front of a long mirror in close-fitting underwear, a soft tailor's tape in hand. Keep the tape level "
             "(check it in the mirror), snug but not pulling, and breathe out normally: don't hold your breath or stand "
             "taller than you do. Where a measurement is awkward alone, we suggest a trick.",
    "helper": "Stand relaxed with your feet together, looking straight ahead, arms by your sides. Your helper keeps the tape "
              "level all the way round, snug but not pulling, and reads it at the front. Breathe out normally.",
}
# tricks for the measurements that are hard to take on your own
ALONE = {
    "height": "Stand against a wall, lay a hardback book flat on your head, mark the wall under it, step away and measure the mark.",
    "chest": "Tape under the arms and round the fullest part. Turn side-on to the mirror: the tape must not dip at the back.",
    "waist": "Tie a piece of string or elastic round your waist and wiggle: it settles at the natural waist. Measure along it, and leave it on for back length and rise.",
    "hip": "Stand side-on to the mirror and slide the tape up and down to find the fullest part of the seat.",
    "shoulder": "Hard alone. Measure across the back of a shirt that fits you well, from one shoulder seam to the other, and use that.",
    "backLen": "With the waist string on, hold the tape's end at the bone at the base of your neck with one hand and read where it meets the string in the mirror (a hand mirror helps).",
    "armLen": "Put your hand on your hip so the elbow bends a little. Tape from the shoulder tip over the elbow to the wrist bone; or measure the sleeve of a shirt that fits.",
    "inseam": "Measure the inside leg of trousers that fit you well, from the crotch seam to the hem, and add the hem allowance you like to the floor.",
    "rise": "Sit on a hard chair with the waist string on: tape from the string at your side straight down to the seat.",
}
GAP_CM = 1.0  # two readings further apart than this get a third


class MeasureSession(MeasureSessionTemplate):
    """#measure -> "Measure with me": a guided session, one measurement at a time with the figure highlighted, a trick
    for taking it on your own, two readings (a third when they differ by more than 1 cm / 3/8 in) and the average.
    Closes with {key: cm} for the measurements taken (skipped ones are left out), or None."""

    def __init__(self, current=None, **properties):
        super().__init__(**properties)
        self._defs = json.loads(window.MY.measureFields())
        self._cur = dict(current or {})
        self.mode = "alone"
        self.i = 0
        self.got = {}      # key -> cm (the average)
        self.reads = {}    # key -> [the readings as typed]
        self.unit = "in" if my.units() == "in" else "cm"
        self.mode_panel.add_event_handler("x-chip", self._mode)
        for tb in (self.r1, self.r2, self.r3):
            tb.add_event_handler("pressed_enter", self._enter)
        self._phase("start")

    # ---- helpers
    def _u(self, cm):
        return cm / 2.54 if self.unit == "in" else cm

    def _cm(self, v):
        return v * 2.54 if self.unit == "in" else v

    def _num(self, tb):
        try:
            return float(str(tb.text if tb.text is not None else "").replace(",", "."))
        except ValueError:
            return None

    def _len(self, cm):
        return my.length(cm)

    def _phase(self, which):
        self.start_part.visible = which == "start"
        self.step_part.visible = which == "step"
        self.done_part.visible = which == "done"
        if which == "start":
            self.mode_panel.items = [{"key": k, "label": label, "on": k == self.mode, "group": "mode"} for k, label in MODES]
            self.mode_tips.text = MODE_TIPS[self.mode]
        elif which == "step":
            self._step()
        else:
            self._done()

    def _mode(self, key, **event_args):
        self.mode = key
        self._phase("start")

    @handle("go_button", "click")
    def go_button_click(self, **event_args):
        self.i = 0
        self._phase("step")

    # ---- one measurement
    def _step(self):
        f = self._defs[self.i]
        n = len(self._defs)
        self.count.text = "%d of %d" % (self.i + 1, n)
        anvil.js.get_dom_node(self.bar_fill).style.width = "%d%%" % round(100 * self.i / n)
        self.m_title.text = f["label"]
        self.m_help.text = f["help"]
        tip = ALONE.get(f["key"]) if self.mode == "alone" else None
        self.m_tip.text = ("On your own: " + tip) if tip else ""
        self.m_tip.visible = bool(tip)
        self.diagram.focus(f["key"])
        u = "in" if self.unit == "in" else "cm"
        self.r1_label.text, self.r2_label.text, self.r3_label.text = "First reading (%s)" % u, "Again, from the start (%s)" % u, "Once more (%s)" % u
        old = self.reads.get(f["key"]) or []
        self.r1.text = old[0] if len(old) > 0 else ""
        self.r2.text = old[1] if len(old) > 1 else ""
        self.r3.text = old[2] if len(old) > 2 else ""
        self.r3_part.visible = len(old) > 2
        self.msg.visible = False
        self.back_button.enabled = self.i > 0
        self.next_button.text = "Finish" if self.i == n - 1 else "Next"
        if self.mode == "alone" and f["key"] == "shoulder" and not old:
            self.skip_button.text = "Skip (keep %s)" % self._len(self._cur.get("shoulder")) if self._cur.get("shoulder") else "Skip"
        else:
            self.skip_button.text = "Skip"
        self.r1.focus()

    def _say(self, text):
        self.msg.text = text
        self.msg.visible = True

    def _enter(self, sender=None, **event_args):
        if sender is self.r1:
            self.r2.focus()
        else:
            self.next_button_click()

    @handle("next_button", "click")
    def next_button_click(self, **event_args):
        f = self._defs[self.i]
        lo, hi = f["min"] * 0.8, f["max"] * 1.2
        vals = [self._num(self.r1), self._num(self.r2)] + ([self._num(self.r3)] if self.r3_part.visible else [])
        if any(v is None for v in vals):
            self._say("Type both readings (a third one too, if we asked for it)." if vals[0] is not None else "Type your first reading.")
            return
        cms = [self._cm(v) for v in vals]
        if any(not (lo <= c <= hi) for c in cms):
            self._say("%s should be between %s and %s. Check the tape starts at 0 and the units are %s." % (
                f["label"], self._len(f["min"]), self._len(f["max"]), "inches" if self.unit == "in" else "centimetres"))
            return
        if len(cms) == 2 and abs(cms[0] - cms[1]) > GAP_CM:
            self.r3_part.visible = True
            self._say("Those two are %s apart. Take it once more, from the start, and we'll keep the two that agree." % self._len(abs(cms[0] - cms[1])))
            self.r3.focus()
            return
        if len(cms) == 3:
            pairs = sorted([(abs(cms[0] - cms[1]), (cms[0], cms[1])), (abs(cms[0] - cms[2]), (cms[0], cms[2])), (abs(cms[1] - cms[2]), (cms[1], cms[2]))])
            a, b = pairs[0][1]
        else:
            a, b = cms
        self.got[f["key"]] = round((a + b) / 2, 1)
        self.reads[f["key"]] = [str(self.r1.text or ""), str(self.r2.text or "")] + ([str(self.r3.text or "")] if self.r3_part.visible else [])
        self._advance()

    def _advance(self):
        if self.i < len(self._defs) - 1:
            self.i += 1
            self._phase("step")
        else:
            self._phase("done")

    @handle("skip_button", "click")
    def skip_button_click(self, **event_args):
        f = self._defs[self.i]
        self.got.pop(f["key"], None)
        self.reads.pop(f["key"], None)
        self._advance()

    @handle("back_button", "click")
    def back_button_click(self, **event_args):
        if self.i > 0:
            self.i -= 1
            self._phase("step")

    # ---- the summary
    def _done(self):
        rows = []
        for f in self._defs:
            k = f["key"]
            if k in self.got:
                old = self._cur.get(k)
                change = ""
                if old is not None and abs(self.got[k] - old) >= 0.5:
                    change = " (was %s)" % self._len(old)
                rows.append([f["label"], self._len(self.got[k]) + change])
            else:
                rows.append([f["label"], "skipped, kept %s" % self._len(self._cur.get(k)) if self._cur.get(k) is not None else "skipped"])
        self.summary.items = rows
        n = len(self.got)
        self.done_title.text = "Mission complete: %d of %d measured." % (n, len(self._defs)) if n else "Nothing measured yet."
        merged = dict(self._cur)
        merged.update(self.got)
        warn = [str(w) for w in window.MY.measure.check(my.to_js(merged))] if merged else []
        self.done_warn.text = "\n".join(warn)
        self.done_warn.visible = bool(warn)
        self.use_button.enabled = bool(n)

    @handle("again_button", "click")
    def again_button_click(self, **event_args):
        self.i = 0
        self._phase("step")

    @handle("use_button", "click")
    def use_button_click(self, **event_args):
        if self.got:
            self.raise_event("x-close-alert", value=dict(self.got))

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
