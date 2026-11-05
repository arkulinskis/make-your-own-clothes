from anvil import *

from ._anvil_designer import InfoCardTemplate


class InfoCard(InfoCardTemplate):
    """A small reference card (fibres, weaves, glossary, iron settings, needles). item = {title, sub?, body?, extra?,
    art? (engine SVG), cls? (an extra class: weave, dots, row)}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.title.text = it.get("title") or ""
        for name in ("sub", "body", "extra"):
            lab = getattr(self, name)
            lab.text = it.get(name) or ""
            lab.visible = bool(it.get(name))
        self.art_box.visible = bool(it.get("art"))
        self.art.html = it.get("art") or ""
        if it.get("cls"):
            self.box.classes[it["cls"]] = True
