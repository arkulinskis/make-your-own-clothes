import anvil.server
from anvil import *

from ._anvil_designer import RequestTemplate
from ... import my, router, state
from ...Items.RequestCard import brief_project


class Request(RequestTemplate):
    """#request/<id>: one commission. Everyone sees the public brief. The member sees the quotes the shop approved,
    accepts one, writes to tailors, shares their email when ready. A tailor sends or changes a quote (it waits for the
    shop's review), follows their thread, and sees the full docket once accepted."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.cid = args[0] if args else None
        self.quotes.add_event_handler("x-changed", lambda **e: self._load())
        self._load()

    def _load(self):
        if not self.cid:
            self.missing.visible, self.main.visible = True, False
            self.missing_text.text = "Choose a request on the board."
            return
        d = anvil.server.call("commission_detail", self.cid)
        ok = isinstance(d, dict) and d.get("ok") is not False
        self.missing.visible, self.main.visible = not ok, ok
        if not ok:
            self.missing_text.text = str((d or {}).get("error") or "")
            return
        self.d = d
        c = d["request"]
        b = c.get("brief") or {}
        self.title.text = c["title"]
        state.heading(self.title, 1)
        self.meta.text = "%s%s · %s · %s · posted %s" % (c["city"], (" · " + c["area"]) if c.get("area") else "", c["budget"],
                                                          c.get("timeline") or "no rush", state.ago(c["posted"]))
        self.status.text = c["status_label"]
        self.status.role = ["badge", "badge-good"] if c["status"] == "open" else ["badge"]
        self.art.html = my.thumb(brief_project(b))
        self.docket.show(b, c["code"], "", c.get("notes") or "")
        me = state.me()
        mine = bool(d.get("mine"))
        self.owner_part.visible = mine
        self.tailor_part.visible = bool(me) and not mine
        self.guest_part.visible = not me
        state.set_attr(self.signin_link, "href", "#auth")
        if not me:
            router.remember_after(router.href("request", self.cid))
        if mine:
            self._owner(d, c)
        elif me:
            self._tailor(d, c)

    # ---- the member's view
    def _owner(self, d, c):
        n, invited = int(d.get("matches") or 0), int(d.get("invited") or 0)
        self.match_card.visible = c["status"] == "open"
        self.match_text.text = ("%s near you make this kind of garment." % state.plural(n, "verified tailor")) + \
            (" Invited." if invited else "") if n else "No verified guild tailors near you yet. Anyone signed in can still quote."
        self.invite_button.visible = n > 0 and not invited
        p = int(d.get("pending") or 0)
        self.pending_text.text = "%s with the shop for review." % state.plural(p, "more quote") if p else ""
        self.pending_text.visible = p > 0
        self.quotes.items = d.get("quotes") or []
        self.no_quotes.visible = not d.get("quotes")
        self.withdraw_button.visible = c["status"] == "open"

    @handle("invite_button", "click")
    def invite_button_click(self, **event_args):
        r = state.call("invite_matches", self.cid)
        if r:
            state.toast("Invited %s. Your request shows first on their board." % state.plural(int(r["invited"]), "tailor"), "ok")
            self._load()

    @handle("withdraw_button", "click")
    def withdraw_button_click(self, **event_args):
        if confirm("Tailors can't quote for it any more.", title="Withdraw this request?",
                   buttons=[("Keep it", False), ("Withdraw", True)], role="app-dialog"):
            if state.call("cancel_commission", self.cid):
                router.go("tailor")

    # ---- a tailor's view
    def _tailor(self, d, c):
        q = d.get("my_quote")
        g = d.get("guild")
        self.guild_hint.text = ("Your quote shows the guild's verified badge." if g and g["status"] == "verified" else
                                "Your guild application is with the shop." if g else
                                "Tip: join the guild (Tailors page) to get a verified badge and matching requests first.")
        self.my_quote_card.visible = q is not None
        open_ = c["status"] == "open"
        self.closed_text.visible = not open_ and q is None
        self.quote_form.visible = open_ and q is None
        if q is None:
            return
        self.my_status.text = q["status_label"]
        self.my_status.role = ["badge", "badge-good"] if q["status"] in ("approved", "accepted") else ["badge", "badge-warn"] if q["status"] == "review" else ["badge"]
        self.my_terms.text = "$%s · %s · %s" % (("%.2f" % q["price"]).rstrip("0").rstrip("."), state.plural(int(q["days"]), "day"), state.plural(int(q["fittings"]), "fitting"))
        self.my_message.text = q["message"]
        self.contact_text.visible = bool(q.get("member_email"))
        if q.get("member_email"):
            self.contact_text.text = "%s shared their email with you: %s" % (q.get("member_name") or "The member", q["member_email"])
        self.full_docket_part.visible = bool(q.get("docket"))
        if q.get("docket"):
            self.full_docket.show(q["docket"], c["code"], "", c.get("notes") or "")
        self.my_thread.items = q.get("thread") or []
        self.my_thread_part.visible = q["status"] in ("approved", "accepted") or bool(q.get("thread"))
        self.my_reply.visible = q["status"] in ("approved", "accepted")
        self.edit_button.visible = open_ and q["status"] in ("review", "approved", "rejected", "withdrawn")
        self.withdraw_quote.visible = q["status"] in ("review", "approved")

    @handle("edit_button", "click")
    def edit_button_click(self, **event_args):
        q = self.d.get("my_quote") or {}
        self.q_price.text = str(q.get("price") or "")
        self.q_days.text = str(q.get("days") or "")
        self.q_fittings.text = str(q.get("fittings") or 1)
        self.q_message.text = q.get("message") or ""
        self.quote_form.visible = True
        self.my_quote_card.visible = False

    @handle("quote_button", "click")
    def quote_button_click(self, **event_args):
        form = {"price": self.q_price.text or "", "days": self.q_days.text or "", "fittings": self.q_fittings.text or "1", "message": self.q_message.text or ""}
        self.quote_button.enabled = False
        try:
            r = state.call("submit_bid", self.cid, form)
        finally:
            self.quote_button.enabled = True
        if r:
            state.toast("Sent to the shop. They'll pass it on after a quick read.", "ok")
            self._load()

    @handle("withdraw_quote", "click")
    def withdraw_quote_click(self, **event_args):
        q = self.d.get("my_quote") or {}
        if confirm("The member won't see it any more.", title="Withdraw your quote?", buttons=[("Keep it", False), ("Withdraw", True)], role="app-dialog"):
            if state.call("withdraw_bid", q.get("id")):
                self._load()

    @handle("my_send", "click")
    def my_send_click(self, **event_args):
        q = self.d.get("my_quote") or {}
        text = (self.my_reply_box.text or "").strip()
        if not text:
            return
        r = state.call("send_message", q.get("id"), text)
        if r:
            self.my_reply_box.text = ""
            state.toast("Sent to the shop. They'll pass it on after a quick read.", "ok")
            self._load()
