from anvil import *

from ._anvil_designer import BulletTemplate


class Bullet(BulletTemplate):
    """One line of a bulleted list. item = the text."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.text.text = str(self.item)
