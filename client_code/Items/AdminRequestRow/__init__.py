from anvil import *

from ._anvil_designer import AdminRequestRowTemplate
from ... import router, state


class AdminRequestRow(AdminRequestRowTemplate):
    """Admin → Requests: a member's commission request with contact details (admins only), quotes waiting, status.
    Raises "x-changed"."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item
        self.status.text = c["status_label"]
        self.status.role = ["badge", "badge-good"] if c["status"] == "open" else ["badge"]
        self.who.text = c.get("name") or c.get("member") or ""
        self.email.text = c.get("email") or ""
        self.email_link.visible = bool(c.get("email"))
        state.set_attr(self.email_link, "href", "mailto:" + (c.get("email") or ""))
        self.when.text = state.short_date(c["created"])
        self.demo.visible = bool(c.get("demo"))
        self.title.text = c.get("title") or c["code"]
        state.set_attr(self.req_link, "href", router.href("request", c["id"]))
        self.facts.text = "%s · %s · %s · %s, %d waiting for review" % (c["city"], c["budget"], c.get("timeline") or "no date",
                                                                         state.plural(int(c.get("all_quotes") or 0), "quote"), int(c.get("pending") or 0))
        self.notes.text = c.get("notes") or ""
        self.notes.visible = bool(c.get("notes"))
        self.note_box.text = c.get("admin_note") or ""
        for st, btn in (("open", self.open_button), ("accepted", self.accepted_button), ("closed", self.closed_button)):
            btn.role = ["btn", "btn-sm", "btn-primary"] if c["status"] == st else ["btn", "btn-sm"]

    def _set(self, status):
        if state.call("admin_set_commission", self.item["id"], status, self.note_box.text or ""):
            state.toast("Saved", "ok")
            if self.parent is not None:
                self.parent.raise_event("x-changed")

    @handle("open_button", "click")
    def open_button_click(self, **event_args):
        self._set("open")

    @handle("accepted_button", "click")
    def accepted_button_click(self, **event_args):
        self._set("accepted")

    @handle("closed_button", "click")
    def closed_button_click(self, **event_args):
        self._set("closed")
