from anvil import *

from ._anvil_designer import ReviewBidRowTemplate
from ... import router, state


class ReviewBidRow(ReviewBidRowTemplate):
    """Admin → Review: a tailor's quote waiting for the shop (or a recent decision, item["_done"]).
    Approve = the member sees it; reject = they never do. Raises "x-changed"."""

    def __init__(self, **properties):
        super().__init__(**properties)
        b = self.item
        self.who.text = b["tailor_name"]
        self.verified.visible = bool(b["verified"])
        self.email.text = b.get("email") or ""
        self.email_link.visible = bool(b.get("email"))
        state.set_attr(self.email_link, "href", "mailto:" + (b.get("email") or ""))
        self.when.text = state.ago(b["created"])
        self.req.text = b["request"]
        state.set_attr(self.req_link, "href", router.href("request", b["request_id"]))
        self.terms.text = "$%s · %s · %s" % (("%.2f" % b["price"]).rstrip("0").rstrip("."), state.plural(int(b["days"]), "day"), state.plural(int(b["fittings"]), "fitting"))
        self.message.text = b["message"]
        self.note_box.text = b.get("admin_note") or ""
        done = bool(b.get("_done"))
        self.acts.visible = not done
        self.note_box.enabled = not done
        self.status.visible = done
        self.status.text = b["status_label"]

    def _decide(self, decision):
        if state.call("admin_review_bid", self.item["id"], decision, self.note_box.text or ""):
            state.toast("Passed on to the member." if decision == "approved" else "Not passed on.", "ok")
            if self.parent is not None:
                self.parent.raise_event("x-changed")

    @handle("approve_button", "click")
    def approve_button_click(self, **event_args):
        self._decide("approved")

    @handle("reject_button", "click")
    def reject_button_click(self, **event_args):
        self._decide("rejected")
