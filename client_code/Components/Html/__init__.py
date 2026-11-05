from anvil import *
import anvil.js

from ._anvil_designer import HtmlTemplate


class Html(HtmlTemplate):
    """Engine-drawn markup (SVG pieces, meters). The engines escape every piece of text they put in."""

    def __init__(self, **properties):
        self._html = ""
        super().__init__(**properties)
        self._draw()

    def _draw(self):
        box = getattr(self, "box", None)  # the property can be set before the template exists
        if box is not None:
            anvil.js.get_dom_node(box).innerHTML = self._html

    @property
    def html(self):
        return self._html

    @html.setter
    def html(self, value):
        self._html = value or ""
        self._draw()
