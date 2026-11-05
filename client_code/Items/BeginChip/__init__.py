from anvil import *

from ._anvil_designer import BeginChipTemplate
from ... import my


class BeginChip(BeginChipTemplate):
    """Begin a pattern in a particular cloth (from a cloth's detail card). item = {key, label, fabric, look}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.btn.text = self.item["label"]

    @handle("btn", "click")
    def btn_click(self, **event_args):
        self.btn.enabled = False
        pr = my.begin(self.item["key"], {"fabric": self.item["fabric"], "cloth": self.item["look"]})
        self.btn.enabled = True
        if pr and self.parent is not None:
            self.parent.raise_event("x-begun")
