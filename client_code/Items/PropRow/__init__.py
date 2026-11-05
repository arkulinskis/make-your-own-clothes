from anvil import *

from ._anvil_designer import PropRowTemplate


class PropRow(PropRowTemplate):
    """A property of a cloth: name + value (escaped text or a meter, drawn by MY.fabricFacts). item = [name, html]."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.k.text = self.item[0]
        self.v.html = self.item[1]
