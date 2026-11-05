from anvil import *

from ._anvil_designer import PatternsTemplate
from ... import my, router, state

KINDS = [("all", "All"), ("Tops", "Tops"), ("Tailoring", "Tailoring"), ("Dresses", "Dresses"), ("Skirts", "Skirts"),
         ("Trousers", "Trousers"), ("Jackets", "Jackets"), ("Accessories", "Accessories"), ("Blocks", "Blocks")]


class Patterns(PatternsTemplate):
    """#patterns, #patterns/<kind>: the archive, every pattern drafted live at the visitor's measurements (the
    thumbnails are the real pieces). Begin = a new project in the Studio. Bring your own pattern; drafts in this browser."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.kind = args[0] if args and args[0] in [k for k, _l in KINDS] else "all"
        self.kind_panel.add_event_handler("x-chip", self._kind)
        d = my.load_measure()
        self.dossier_title.text = "Drafting for " + my.size_label(d)
        self.dossier_sub.text = "Chest %s · waist %s · hip %s. Change it in the measurement dossier." % (
            my.length(d["m"]["chest"], 0), my.length(d["m"]["waist"], 0), my.length(d["m"]["hip"], 0))
        self.kind_panel.items = [{"key": k, "label": label, "on": k == self.kind, "group": "kind"} for k, label in KINDS]
        self.panel.items = [p for p in my.patterns() if self.kind == "all" or p["kind"] == self.kind]
        self.own_card.visible = self.kind == "all"
        local = my.local_projects()
        self.local_part.visible = bool(local)
        self.local_note.text = "Drafts you started without an account. " + (
            "Bring them into your wardrobe from the Wardrobe page." if state.me() else "Open an account to keep them safe and share them.")
        self.local_panel.items = local[:12]

    def _kind(self, key, group=None, **event_args):
        router.go("patterns", "" if key == "all" else key)

    @handle("own_svg", "click")
    def own_svg_click(self, **event_args):
        my.begin_own("svg")

    @handle("own_photo", "click")
    def own_photo_click(self, **event_args):
        my.begin_own("photo")
