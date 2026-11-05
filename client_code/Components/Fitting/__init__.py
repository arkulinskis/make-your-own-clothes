import json

from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import FittingTemplate


class Fitting(FittingTemplate):
    """The 3D fitting room. A JavaScript engine (Verlet cloth on a mannequin cut to the measurements), so this
    component only mounts it, forwards calls and raises "step" when the fitting moves to another step."""

    def __init__(self, **properties):
        self._h = None
        self._pending: list = []
        super().__init__(**properties)

    def _do(self, name, *args):
        if self._h is not None:
            self._h.call(name, *args)
        else:
            self._pending.append((name, args))

    def _on_step(self, k):
        self.raise_event("step", k=int(k))

    @handle("", "show")
    def form_show(self, **event_args):
        if self._h is None:
            self._h = window.MY.mountFit(anvil.js.get_dom_node(self.box), window.JSON.parse(json.dumps({})))
            self._h.onStepPy = self._on_step
            for name, args in self._pending:
                self._h.call(name, *args)
            self._pending = []

    @handle("", "hide")
    def form_hide(self, **event_args):
        if self._h is not None:
            self._h.destroy()
            self._h = None

    def load_project(self, pr_js, step=None, presettle=None):
        """pr_js: the project as a JS object (my.to_js(dict) or the Studio's live one)."""
        o = {"step": step if step is not None else "all"}
        if presettle:
            o["presettle"] = presettle
        spec = window.MY.fitProject(pr_js, window.JSON.parse(json.dumps(o)))
        self._do("load", spec)
        return not bool(getattr(spec, "empty", False))

    def load_body(self, m, figure):
        self._do("load", window.MY.fitBody(window.JSON.parse(json.dumps(m)), figure))

    def set_step(self, k, animate=True):
        self._do("setStep", k, animate)

    def sew_all(self):
        self._do("sewAll")

    def view(self, name):
        self._do("view", name)

    def toggle(self, what, on):
        self._do("toggle", what, bool(on))

    def frame(self, y, dist):
        self._do("frame", y, dist)

    def current_step(self):
        return int(self._h.step()) if self._h is not None else -1
