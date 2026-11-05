import json

from anvil import *
from anvil.js import window

from ._anvil_designer import DocketTemplate
from ... import my


class Docket(DocketTemplate):
    """The tailor's docket. With measurements (the member's own garment, or the tailor whose quote was accepted) it
    lists all thirteen; a public brief shows the nearest size and says the measurements follow on acceptance."""

    def __init__(self, **properties):
        super().__init__(**properties)

    def show(self, d, code="", pid="", notes="", hand_edited=None):
        f = json.loads(window.MY.docketFacts(my.to_js(d)))
        self.agent.text = my.agent_no(pid or d.get("pid") or "")
        self.code.text = code or d.get("code") or d.get("title") or ""
        self.meta.text = "%s · %s · %s" % (f["name"], f["size"], f["figure"])
        self.rows.items = f["rows"]
        self.rows.visible = bool(f["rows"])
        self.private_note.visible = not f["rows"]
        self.private_note.text = "Exact measurements go only to the tailor whose quote the member accepts." if d.get("made_to_measure") else \
            "Drafted at a standard size."
        self.opts.text = f["opts"]
        self.cloth.text = f["cloth"]
        self.fit.text = "; ".join(f["fit"])
        n_fit = d.get("fit_changes")
        if not f["fit"] and n_fit:
            self.fit.text = "%d, in the full docket" % n_fit
        self.fit_line.visible = bool(f["fit"] or n_fit)
        edited = hand_edited if hand_edited is not None else (d.get("hand_edited") if isinstance(d.get("hand_edited"), list) else sorted((d.get("edits") or {}).keys()))
        if isinstance(d.get("hand_edited"), int):
            self.edits.text = "%d (see the pattern file)" % d["hand_edited"] if d["hand_edited"] else "none"
        else:
            self.edits.text = (", ".join(edited) + " (see the pattern file)") if edited else "none"
        self.notes.text = notes or ""
        self.notes_line.visible = bool(notes)
