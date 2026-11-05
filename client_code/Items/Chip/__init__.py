from anvil import *
import anvil.js

from ._anvil_designer import ChipTemplate
from ... import state


class Chip(ChipTemplate):
    """One choice in a row of chips. item = {key, label, on, group?}. A click raises "x-chip" on the RepeatingPanel
    (key, group); the page redraws the row."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.btn.text = self.item["label"]
        self.btn.role = ["chip", "on"] if self.item.get("on") else ["chip"]
        state.set_control_attr(self.btn, "aria-pressed", "true" if self.item.get("on") else "false")
        state.set_control_attr(self.btn, "data-key", "%s:%s" % (self.item.get("group") or "", self.item["key"]))

    @handle("btn", "click")
    def btn_click(self, **event_args):
        if self.parent is not None:
            key = state.focus_key()
            self.parent.raise_event("x-chip", key=self.item["key"], group=self.item.get("group"))
            if self.parent is not None:
                state.refocus(self.parent, key)
