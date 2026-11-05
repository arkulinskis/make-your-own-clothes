from anvil import *

from ._anvil_designer import ShowroomCardTemplate
from ... import my, router, state


class ShowroomCard(ShowroomCardTemplate):
    """A shared garment, drawn from its real pattern (at the nearest size: owners' measurements never leave the server).
    item = a showroom row {pid, code, pattern, fabric, owner, status, admired, admired_by_me, mine, demo, data}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item
        data = dict(p.get("data") or {}, pid=p["pid"])
        self.art.html = my.thumb(data)
        pats = {x["key"]: x for x in my.patterns()}
        self.top_label.text = "%s · %s" % (pats[p["pattern"]]["short"] if p.get("pattern") in pats else "Own pattern", my.fabric_name(p.get("fabric")))
        self.code_label.text = p["code"]
        self.by_label.text = "by %s · %s%s" % (p.get("owner") or "a member", my.status_label(p.get("status")), " · Demo" if p.get("demo") else "")
        notes = str(data.get("notes") or "")
        self.notes_label.text = notes[:140]
        self.notes_label.visible = bool(notes)
        self._hat()
        self.hat_button.enabled = not p.get("mine")
        state.set_attr(self.open_link, "href", router.href("studio", p["pid"]))
        state.set_attr(self.book_link, "href", router.href("book", p["pid"]))

    def _hat(self):
        p = self.item
        self.hat_button.text = str(int(p.get("admired") or 0))
        self.hat_button.role = ["btn", "btn-sm", "sr-hat", "ic-hat"] + (["on"] if p.get("admired_by_me") else [])
        state.set_control_attr(self.hat_button, "aria-label", "Tip your hat to %s (%s so far)" % (p["code"], self.hat_button.text))
        state.set_control_attr(self.hat_button, "aria-pressed", "true" if p.get("admired_by_me") else "false")

    @handle("hat_button", "click")
    def hat_button_click(self, **event_args):
        if not state.me():
            router.remember_after("#showroom")
            state.toast("Open an account to tip your hat.")
            router.go("auth", "signup")
            return
        r = state.call("admire", self.item["pid"])
        if r:
            self.item["admired"], self.item["admired_by_me"] = r["admired"], r["admired_by_me"]
            self._hat()
            if r["admired_by_me"]:
                state.toast("Hat tipped.", "ok")
