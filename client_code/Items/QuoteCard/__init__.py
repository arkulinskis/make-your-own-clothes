from anvil import *

from ._anvil_designer import QuoteCardTemplate
from ... import state


class QuoteCard(QuoteCardTemplate):
    """A quote for one of my requests (only ones the shop approved reach me), with its thread.
    item = a commission_detail() quote. Raises "x-changed" when something changed."""

    def __init__(self, **properties):
        super().__init__(**properties)
        q = self.item
        self.tailor.text = q["tailor_name"]
        self.verified.visible = bool(q["verified"])
        bits = [b for b in (q.get("tailor_city"), q.get("experience"), q.get("specialties")) if b]
        self.who.text = " · ".join(bits)
        self.who.visible = bool(bits)
        self.price.text = "$" + (("%.2f" % q["price"]).rstrip("0").rstrip(".") if q.get("price") is not None else "?")
        self.terms.text = "%s · %s" % (state.plural(int(q["days"]), "day"), state.plural(int(q["fittings"]), "fitting"))
        self.message.text = q["message"]
        self.status.text = q["status_label"]
        st = q["status"]
        self.status.role = ["badge", "badge-good"] if st == "accepted" else ["badge"]
        self.status.visible = st != "approved"
        self.acts.visible = st == "approved"
        self.box.classes["chosen"] = st == "accepted"
        self.box.classes["faded"] = st in ("declined", "notchosen")
        self.accepted_note.visible = st == "accepted"
        self.accepted_text.text = ("You shared your email with %s." % q["tailor_name"]) if q.get("contact_shared") else \
            "Accepted. %s now has your docket with the measurements. Arrange the fitting and payment between you; share your email when you're ready." % q["tailor_name"]
        self.share_button.visible = st == "accepted" and not q.get("contact_shared")
        self.thread.items = q.get("thread") or []
        self.thread_part.visible = st in ("approved", "accepted") or bool(q.get("thread"))
        self.reply_part.visible = st in ("approved", "accepted")
        state.set_control_attr(self.accept_button, "aria-label", "Accept the quote from " + q["tailor_name"])
        state.set_control_attr(self.decline_button, "aria-label", "Decline the quote from " + q["tailor_name"])

    def _changed(self):
        if self.parent is not None:
            self.parent.raise_event("x-changed")

    @handle("accept_button", "click")
    def accept_button_click(self, **event_args):
        if confirm("%s gets your docket with your measurements; the other quotes are closed. You pay the tailor directly." % self.item["tailor_name"],
                   title="Accept this quote?", buttons=[("Not yet", False), ("Accept", True)], role="app-dialog"):
            if state.call("accept_bid", self.item["id"]):
                state.toast("Accepted. Splendid choice.", "ok")
                self._changed()

    @handle("decline_button", "click")
    def decline_button_click(self, **event_args):
        if state.call("decline_bid", self.item["id"]):
            self._changed()

    @handle("share_button", "click")
    def share_button_click(self, **event_args):
        if confirm("%s will see your name and email address." % self.item["tailor_name"], title="Share your email?",
                   buttons=[("Cancel", False), ("Share", True)], role="app-dialog"):
            if state.call("share_contact", self.item["id"], True):
                state.toast("Shared.", "ok")
                self._changed()

    @handle("send_button", "click")
    def send_button_click(self, **event_args):
        text = (self.reply_box.text or "").strip()
        if not text:
            return
        r = state.call("send_message", self.item["id"], text)
        if r:
            self.reply_box.text = ""
            self._changed()
