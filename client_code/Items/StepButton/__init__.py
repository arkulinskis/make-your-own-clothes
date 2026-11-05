from anvil import *

from ._anvil_designer import StepButtonTemplate
from ... import state


class StepButton(StepButtonTemplate):
    """A making step in the fitting room's list. item = {k, n, title, none, on}. Raises "x-step" (k)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        s = self.item
        self.btn.text = "%s  %s%s" % (s["n"], s["title"], " (no seam in 3D)" if s.get("none") else "")
        role = ["st-step"]
        if s.get("on"):
            role.append("on")
        if s.get("none"):
            role.append("none")
        self.btn.role = role
        state.set_control_attr(self.btn, "aria-pressed", "true" if s.get("on") else "false")
        state.set_control_attr(self.btn, "data-key", "step%s" % s["k"])

    @handle("btn", "click")
    def btn_click(self, **event_args):
        if self.parent is not None:
            self.parent.raise_event("x-step", k=self.item["k"])
