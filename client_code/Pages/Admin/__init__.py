from anvil import *

from ._anvil_designer import AdminTemplate
from ... import state

TABS = ["overview", "review", "requests", "guild", "feedback", "users", "demo"]


class Admin(AdminTemplate):
    """#admin/<tab>: overview numbers, the review queue (every quote and tailor's message waits here before a member
    sees it), commission requests, the guild, the old feedback inbox, users and the demo data."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.tab = args[0] if args and args[0] in TABS else "overview"
        if args and args[0] == "commissions":
            self.tab = "requests"
        self._filter = "new"
        for name in TABS:
            getattr(self, name + "_part").visible = name == self.tab
            getattr(self, "tab_" + name).classes["on"] = name == self.tab
        for panel in (self.feedback_panel, self.bid_panel, self.msg_panel, self.req_panel, self.guild_panel):
            panel.add_event_handler("x-changed", self._reload)
        o: dict = state.call("admin_overview") or {}
        n = int(((o.get("tailors") or {}).get("review")) or 0)
        self.review_tab_label.text = "Review (%d)" % n if n else "Review"
        self._o = o
        getattr(self, "_" + self.tab)()

    def _reload(self, **event_args):
        getattr(self, "_" + self.tab)()

    # ---- overview
    def _overview(self):
        d = self._o
        t, p = d.get("tailors") or {}, d.get("projects") or {}
        self.s_users.text, self.s_admins.text = str(d.get("users", 0)), str(d.get("admins", 0))
        self.s_admins_label.text = "admin" if d.get("admins") == 1 else "admins"
        self.s_feedback.text = str(d.get("feedback_new", 0))
        self.s_review.text, self.s_requests.text, self.s_guild.text = str(t.get("review", 0)), str(t.get("waiting", 0)), str(t.get("guild_new", 0))
        self.s_projects.text, self.s_shared.text = str(p.get("projects", 0)), str(p.get("shared", 0))
        demo: dict = d.get("demo") or {"state": "never", "counts": {}}
        self.demo_line.text = "Demo data is %s (%d demo people). Manage it in the Demo data tab." % (demo["state"], (demo.get("counts") or {}).get("users", 0))

    # ---- the review queue
    def _review(self):
        d: dict = state.call("admin_review") or {"bids": [], "messages": [], "recent": []}
        self.bid_panel.items = d["bids"]
        self.no_bids.visible = not d["bids"]
        self.msg_panel.items = d["messages"]
        self.no_msgs.visible = not d["messages"]
        self.recent_panel.items = [dict(b, _done=True) for b in d["recent"]]
        n = len(d["bids"]) + len(d["messages"])
        self.review_tab_label.text = "Review (%d)" % n if n else "Review"

    # ---- requests and the guild
    def _requests(self):
        d: dict = state.call("admin_commissions") or {"commissions": [], "counts": {}}
        self.req_panel.items = d["commissions"]
        self.no_reqs.visible = not d["commissions"]
        c = d["counts"]
        self.req_counts.text = "On the board: %d · quote accepted: %d · closed: %d · old waiting list: %d" % (
            c.get("open", 0), c.get("accepted", 0), c.get("closed", 0), c.get("waiting", 0) + c.get("contacted", 0) + c.get("matched", 0))

    def _guild(self):
        d: dict = state.call("admin_tailors") or {"tailors": []}
        self.guild_panel.items = d["tailors"]
        self.no_guild.visible = not d["tailors"]

    # ---- feedback
    def _feedback(self):
        d: dict = state.call("list_feedback", None) or {"items": [], "counts": {}}
        items = [i for i in d["items"] if self._filter == "all" or i["status"] == self._filter]
        self.feedback_panel.items = items
        self.no_feedback.visible = not items
        labels = {"new": "New", "read": "Read", "done": "Done", "all": "All"}
        for key, el in (("new", self.f_new), ("read", self.f_read), ("done", self.f_done), ("all", self.f_all)):
            n = len(d["items"]) if key == "all" else d["counts"].get(key, 0)
            el.text = "%s (%d)" % (labels[key], n)
            el.role = ["seg", "on"] if key == self._filter else ["seg"]

    def _set_filter(self, value):
        self._filter = value
        self._feedback()

    @handle("f_new", "click")
    def f_new_click(self, **event_args):
        self._set_filter("new")

    @handle("f_read", "click")
    def f_read_click(self, **event_args):
        self._set_filter("read")

    @handle("f_done", "click")
    def f_done_click(self, **event_args):
        self._set_filter("done")

    @handle("f_all", "click")
    def f_all_click(self, **event_args):
        self._set_filter("all")

    # ---- users
    def _users(self, query=None):
        d: dict = state.call("list_users", query or None) or {"users": [], "total": 0}
        self.users_panel.items = d["users"]
        self.users_count.text = state.plural(d["total"], "person", "people")

    @handle("search_box", "pressed_enter")
    def search_box_pressed_enter(self, **event_args):
        self._users(self.search_box.text)

    @handle("search_button", "click")
    def search_button_click(self, **event_args):
        self._users(self.search_box.text)

    # ---- demo data
    def _demo(self):
        d: dict = (state.call("admin_overview") or {}).get("demo") or {"state": "never", "counts": {}}
        counts = ", ".join("%s %s" % (v, k) for k, v in d["counts"].items())
        self.demo_status.text = "Status: %s · %s" % (d["state"], counts)
        self.demo_load_button.text = "Reload demo data" if d["state"] == "loaded" else "Load demo data"

    @handle("demo_load_button", "click")
    def demo_load_button_click(self, **event_args):
        if confirm("Demo people and content are added (any old demo rows are replaced).", title="Load the demo data?",
                   buttons=[("Cancel", False), ("Load", True)], role="app-dialog"):
            if state.call("demo_load"):
                state.toast("Done", "ok")
                self._demo()

    @handle("demo_remove_button", "click")
    def demo_remove_button_click(self, **event_args):
        if confirm("Every demo row is deleted. Real data stays.", title="Remove the demo data?",
                   buttons=[("Cancel", False), ("Remove", True)], role="app-dialog"):
            if state.call("demo_remove"):
                state.toast("Done", "ok")
                self._demo()
