from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import LandingTemplate
from ... import my, state


class Landing(LandingTemplate):
    """#landing: the shopfront (also "About the shop" for members). The hero IS the Savile Row shopfront in HTML/CSS:
    the brass fascia, the window mannequin in a pinstripe waistcoat, the door as the Step inside link (it swings open
    on hover / focus), the pitch lettered on the other window. Then the Watch section, how it works, features, the
    patterns drafted live at this browser's measurements, the FAQ."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        self.cta_guest.visible = not me
        self.cta_member.visible = bool(me)
        state.set_attr(self.door, "href", "#wardrobe" if me else "#patterns")
        state.set_attr(self.door, "aria-label", "Your wardrobe" if me else "Step inside")
        self.door_label.text = ("Your wardrobe" if me else "Step inside") + " →"
        self.mannequin.html = window.MY.mannequinSvg()
        d = my.measure()
        self.drafted_label.text = "These are the real pieces, drafted live for %s." % (
            "your measurements" if d.get("size") == "custom" else "size " + str(d.get("size")))
        self.pattern_panel.items = my.patterns()
