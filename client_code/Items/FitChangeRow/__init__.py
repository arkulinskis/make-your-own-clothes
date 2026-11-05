from anvil import *

from ._anvil_designer import FitChangeRowTemplate
from ... import state


class FitChangeRow(FitChangeRowTemplate):
    """A fit change: what was typed, how it was read, on/off, remove. item = {id, text, explain, on, ok?, why?, preview?}.
    In the preview list (item["preview"]) there's no switch; a phrase that couldn't be read shows why.
    Raises "x-fit" (action, id, value)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        f = self.item
        preview = bool(f.get("preview"))
        self.said.text = "“%s”" % f.get("text", "")
        ok = f.get("ok", True)
        self.explain.text = f.get("explain") if ok else ("Not read: " + (f.get("why") or ""))
        self.box.classes["bad"] = not ok
        self.box.classes["off"] = not preview and f.get("on") is False
        self.on_check.visible = not preview
        self.remove_button.visible = not preview
        if not preview:
            self.on_check.checked = f.get("on") is not False
            state.set_control_attr(self.on_check, "aria-label", "Apply: " + f.get("text", ""))
            state.set_control_attr(self.remove_button, "aria-label", "Remove: " + f.get("text", ""))

    @handle("on_check", "change")
    def on_check_change(self, **event_args):
        if self.parent is not None:
            self.parent.raise_event("x-fit", action="toggle", id=self.item["id"], value=self.on_check.checked)

    @handle("remove_button", "click")
    def remove_button_click(self, **event_args):
        if self.parent is not None:
            self.parent.raise_event("x-fit", action="remove", id=self.item["id"], value=None)
