import json

from anvil import *
from anvil.js import window

from ._anvil_designer import MeasureTemplate
from ... import my, state

SIZES = ["XS", "S", "M", "L", "XL", "XXL"]


class Measure(MeasureTemplate):
    """#measure: the dossier. 13 measurements (help + the highlighted figure), size presets, straight / curved
    figures, cm or inches, sanity checks, and a 3D mannequin built from the numbers (it follows as you type)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.d = my.load_measure()
        self.focus = "chest"
        self._defs = json.loads(window.MY.measureFields())
        self._later = my.Later(self._refresh_3d, 400)
        for p in (self.figure_panel, self.size_panel, self.unit_panel):
            p.add_event_handler("x-chip", self._chip)
        self.fields.add_event_handler("x-measure", self._typed)
        self.fields.add_event_handler("x-focus", self._focused)
        self.guest_note.visible = not state.me()
        self.draw()
        self.fit.load_body(self.d["m"], self.d["figure"])
        self.fit.frame(100, 340)
        self.fit.toggle("spin", True)

    def _u(self, cm):
        return round(cm / 2.54, 2) if my.units() == "in" else round(cm, 1)

    def draw(self):
        u = my.units()
        self.figure_panel.items = [{"key": "straight", "label": "Straight figure", "on": self.d["figure"] == "straight", "group": "figure"},
                                   {"key": "curvy", "label": "Curved figure", "on": self.d["figure"] == "curvy", "group": "figure"}]
        self.size_panel.items = [{"key": s, "label": s, "on": self.d["size"] == s, "group": "size"} for s in SIZES] + \
            [{"key": "custom", "label": "Mine", "on": self.d["size"] == "custom", "group": "size"}]
        self.unit_panel.items = [{"key": "cm", "label": "cm", "on": u == "cm", "group": "units"}, {"key": "in", "label": "inches", "on": u == "in", "group": "units"}]
        self.fields.items = [{"key": f["key"], "label": f["label"], "help": f["help"], "value": self._u(self.d["m"][f["key"]]),
                              "unit": u, "step": "0.25" if u == "in" else "0.5", "on": f["key"] == self.focus} for f in self._defs]
        self._checks()
        self._show_focus()

    def _checks(self):
        warn = list(window.MY.measure.check(my.to_js(self.d["m"])))
        self.warn.text = "\n".join(str(w) for w in warn)
        self.warn.visible = bool(warn)
        self.stamp.text = ("Check %d" % len(warn)) if warn else "Cleared for cutting"
        self.stamp.role = ["my-stamp"] if warn else ["my-stamp", "good"]

    def _show_focus(self):
        f = [x for x in self._defs if x["key"] == self.focus][0]
        self.f_title.text, self.f_text.text = f["label"], f["help"]
        self.diagram.focus(self.focus)

    def _chip(self, key, group=None, **event_args):
        if group == "units":
            window.MY.setUnits(key)
        elif group == "figure":
            self.d["figure"] = key
            if self.d["size"] != "custom":
                self.d["m"] = my.to_py(window.MY.sizeMeasures(key, self.d["size"]))
        elif group == "size":
            self.d["size"] = key
            if key != "custom":
                self.d["m"] = my.to_py(window.MY.sizeMeasures(self.d["figure"], key))
        my.set_measure(self.d)
        self.draw()
        self._refresh_3d()

    def _typed(self, key, value, **event_args):
        try:
            v = float(str(value).replace(",", "."))
        except ValueError:
            return
        self.d["m"][key] = round(v * 2.54 if my.units() == "in" else v, 1)
        if self.d["size"] != "custom":
            self.d["size"] = "custom"
            self.size_panel.items = [dict(i, on=i["key"] == "custom") for i in self.size_panel.items]
        my.set_measure(self.d)
        self._checks()
        self._later()  # the mannequin follows once typing pauses

    def _focused(self, key, **event_args):
        self.focus = key
        for c in self.fields.get_components():
            getattr(c, "set_on")(getattr(c, "item")["key"] == key)
        self._show_focus()

    def _refresh_3d(self):
        self._later.cancel()
        self.fit.load_body(self.d["m"], self.d["figure"])
        self.fit.frame(100, 340)

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        for f in self._defs:
            v = self.d["m"].get(f["key"])
            if v is None or not (f["min"] * 0.8 <= v <= f["max"] * 1.2):
                state.toast("%s looks out of range. Please check it." % f["label"], "error")
                return
        self.save_button.enabled = False
        try:
            if my.save_measure(self.d):
                state.toast("Dossier saved. The patterns now draft to you.", "ok")
        finally:
            self.save_button.enabled = True
