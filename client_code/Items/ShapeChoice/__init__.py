from anvil import *

from ._anvil_designer import ShapeChoiceTemplate
from ... import state


class ShapeChoice(ShapeChoiceTemplate):
    """An outline found in an imported SVG: tick it to bring it in. item = {i, svg, size, pick}. Raises "x-shape" (i)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.art.html = self.item["svg"]
        self.size_label.text = self.item["size"]
        self._show()

    def _show(self):
        on = bool(self.item.get("pick"))
        self.box.classes["on"] = on
        state.set_attr(self.box, "aria-pressed", "true" if on else "false")
        state.set_attr(self.box, "aria-label", "Outline %s, %s" % (self.item["i"] + 1, self.item["size"]))

    def box_click(self, event):
        self.item["pick"] = not self.item.get("pick")
        self._show()
        if self.parent is not None:
            self.parent.raise_event("x-shape", i=self.item["i"])
