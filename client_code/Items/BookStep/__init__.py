from anvil import *

from ._anvil_designer import BookStepTemplate
from ... import state


class BookStep(BookStepTemplate):
    """One step of the making book. item = {id, n, title, text, tip, settings, diagram (SVG), lay (SVG), seam_step,
    done, on, mine}. It keeps itself in item["_form"] so the page can redraw just this step (draw()).
    Raises "x-tick" (id, checked) and "x-show" (id, k) on its RepeatingPanel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        s = self.item
        s["_form"] = self
        self.title.text = s["title"]
        self.text.text = s["text"]
        self.settings.items = s.get("settings") or []
        self.settings.visible = bool(s.get("settings"))
        self.diagram.html = s.get("diagram") or ""
        self.diagram.visible = bool(s.get("diagram"))
        self.lay.html = s.get("lay") or ""
        self.lay_box.visible = bool(s.get("lay"))
        self.tip.text = s.get("tip") or ""
        self.tip.visible = bool(s.get("tip"))
        self.done_check.visible = bool(s.get("mine"))
        self.show_button.visible = s.get("seam_step") is not None
        state.set_control_attr(self.done_check, "aria-label", "Done: " + s["title"])
        state.set_control_attr(self.show_button, "aria-label", "Show in 3D: " + s["title"])
        self.draw()

    def draw(self):
        s = self.item
        self.box.classes["done"] = bool(s.get("done"))
        self.box.classes["on"] = bool(s.get("on"))
        self.num.text = "✓" if s.get("done") else str(s["n"])
        self.done_check.checked = bool(s.get("done"))

    @handle("done_check", "change")
    def done_check_change(self, **event_args):
        if self.parent is not None:
            self.parent.raise_event("x-tick", id=self.item["id"], checked=self.done_check.checked)

    @handle("show_button", "click")
    def show_button_click(self, **event_args):
        if self.parent is not None:
            self.parent.raise_event("x-show", id=self.item["id"], k=self.item["seam_step"])
