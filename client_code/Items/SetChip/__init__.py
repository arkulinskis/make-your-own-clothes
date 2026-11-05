from anvil import *

from ._anvil_designer import SetChipTemplate


class SetChip(SetChipTemplate):
    """A machine setting in a making step ("Needle  Universal 80/12"). item = [name, value]."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.k.text = str(self.item[0])
        self.v.text = str(self.item[1])
