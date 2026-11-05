from anvil import *

from ._anvil_designer import WardrobeTemplate
from ... import my, state


class Wardrobe(WardrobeTemplate):
    """#wardrobe: the member's home. Garments with thumbnails, status and progress, the dossier, a banner that moves
    drafts made before signing in into the account, and the commission desk at a glance."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        state.heading(self.hello, 1)
        self.panel.add_event_handler("x-changed", self._load)
        self._load()

    def _load(self, **event_args):
        me = state.me() or {}
        items = my.list_projects()
        d = my.load_measure()
        self.hello.text = "Good day, %s." % ((me.get("name") or "agent").split(" ")[0])
        done = len([p for p in items if p.get("status") == "done"])
        self.summary.text = ("%s on file. %d finished." % (state.plural(len(items), "garment"), done)) if items else \
            "Nothing on the rails yet. Choose a pattern to begin."
        self.dossier_label.text = "%s · %s\nChest %s · waist %s · hip %s" % (
            "Curved figure" if d.get("figure") == "curvy" else "Straight figure",
            "your own numbers" if d.get("size") == "custom" else "size " + str(d.get("size")),
            my.length(d["m"]["chest"], 0), my.length(d["m"]["waist"], 0), my.length(d["m"]["hip"], 0))
        pids = set(p["pid"] for p in items)
        self._local = [p for p in my.local_projects() if p["pid"] not in pids]
        n = len(self._local)
        self.import_note.visible = n > 0
        self.import_label.text = "%s from before you signed in %s still in this browser." % (state.plural(n, "draft"), "is" if n == 1 else "are")
        self.import_button.text = "Bring it into my wardrobe" if n == 1 else "Bring them into my wardrobe"
        self.panel.items = items
        reqs = (state.call_quiet("my_commissions") or {}).get("commissions") or []
        live = [r for r in reqs if r.get("status") == "open"]
        quotes = sum(int(r.get("quotes") or 0) for r in live)
        self.req_label.text = ("%s open, %s waiting for you." % (state.plural(len(live), "request"), state.plural(quotes, "quote"))) if live else \
            "Not every agent sews. Put a garment's docket on the commission board."
        self.quote_label.text = "Seamstresses and tailors: see open requests and send a quote."

    @handle("import_button", "click")
    def import_button_click(self, **event_args):
        items = self._local
        r = state.call("import_projects", items)
        if r:
            for p in items:
                my.engine().projects.localRemove(p["pid"])
            state.toast("%s moved into your wardrobe." % state.plural(int(r.get("imported") or 0), "garment"), "ok")
            self._load()
