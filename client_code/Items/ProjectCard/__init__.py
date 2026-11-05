from anvil import *

from ._anvil_designer import ProjectCardTemplate
from ... import my, router, state


class ProjectCard(ProjectCardTemplate):
    """A garment in the wardrobe: thumbnail, status, progress, Studio / Book / Delete. item = a project dict."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item
        self.art.html = my.thumb(p)
        self.status_label.text = my.status_label(p.get("status")) + (" · in the showroom" if p.get("shared") else "")
        self.code_label.text = p.get("code") or "Untitled"
        self.meta_label.text = "%s · %s%s" % (p.get("title") or "", my.fabric_name(p.get("fabric")),
                                              (" · %d hats tipped" % p["admired"]) if p.get("admired") else "")
        total = max(1, my.book_steps(p))
        done = len(((p.get("progress") or {}).get("done")) or [])
        self.bar_fill.style["width"] = "%d%%" % round(min(done, total) * 100 / total)
        state.set_attr(self.bar, "title", "%d of %d steps" % (done, total))
        state.set_attr(self.studio_link, "href", router.href("studio", p["pid"]))
        state.set_attr(self.book_link, "href", router.href("book", p["pid"]))
        state.set_control_attr(self.delete_button, "aria-label", "Delete " + (p.get("code") or "this garment"))

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        if confirm("Its pattern, edits and progress are gone for good.", title="Delete this garment?",
                   buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if my.delete_project(self.item["pid"]) and self.parent is not None:
                self.parent.raise_event("x-changed")
