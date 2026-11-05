from anvil import *

from ._anvil_designer import MessageRowTemplate
from ... import state


class MessageRow(MessageRowTemplate):
    """A message in a quote's thread. item = {who, body, created, mine, status, role}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        m = self.item
        self.box.classes["mine"] = bool(m.get("mine"))
        self.who.text = m["who"]
        self.when.text = state.ago(m["created"])
        self.body.text = m["body"]
        held = m.get("mine") and m.get("role") == "tailor" and m.get("status") == "review"
        self.state_label.text = "with the shop for review"
        self.state_label.visible = bool(held)
