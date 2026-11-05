from anvil import *

from ._anvil_designer import LandingPatternTemplate
from ... import my


class LandingPattern(LandingPatternTemplate):
    """A pattern on the landing page, drafted live at this browser's dossier. item = a my.patterns() row."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.art.html = my.pattern_art(self.item["key"])
        self.name_label.text = self.item["short"]
        self.time_label.text = self.item["time"]
