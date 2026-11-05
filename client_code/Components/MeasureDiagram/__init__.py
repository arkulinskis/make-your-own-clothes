from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import MeasureDiagramTemplate


class MeasureDiagram(MeasureDiagramTemplate):
    """The measurement figure (SVG drawn by MY.measureDiagram)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self._api = window.MY.measureDiagram(anvil.js.get_dom_node(self.box))

    def focus(self, key):
        self._api.focus(key)
