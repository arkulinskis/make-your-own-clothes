import json

from anvil import *
from anvil.js import window

from ._anvil_designer import FabricDetailTemplate


class FabricDetail(FabricDetailTemplate):
    """A cloth's full card: weight, drape, stretch, shrinkage, care, needle, stitch, seam finish, pressing, tips, the
    fibre's burn test, and patterns that suit it (Begin opens one in this cloth)."""

    def __init__(self, key, **properties):
        super().__init__(**properties)
        f = json.loads(window.MY.fabricFacts(key))
        self.swatch.html = '<span class="sw" style="background-image:url(%s)"></span>' % f["swatch"]
        self.eyebrow.text = f["eyebrow"]
        self.title.text = f["name"]
        self.aka.text = ("Also: " + f["aka"]) if f["aka"] else ""
        self.aka.visible = bool(f["aka"])
        self.fact.text = f["fact"]
        self.props.items = f["rows"]
        self.tips.items = f["tips"]
        self.fibre.text = f["fibre"]
        self.fibre.visible = bool(f["fibre"])
        self.pats.items = [{"key": k, "label": label, "fabric": f["key"], "look": f["look"]} for k, label in f["patterns"]]
        self.pats_part.visible = bool(f["patterns"])
        self.pats.add_event_handler("x-begun", self._begun)

    def _begun(self, **event_args):
        self.raise_event("x-close-alert", value=True)

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
