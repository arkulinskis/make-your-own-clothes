from anvil import *

from ._anvil_designer import FabricCardTemplate
from ... import state


class FabricCard(FabricCardTemplate):
    """A cloth in the Cloth room. item = a MY.fabricRows() row. Click: the full detail card."""

    def __init__(self, **properties):
        super().__init__(**properties)
        f = self.item
        self.swatch.html = '<span class="sw" style="background-image:url(%s)"></span>' % f["swatch"]
        self.name_label.text = f["name"]
        self.finder.text = f["finder"]
        self.bars.html = f["bars"]
        state.set_attr(self.card, "aria-label", "%s: details" % f["name"])

    def card_click(self, event):
        from ...Dialogs.FabricDetail import FabricDetail
        alert(FabricDetail(key=self.item["key"]), buttons=[], large=True, role="app-dialog")
