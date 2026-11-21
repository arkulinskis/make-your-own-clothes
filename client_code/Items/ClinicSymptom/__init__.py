from anvil import *

from ._anvil_designer import ClinicSymptomTemplate
from ... import state


class ClinicSymptom(ClinicSymptomTemplate):
    """A symptom card in the Fit Clinic: a small drawing of the wrinkle, what you see and what it means.
    item = {id, title, why, svg, phrase, tip, on}. Raises "x-symptom" (id) on the RepeatingPanel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.art.html = self.item["svg"]
        self.t.text = self.item["title"]
        self.w.text = self.item["why"]
        on = bool(self.item.get("on"))
        self.box.classes["on"] = on
        state.set_attr(self.box, "aria-pressed", "true" if on else "false")
        state.set_attr(self.box, "data-key", self.item["id"])

    def box_click(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-symptom", id=self.item["id"])
