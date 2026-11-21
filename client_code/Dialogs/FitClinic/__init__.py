import json

from anvil import *
from anvil.js import window

from ._anvil_designer import FitClinicTemplate
from ... import my

AMOUNTS = {"cm": ["0.5", "1", "1.5", "2", "3", "4", "5"], "in": ["0.25", "0.5", "0.75", "1", "1.5", "2"]}
DEFAULT = {"cm": "1", "in": "0.5"}


class FitClinic(FitClinicTemplate):
    """The Fit Clinic (Studio -> Fit changes): from what the test garment shows (a place, then a wrinkle drawn on a
    card) to the words the fit-change reader understands. Closes with the phrase ("Let out the chest 2 cm") or None.
    The symptoms and their drawings come from MY.fitClinic() in my-fit.js; every phrase is checked by fittest.js."""

    def __init__(self, kind=None, **properties):
        super().__init__(**properties)
        self._areas = json.loads(window.MY.fitClinic())
        self.unit = "in" if my.units() == "in" else "cm"
        self.amt = DEFAULT[self.unit]
        self.area = "trousers" if kind == "Trousers" else "hips" if kind == "Skirts" else self._areas[0]["key"]
        self.sym = None
        self.area_panel.add_event_handler("x-chip", self._chip)
        self.amt_panel.add_event_handler("x-chip", self._chip)
        self.sym_panel.add_event_handler("x-symptom", self._symptom)
        self._draw()

    def _symptoms(self):
        return [a for a in self._areas if a["key"] == self.area][0]["symptoms"]

    def _picked(self):
        return ([s for s in self._symptoms() if s["id"] == self.sym] or [None])[0]

    def _draw(self):
        self.area_panel.items = [{"key": a["key"], "label": a["label"], "on": a["key"] == self.area, "group": "area"} for a in self._areas]
        self.sym_panel.items = [dict(s, on=s["id"] == self.sym) for s in self._symptoms()]
        s = self._picked()
        self.fix_part.visible = bool(s and s.get("phrase"))
        self.tip_part.visible = bool(s and not s.get("phrase"))
        if s and s.get("phrase"):
            short = "in" if self.unit == "in" else "cm"
            self.amt_panel.items = [{"key": a, "label": "%s %s" % (a, short), "on": a == self.amt, "group": "amt"} for a in AMOUNTS[self.unit]]
            text = s["phrase"].replace("{a}", "%s %s" % (self.amt, "inch" if self.unit == "in" else "cm"))
            self.phrase.text = text[0].upper() + text[1:]
            found = my.to_py(window.MY.parseFit(text)) or []
            self.explain.text = str(found[0].get("explain") or "") if found and found[0].get("ok") else ""
        elif s:
            self.tip_text.text = s.get("tip") or ""

    def _chip(self, key, group=None, **event_args):
        if group == "area":
            self.area, self.sym = key, None
        elif group == "amt":
            self.amt = key
        self._draw()

    def _symptom(self, id, **event_args):
        self.sym = None if self.sym == id else id
        self._draw()

    @handle("add_button", "click")
    def add_button_click(self, **event_args):
        if self.phrase.text:
            self.raise_event("x-close-alert", value=self.phrase.text)

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
