from anvil import *

from ._anvil_designer import RequestCardTemplate
from ... import my, router, state


def brief_project(b):
    """A request's public brief as a project dict the engines can draft (at the nearest standard size)."""
    return {"pid": "p0brief", "pattern": b.get("pattern") or "custom", "figure": b.get("figure") or "straight", "size": b.get("size") or "M",
            "m": None, "opts": b.get("opts") or {}, "fabric": b.get("fabric") or "cotton-poplin", "cloth": b.get("cloth"), "edits": {}, "fit": []}


class RequestCard(RequestCardTemplate):
    """A request on the commission board. item = a commission_board() row."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item
        b = c.get("brief") or {}
        state.set_attr(self.card, "href", router.href("request", c["id"]))
        self.art.html = my.thumb(brief_project(b))
        self.kind.text = b.get("kind") or "Garment"
        self.invited.visible = bool(c.get("invited"))
        self.matched.visible = not c.get("invited") and int(c.get("score") or 0) >= 3
        self.quoted.visible = bool(c.get("quoted"))
        self.mine.visible = bool(c.get("mine"))
        self.title.text = c["title"]
        self.where.text = c["city"] + ((" · " + c["area"]) if c.get("area") else "") + (" · remote work welcome" if c.get("remote_ok") else "")
        q = int(c.get("quotes") or 0)
        self.facts.text = "%s · %s · %s · %s" % (my.fabric_name(b.get("fabric")), c["budget"], c.get("timeline") or "no rush",
                                                 state.plural(q, "quote") if q else "no quotes yet")
