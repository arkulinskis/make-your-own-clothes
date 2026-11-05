from anvil import *

from ._anvil_designer import SeamRowTemplate
from ... import state


class SeamRow(SeamRowTemplate):
    """A seam in the truing table: both sides' lengths and whether they match (or are eased on purpose).
    Click = show it on the table. item = the table's seam row. Raises "x-seam" (action, id)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        s = self.item
        self.box.classes["on"] = bool(s.get("on"))
        self.name_label.text = s["label"]
        if s["closure"]:
            self.badge.text, self.badge.role = "buttoned", ["badge"]
        elif s["ok"]:
            self.badge.text, self.badge.role = ("eased" if s["eased"] else "true"), ["badge", "badge-good"]
        else:
            self.badge.text, self.badge.role = s["off"] + " off", ["badge", "badge-bad"]
        self.lens.text = "%s ↔ %s%s" % (s["a"], s["b"], (" · %s ease expected" % s["ease"]) if s["ease"] else "")
        self.remove_button.visible = bool(s["extra"])
        state.set_attr(self.box, "aria-pressed", "true" if s.get("on") else "false")
        state.set_attr(self.box, "aria-label", "Show %s on the table" % s["label"])

    def box_click(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-seam", action="toggle", id=self.item["id"])

    def box_key(self, event):
        if event.key in ("Enter", " "):
            event.preventDefault()
            self.box_click(event)

    @handle("remove_button", "click")
    def remove_button_click(self, **event_args):
        if self.parent is not None:
            self.parent.raise_event("x-seam", action="remove", id=self.item["id"])
