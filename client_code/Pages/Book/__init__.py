from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import BookTemplate
from ... import my, router, state


class Book(BookTemplate):
    """#book/<pid>: the making book. Prep (brief, prewash, toile, printing), cutting (layout diagram, marking, fusing),
    every sewing step with needle / stitch / seam allowance / finish / pressing for the chosen cloth, seam diagrams,
    a 3D view per step, progress ticks (the status follows), confetti on "mission complete", print."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.pid = args[0] if args else None
        self.empty_part.visible = self.book_part.visible = False
        if not self.pid:
            return self._empty("Choose a garment first", "Every garment in the Studio has its own making book.")
        r = my.load_project(self.pid)
        if not r or r.get("ok") is False or not r.get("project"):
            return self._empty("That making book isn't here", (r or {}).get("error") or "It may be private.")
        self.p = r["project"]
        self.p.setdefault("progress", {"done": []})
        self.mine = r.get("mine") is not False
        self.pr = my.to_js(self.p)
        self.dr = window.MY.draftProject(self.pr)
        self.book = window.MY.book(self.pr, self.dr)
        self._steps: dict = {}
        self.sections.add_event_handler("x-tick", self._tick)
        self.sections.add_event_handler("x-show", self._show)
        self.book_part.visible = True
        self._fill()
        k = self._last_sewn()
        self.fit.load_project(self.pr, step=k)

    def _empty(self, title, text):
        self.empty_part.visible = True
        self.empty_title.text, self.empty_text.text = title, text

    def _done(self):
        return list((self.p.get("progress") or {}).get("done") or [])

    def _fill(self):
        M, b, done = window.MY, self.book, self._done()
        fab = b.fabric
        self.swatch.html = '<span class="sw" style="background-image:url(%s)"></span>' % M.swatchUrl(M.look(self.pr), 96)
        self.eyebrow.text = "The making book · " + my.agent_no(self.p["pid"])
        self.code.text = self.p.get("code") or "Untitled"
        state.heading(self.code, 1)
        self.meta.text = "%s in %s · %s · %s · buy %s" % (my.jget(self.dr.pat, "name", ""), str(fab.name).lower(),
                                                           "your measurements" if self.p.get("m") else "size " + str(self.p.get("size")),
                                                           my.jget(self.dr.pat, "time", "") or "", M.meters(b.buy.cm))
        state.set_attr(self.studio_link, "href", router.href("studio", self.p["pid"]))
        look = M.look(self.pr)
        secs, n = [], 0
        for sec in b.sections:
            steps = []
            for st in sec.steps:
                n += 1
                item = {"id": str(st.id), "n": n, "title": str(st.title), "text": str(st.text), "tip": str(my.jget(st, "tip", "") or ""),
                        "settings": my.to_py(my.jget(st, "settings", [])) or [], "seam_step": my.jget(st, "seamStep", None) if my.jget(st, "seamStep", None) is not None else None,
                        "diagram": str(M.stepDiagram(self.dr, my.jget(st, "seams", []))) if my.jget(st, "diagram", False) else "",
                        "lay": str(M.layoutSvg(b.layout, look)) if my.jget(st, "layout", False) else "",
                        "done": str(st.id) in done, "on": False, "mine": self.mine}
                self._steps[item["id"]] = item
                steps.append(item)
            secs.append({"id": str(sec.id), "title": str(sec.title), "steps": steps})
        self.sections.items = secs
        self._progress()

    def _progress(self):
        done, total = self._done(), max(1, len(self._steps))
        pct = round(len(done) * 100 / total)
        self.progress_fill.style["width"] = "%d%%" % pct
        for k, v in (("role", "progressbar"), ("aria-valuemin", 0), ("aria-valuemax", 100), ("aria-valuenow", pct), ("aria-label", "%d%% done" % pct)):
            state.set_attr(self.progress, k, v)
        complete = len(done) >= len(self._steps)
        self.done_card.visible = complete
        self.done_text.text = "Wear it well." + (" Hang it in the showroom so others can admire it." if state.me() else "")
        self.share_button.visible = bool(state.me()) and self.mine and not self.p.get("shared")

    def _last_sewn(self):
        k = -1
        for sid in self._done():
            st = self._steps.get(sid)
            if st and st["seam_step"] is not None:
                k = max(k, int(st["seam_step"]))
        return k

    def _tick(self, id, checked, **event_args):
        done = [x for x in self._done() if x != id]
        was_all = len(self._done()) >= len(self._steps)
        if checked:
            done.append(id)
        self.p["progress"] = {"done": done}
        status = self.p.get("status") or "drafting"
        if len(done) >= len(self._steps):
            status = "done"
        elif any(x.startswith("sew-") for x in done):
            status = "sewing"
        elif "lay" in done:
            status = "cutting"
        elif status == "done":
            status = "sewing"
        self.p["status"] = status
        r = my.save_project(self.p, quiet=True)
        if r and r.get("ok") is False:
            state.toast(r.get("error") or "Not saved.", "error")
        st = self._steps.get(id)
        if st:
            st["done"] = bool(checked)
            st["_form"].draw()
            if checked and st["seam_step"] is not None:
                self.fit.set_step(int(st["seam_step"]), True)
        self._progress()
        if len(done) >= len(self._steps) and not was_all:
            window.MY.confetti()
            state.toast("Mission complete. Splendid work.", "ok")

    def _show(self, id, k, **event_args):
        for sid, st in self._steps.items():
            if st.get("on") != (sid == id):
                st["on"] = sid == id
                st["_form"].draw()
        self.fit.set_step(int(k), True)
        steps = list(my.jget(self.dr, "steps", []))
        if 0 <= int(k) < len(steps):
            self.cap.text = "Step: " + str(steps[int(k)].title)
        if window.innerWidth < 1000:
            anvil.js.get_dom_node(self.aside).scrollIntoView({"behavior": "smooth", "block": "start"})

    @handle("print_button", "click")
    def print_button_click(self, **event_args):
        window.print()

    @handle("share_button", "click")
    def share_button_click(self, **event_args):
        if state.call("share_project", self.p["pid"], True):
            self.p["shared"] = True
            state.toast("Hung in the showroom.", "ok")
            self._progress()
