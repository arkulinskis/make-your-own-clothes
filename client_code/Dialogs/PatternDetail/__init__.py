from anvil import *

from ._anvil_designer import PatternDetailTemplate
from ... import my


class PatternDetail(PatternDetailTemplate):
    """A pattern's details: all its pieces drafted to you, difficulty, cloth, notions, the maths, the open patterns
    behind it. Begin opens a new garment in the Studio."""

    def __init__(self, key, **properties):
        super().__init__(**properties)
        self.key = key
        f = my.pattern_facts(key)
        self.eyebrow.text = "%s · %s" % (f["kind"], f["time"])
        self.title.text = f["name"]
        self.about.text = f["about"]
        self.art.html = my.pattern_art(key, all_pieces=True)
        self.meter.html = my.meter(f["difficulty"])
        self.pieces.text = ", ".join(f["pieces"])
        self.cloths.text = ", ".join(name for _k, name in f["fabrics"])
        self.notions.text = "; ".join(f["notions"])
        self.info_panel.items = f["info"]
        self.refs.text = "Inspired by open patterns: %s. Drafted here by our own code from your measurements." % " · ".join(r[0] for r in f["refs"])

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("begin_button", "click")
    def begin_button_click(self, **event_args):
        self.begin_button.enabled = False
        if my.begin(self.key):
            self.raise_event("x-close-alert", value=True)
        self.begin_button.enabled = True
