from anvil import *

from ._anvil_designer import SourceLinkTemplate
from ... import state


class SourceLink(SourceLinkTemplate):
    """An outside source (opens in a new tab). item = [title, url]."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.label.text = self.item[0]
        state.set_attr(self.link, "href", self.item[1])
