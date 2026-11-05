---
name: makeyourownclothes
description: Context, workflow and recipes for Make Your Own Clothes (folder make-your-own-clothes-forms), the user's Anvil app built as native Anvil Forms. A tailor's-shop app that drafts sewing patterns from measurements (incl. a men's shirt and a tailored jacket), redraws them, redrafts from typed fit changes, sews them in a 3D cloth simulation, has a fabric guide, writes a making book, and runs a supervised commission board where tailors quote. Load this before any feature request, bug fix, restyle, content change or deploy for this app.
---

# Make Your Own Clothes: working on the app

**What it is:** home sewists make their own clothes: a measurement dossier drives eleven parametric patterns (and imported /
traced ones), redrawn on a 2D cutting table, adjusted by fit changes typed from a toile, sewn seam by seam in a three.js cloth
simulation on a mannequin cut to the measurements, with a researched fabric reference (Cloth room), a generated making book, a
Showroom of shared garments, and a commission board where seamstresses and tailors quote for making a member's garment (the
shop reviews every quote and every tailor's message first). Guests can do everything except share, open requests or quote;
their work lives in localStorage and is imported on sign-in.

**Where it lives:**
- Folder `C:\Users\arkvi\Documents\CLAUDE\make-your-own-clothes-forms\` = the git clone of
  **github.com/arkulinskis/make-your-own-clothes**. "git" layout: the folder *is* the Anvil app. Anvil pulls master;
  pushing is the deploy. Native Forms since 2026-11-05 (merged); the old JavaScript folder
  `C:\Users\arkvi\Documents\CLAUDE\make-your-own-clothes` is retired (its deploy.py refuses). Live:
  https://make-my-clothes.anvil.app
- Converted from the JS-template app with APP_MAKER/template-forms; same addresses, tables, callables and look.
- **README.md** lists every feature. Keep it up to date.

**What the user wants:** "Kingsman"-style: a Savile Row tailor's shopfront, gentleman-spy wit without naming the film. Bottle
green fascia header (`--c-fascia`), brass lettering (`--c-brass`), oxblood accents (`--c-oxblood`), tailor's paper background;
dark mode is a near-black green with brass as the brand colour. Fonts: Cinzel (signage), Cormorant Garamond (headings), Source
Sans 3 (text). Spy touches: codenames, agent numbers, dossiers, stamps, "mission complete". Real maths, 3D, open-source pattern
grounding, deep fabric research. **The commission board is supervised (user's rule, 2026-11-05): anything the public sends a
member (quotes, tailors' messages) is reviewed in Admin → Review before the member sees it.** Claude assumes details and
builds; Claude deploys. Mobile-first (390 px), light and dark.

## Workflow for any change

1. `git pull --ff-only` (Anvil commits "Edited ..." when the user changes something in the IDE).
2. Edit: a page's `form_template.html` + `__init__.py`, an engine in `theme/assets/my-*.js`, or server code.
3. `python tools/check.py` → **ALL CHECKS PASSED** (Anvil's validator on every template and Python file, JS syntax, asset
   hashes, server tests, `drafttest.js` = every pattern × size × figure × option, `fittest.js` = the fit-change reader).
   After a solver or 3D-placement change also `node tools/testing/simtest.js . [pattern]` (a few "BAD" lines for tiny
   over-stretch on tee / kimono / tote are known).
4. `python -I tools/ui_test.py` (Docker Desktop running) → **ALL UI TESTS PASSED**: flow.js (the journeys incl. fit
   changes, a request and a held quote), phone.js (every page at 390 px), admin.js (incl. the review queue), a11y.js (axe on
   every page). Server edits need `--restart`. `--shots DIR` for screenshots: read them.
5. After theme/asset or head changes: `python tools/assets.py`. Commit only your files as arkulinskis with the
   Co-Authored-By line; push (`forms` until merged, then master). New tables/columns → the user accepts the Schema Mismatch.

## Architecture

```
client_code/
  startup.py, router.py    PAGES (same #addresses as the old app), NAV, TABS_MEMBER/TABS_GUEST; in-app link clicks
                           only change the hash (Anvil's <base href>)
  state.py, auth.py        template helpers (call, toast, store, set_attr, a11y helpers), sign in / up / Google
  my.py                    THE storage facade: measure / load_measure / save_measure, list_projects / load_project /
                           save_project (dict or the Studio's live JS object) / delete_project / begin / begin_own (guests:
                           localStorage via MY.projects.local*, members: server); to_js / to_py; jget (safe JS property
                           read); Later (debounce on setTimeout); thumbnails and engine helpers
  Layouts/Shell            fascia header + menu, footer, phone tab bar + More sheet (guests get it too)
  Pages/                   Landing, Auth, Profile, Wardrobe, Patterns, Measure, Studio, Book, Fabrics, Showroom, Tailor,
                           Requests (the board), Request (one commission), Admin
  Components/              Html (engine markup), Fitting (3D, mounts on show, queues calls), CuttingTable (MY.Table),
                           MeasureDiagram, Docket
  Items/                   Chip (rows of choices), cards and rows for every list (ProjectCard, PatternCard, SmallCard,
                           ShowroomCard, OptRow, PieceRow, SeamRow, FitChangeRow, StepButton, BookSection/BookStep,
                           FabricCard, InfoCard, RequestCard, QuoteCard, MessageRow, ReviewBidRow, ReviewMsgRow, ...)
  Dialogs/                 PatternDetail, FabricDetail, ImportPattern
theme/assets/              app.css (old core + page CSS with .ui-btn/.ui-ic aliased to roles, template role layer, forms
                           layer at the end), icons.css (tools/build_icons.py from app-kit.js UI.ICONS), app-kit.js,
                           my-core.js (geometry, sizes, browser store, codenames, swatches), my-fabrics.js, my-drafts.js
                           (MY.PATTERNS incl. shirt + jacket, MY.draftProject), my-fit.js (fit changes), my-draw.js, my-sim.js,
                           my-book.js, my-pages.js (helpers for pages), my-table.js (the cutting table)
server_code/               Projects (fit is a saved, cleaned key; public_data strips m and fit), Tailors (requests, the
                           board, quotes, messages, review, matching, guild), DemoData, Admin, Accounts, Feedback, common
```

**Tables:** users (+ measurements, units, remembered_logins), app_settings, feedback, projects (data = the whole project incl.
`fit`), admires, commissions (+ public, brief, title, area, remote_ok, invited, posted, updated; status open / accepted /
closed, old waiting / contacted / matched), tailors (+ user, kinds, remote), **bids** (request, user, tailor, price, days,
fittings, message, status review / approved / rejected / accepted / declined / notchosen / withdrawn, admin_note,
contact_shared, reviewed, reviewed_by), **bid_messages** (bid, request, sender, role member / tailor, body, status, admin_note).

## How things are done here

- Template-forms rules apply (one Form per page with the Shell, RepeatingPanel + Items, Dialogs + alert(), Labels for text
  that changes, Buttons with roles, JS only for engines). The app's own patterns:
- **Engines stay JavaScript** and return strings or plain objects; Python shows them with Components/Html (only markup the
  engines made). Read JS objects with `my.jget(obj, "name", default)`: a missing property raises AttributeError.
- **The Studio's live project is one JS object** shared by Python and MY.Table. Python changes it through the table's
  setters (setOpt, setFit, setFabric...), which redraft, redraw and call back `change` ("edit" → autosave after 0.9 s via
  my.Later). The side panel redraws from `api.panel()` (JSON).
- **Fit changes:** MY.parseFit(text) → items with `effect.m` (measurement deltas) or `effect.hem` ({part body/sleeve/leg, cm}),
  shown with `explain` before applying; stored in pr.fit; MY.draftProject applies fitMeasures before drafting and fitShape
  after. Add a phrase: PLACES / LESS / MORE / SHORTER / LONGER in my-fit.js + a line in tools/testing/fittest.js.
- **New pattern:** `pattern({...})` in my-drafts.js (see the file header), add to MY.PATTERN_ORDER and to PATTERNS in
  server_code/Projects.py and PATTERN_KIND in Tailors.py. Helpers for split armholes: splitCubic, cubicAt, splitEdgeAt (split
  a sleeve cap where a yoke or side panel meets the armhole), fitLength. Seams that touch 2D-only pieces (collars, cuffs) are
  truing only; the sim skips them.
- **The commission board:** public data is the `brief` (no m, no fit list, the nearest size); contact details are refused
  by `CONTACT_RE`; quotes and tailors' messages start as `review`; accepting a quote gives that tailor `docket` (with m);
  `share_contact` reveals the member's email. Keep every new way for the public to reach a member behind the review queue.
- Timers: never `Timer()` in code (it doesn't tick unless placed on a form): use `my.Later`.

## Gotchas

- An Anvil Label's inheritance rule is zero-specificity (`:where`), so role sizes win; Labels inside `<p>` break: use divs.
- RepeatingPanel rows join the grid around them: panel role `contents` (or `chips`, `ui-stack`, `my-kv`) + the item's
  `*-host` root with `display: contents` (forms layer in app.css).
- A custom component's property setter can run before its template exists (Components/Html guards it).
- a11y.js waits 1.6 s after a theme switch: the Studio keeps the main thread busy and axe would catch the colour fade.
- Full-page screenshots stretch `vh` heights (the Studio canvas looks huge on phone shots: it isn't).
- `three.min.js` (r158) is loaded on demand by MY.three(); headless Chrome needs the SwiftShader flags (tools/live/drive.mjs).
- Shared garments and the board never carry the owner's measurements or fit changes (`Projects.public_data`, `Tailors._brief`).

## Privacy & Terms (legal kit)

From `APP_MAKER/legal-kit`: change `apps/makeyourownclothes.json` (it covers the commission board and fit changes since
2026-11-05), then there `python -I build.py makeyourownclothes && python -I install.py makeyourownclothes`, then
`python tools/assets.py` here and deploy. Sign-up keeps the tick box; feedback = Prepsto only.
