from anvil import *

from ._anvil_designer import SmallCardTemplate
from ... import my, router, state


class SmallCard(SmallCardTemplate):
    """A garment as a small link card (drafts in this browser, the Studio's and the tailor desk's "which garment?").
    item = a project dict + optional "_to" (page name, default studio) and "_thumb" (draw the pieces)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item
        state.set_attr(self.card, "href", router.href(p.get("_to") or "studio", p["pid"]))
        self.art_box.visible = bool(p.get("_thumb"))
        if p.get("_thumb"):
            self.art.html = my.thumb(p)
        self.top_label.text = my.status_label(p.get("status"))
        self.code_label.text = p.get("code") or "Untitled"
        self.sub_label.text = p.get("title") or ""
