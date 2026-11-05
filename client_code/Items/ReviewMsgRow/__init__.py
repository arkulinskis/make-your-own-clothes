from anvil import *

from ._anvil_designer import ReviewMsgRowTemplate
from ... import state


class ReviewMsgRow(ReviewMsgRowTemplate):
    """Admin → Review: a tailor's message to a member, waiting for the shop. Raises "x-changed"."""

    def __init__(self, **properties):
        super().__init__(**properties)
        m = self.item
        self.who.text = m.get("sender") or "A tailor"
        self.when.text = state.ago(m["created"])
        self.req.text = m["request"]
        self.body.text = m["body"]

    def _decide(self, decision):
        if state.call("admin_review_message", self.item["id"], decision, self.note_box.text or ""):
            state.toast("Passed on." if decision == "approved" else "Not passed on.", "ok")
            if self.parent is not None:
                self.parent.raise_event("x-changed")

    @handle("approve_button", "click")
    def approve_button_click(self, **event_args):
        self._decide("approved")

    @handle("reject_button", "click")
    def reject_button_click(self, **event_args):
        self._decide("rejected")
