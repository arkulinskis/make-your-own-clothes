from anvil import *
import anvil.server
from anvil.js import window

from ._anvil_designer import TailorTemplate
from ... import my, router, state

BUDGETS = [("Under $150", "under150"), ("$150–300", "150to300"), ("$300–600", "300to600"), ("Over $600", "over600")]
EXPERIENCE = ["Under 2 years", "2–10 years", "10–20 years", "20+ years"]
KINDS = ["Tops", "Tailoring", "Dresses", "Skirts", "Trousers", "Jackets", "Accessories", "Alterations"]


class Tailor(TailorTemplate):
    """#tailor, #tailor/<pid>: the member's commission desk. The garment's docket, "Open a request" (it goes on the
    commission board), the guild application for seamstresses and tailors, my requests and the quotes I sent."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.pid = args[0] if args else None
        me = state.me()
        self.p = None
        self.mine = False
        if self.pid:
            r = my.load_project(self.pid)
            if r and r.get("ok") is not False and r.get("project"):
                self.p, self.mine = r["project"], r.get("mine") is not False
        self.docket_part.visible = self.p is not None
        if self.p is not None:
            self.docket.show(self.p, self.p.get("code"), self.p["pid"], self.p.get("notes") or "")
        mine_list = my.list_projects() if self.p is None else []
        self.choose_part.visible = self.p is None and bool(mine_list)
        self.choose_panel.items = [dict(p, _to="tailor") for p in mine_list]
        # the request form
        self.req_none.visible = self.p is None
        self.req_none_text.text = "Choose one of your garments above to put it on the board." if mine_list else \
            "Begin a garment first: its docket is what the tailor works from."
        self.req_guest.visible = self.p is not None and not me
        self.req_other.visible = self.p is not None and bool(me) and not self.mine
        self.req_form.visible = self.p is not None and bool(me) and self.mine
        self.r_budget.items = BUDGETS
        self.r_budget.selected_value = "150to300"
        state.set_control_attr(self.r_budget, "aria-label", "Budget for the making")
        # the guild
        self.g_exp.items = EXPERIENCE
        self.g_exp.selected_value = "2–10 years"
        state.set_control_attr(self.g_exp, "aria-label", "Experience")
        state.set_control_attr(self.g_email, "autocomplete", "email")
        state.set_control_attr(self.g_name, "autocomplete", "name")
        self._kinds: list = []
        self.g_kinds.add_event_handler("x-chip", self._kind)
        self.guild_status.visible = False
        if me:
            self.g_name.text, self.g_email.text = me.get("name") or "", me.get("email") or ""
            g = (state.call_quiet("my_guild") or {}).get("guild")
            if g:
                self.g_name.text, self.g_city.text, self.g_spec.text = g["name"], g["city"], g["specialties"]
                self.g_exp.selected_value = g["experience"] if g["experience"] in EXPERIENCE else "2–10 years"
                self._kinds = list(g["kinds"])
                self.g_remote.checked = bool(g["remote"])
                self.guild_status.text = ("You're a verified member of the guild." if g["status"] == "verified" else
                                          "Your application is with the shop." if g["status"] == "new" else "The shop didn't verify this application.")
                self.guild_status.visible = True
                self.guild_button.text = "Update my guild profile"
        self._draw_kinds()
        self._lists()

    def _draw_kinds(self):
        self.g_kinds.items = [{"key": k, "label": k, "on": k in self._kinds, "group": "kind"} for k in KINDS]

    def _kind(self, key, group=None, **event_args):
        self._kinds = [k for k in self._kinds if k != key] if key in self._kinds else self._kinds + [key]
        self._draw_kinds()

    def _lists(self):
        me = state.me()
        reqs = (state.call_quiet("my_commissions") or {}).get("commissions") or [] if me else []
        self.mine_part.visible = bool(reqs)
        self.req_panel.items = reqs
        self.req_panel.add_event_handler("x-changed", lambda **e: self._lists())
        quotes = (state.call_quiet("my_bids") or {}).get("quotes") or [] if me else []
        self.quotes_part.visible = bool(quotes)
        self.quote_panel.items = quotes

    @handle("request_button", "click")
    def request_button_click(self, **event_args):
        if self.p is None:
            return
        form = {"city": self.r_city.text or "", "area": self.r_area.text or "", "timeline": self.r_timeline.text or "",
                "budget": self.r_budget.selected_value, "notes": self.r_notes.text or "", "remote_ok": self.r_remote.checked}
        self.request_button.enabled = False
        try:
            my.save_project(self.p, quiet=True)  # the docket is taken from the saved garment
            r = state.call("request_commission", self.p["pid"], form)
        finally:
            self.request_button.enabled = True
        if r:
            n = int(r.get("matches") or 0)
            state.toast("On the board. %s" % ("%s near you make this kind of garment: invite them from the request page." % state.plural(n, "verified tailor") if n else
                                               "Quotes reach you after the shop has read them."), "ok")
            router.go("request", r["commission"]["id"])

    @handle("guild_button", "click")
    def guild_button_click(self, **event_args):
        form = {"name": self.g_name.text or "", "email": self.g_email.text or "", "city": self.g_city.text or "",
                "experience": self.g_exp.selected_value, "specialties": self.g_spec.text or "", "note": self.g_note.text or "",
                "kinds": self._kinds, "remote": self.g_remote.checked}
        if state.call("join_guild", form):
            state.toast("Thank you. Your application is with the guild." if not state.me() else "Your guild profile is saved.", "ok")
            if not state.me():
                for box in (self.g_name, self.g_email, self.g_city, self.g_spec, self.g_note):
                    box.text = ""

    @handle("print_button", "click")
    def print_button_click(self, **event_args):
        window.print()

    @handle("svg_button", "click")
    def svg_button_click(self, **event_args):
        if self.p is not None:
            pr = my.to_js(self.p)
            my.download_pattern_svg(pr, window.MY.draftProject(pr))
