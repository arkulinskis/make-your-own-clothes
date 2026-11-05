from anvil import *
import anvil.js

from ._anvil_designer import MeasureFieldTemplate
from ... import state


class MeasureField(MeasureFieldTemplate):
    """One measurement: label, number in the visitor's units, how to measure it. item = {key, label, help, value,
    unit, step, on}. Typing raises "x-measure" (key, value in the shown units); focus raises "x-focus"."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.label.text = it["label"]
        self.help.text = it["help"]
        self.unit.text = it["unit"]
        self.value_box.text = it["value"]
        state.set_control_attr(self.value_box, "step", it["step"])
        state.set_control_attr(self.value_box, "inputmode", "decimal")
        state.set_control_attr(self.value_box, "aria-label", "%s in %s" % (it["label"], it["unit"]))
        state.set_control_attr(self.value_box, "data-key", it["key"])
        self.box.classes["on"] = bool(it.get("on"))
        node = state.control(self.value_box)
        node.addEventListener("input", anvil.js.report_exceptions(self._input))
        node.addEventListener("focus", anvil.js.report_exceptions(self._focus))

    def _input(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-measure", key=self.item["key"], value=self.value_box.text)

    def _focus(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-focus", key=self.item["key"])

    def set_on(self, on):
        self.box.classes["on"] = bool(on)
