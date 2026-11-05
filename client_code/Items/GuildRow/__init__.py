from anvil import *

from ._anvil_designer import GuildRowTemplate
from ... import state


class GuildRow(GuildRowTemplate):
    """Admin → Guild: a seamstress's or tailor's application. Verify / decline / delete. Raises "x-changed"."""

    def __init__(self, **properties):
        super().__init__(**properties)
        t = self.item
        self.status.text = t["status_label"]
        self.status.role = ["badge", "badge-good"] if t["status"] == "verified" else ["badge", "badge-warn"] if t["status"] == "new" else ["badge"]
        self.name.text = t["name"]
        self.email.text = t["email"]
        state.set_attr(self.email_link, "href", "mailto:" + t["email"])
        self.when.text = state.short_date(t["created"])
        self.demo.visible = bool(t.get("demo"))
        bits = [t["city"], t.get("experience"), ", ".join(t.get("kinds") or []), t.get("specialties"),
                "works remotely" if t.get("remote") else "", "has an account, %s" % state.plural(int(t.get("quotes") or 0), "quote") if t.get("has_account") else "no account yet"]
        self.facts.text = " · ".join(b for b in bits if b)
        self.note.text = t.get("note") or ""
        self.note.visible = bool(t.get("note"))
        self.verify_button.role = ["btn", "btn-sm", "btn-primary", "ic-check"] if t["status"] == "verified" else ["btn", "btn-sm", "ic-check"]
        self.decline_button.role = ["btn", "btn-sm", "btn-primary"] if t["status"] == "declined" else ["btn", "btn-sm"]

    def _changed(self):
        if self.parent is not None:
            self.parent.raise_event("x-changed")

    @handle("verify_button", "click")
    def verify_button_click(self, **event_args):
        if state.call("admin_set_tailor", self.item["id"], "verified"):
            self._changed()

    @handle("decline_button", "click")
    def decline_button_click(self, **event_args):
        if state.call("admin_set_tailor", self.item["id"], "declined"):
            self._changed()

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        if confirm("The application is deleted for good.", title="Delete this application?", buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("admin_delete_tailor", self.item["id"]):
                self._changed()
