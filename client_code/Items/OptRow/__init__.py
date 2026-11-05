from anvil import *
import anvil.js

from ._anvil_designer import OptRowTemplate
from ... import state


class OptRow(OptRowTemplate):
    """One fit option of a pattern: a row of chips (choice) or a slider (range).
    item = {key, label, type, values, min, max, step, unit, value, shown}. Raises "x-opt" (key, value, quiet)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.label.text = it["label"] + (": " if it["type"] != "choice" else "")
        self.shown.text = it.get("shown") or ""
        is_choice = it["type"] == "choice"
        self.chips.visible = is_choice
        self.range.visible = not is_choice
        if is_choice:
            self.chips.items = [{"key": str(v[0]), "label": v[1], "on": str(v[0]) == str(it["value"]), "group": it["key"]} for v in it["values"]]
            self.chips.add_event_handler("x-chip", self._chip)
        else:
            node = anvil.js.get_dom_node(self.range)
            for a in ("min", "max", "step"):
                node.setAttribute(a, str(it[a]))
            setattr(node, "value", str(it["value"]))
            node.setAttribute("aria-label", it["label"])

    def _chip(self, key, group=None, **event_args):
        if self.parent is not None:
            self.parent.raise_event("x-opt", key=self.item["key"], value=key, quiet=False)

    def range_input(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-opt", key=self.item["key"], value=getattr(anvil.js.get_dom_node(self.range), "value"), quiet=True, row=self)

    def range_change(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-opt", key=self.item["key"], value=getattr(anvil.js.get_dom_node(self.range), "value"), quiet=False, row=self)

    def show_value(self, text):
        self.shown.text = text
