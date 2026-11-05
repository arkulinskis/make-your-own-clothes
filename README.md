# Make Your Own Clothes

A bespoke tailor's shop for people who want to make their own clothes. It drafts real sewing patterns from your body
measurements (the tailor's block method, like FreeSewing and Seamly2D do), lets you redraw them on a cutting table, reads the
fit changes you chalk on a test garment and redrafts from them, sews the flat pieces together at their seam lines in a 3D
cloth simulation on a mannequin built from your measurements, explains fabrics in a researched reference guide, and writes a
step-by-step making book. Members who don't sew can put a garment on the commission board, where seamstresses and tailors
quote for making it; the shop reads every quote and message before it reaches the member. Styled as a Savile Row tailor's
shopfront with a quiet gentleman-spy wit. Built on [Anvil](https://anvil.works) as native Anvil Forms.

- **App repo:** github.com/arkulinskis/make-your-own-clothes. Anvil pulls `master`. The native-Forms version is on branch
  `forms` until it is approved.
- **Live:** https://make-my-clothes.anvil.app

## What it does

**For everyone (no account needed; work is kept in the browser):**
- **Landing** (`#landing`): the shopfront hero (the door opens on hover / focus), the Watch section, how it works, features,
  the eleven patterns drafted live at your measurements, FAQ.
- **Measurement dossier** (`#measure`): 13 measurements with how-to-measure help and a highlighted body diagram, size presets
  (XS–XXL, straight and curved figures), cm / inches, sanity checks, and a rotating 3D mannequin built from the numbers.
- **Pattern archive** (`#patterns/<kind>`): eleven parametric patterns drafted live to your measurements: T-shirt, **men's
  shirt** (two-piece collar on a stand, button front with plackets, back yoke with a box pleat, sleeve plackets, barrel or
  double cuffs, curved or straight hem), waistcoat, **tailored jacket** (notch lapels, three-piece body with a side panel and
  a centre-back seam shaped at the waist, sleeve cap solved to the armhole and split at the panel seams, collar, facing,
  flap pockets, breast welt), shift dress, A-line skirt, circle skirt, drawstring trousers, kimono jacket, tote bag, bodice
  block. Details show the maths, the notions, suggested cloths and the open-source designs they follow. Bring your own
  pattern (SVG import / photo trace).
- **Studio** (`#studio/<pid>/<tab>`), one garment:
  - *Cutting table* (draft): move points and Bézier handles, add / delete points, curve or corner, measure, the needle tool
    (sew any two edges into a new seam), trace a photo, import an SVG; undo / redo; size nest overlay. Side panel: fit
    options, **fit changes**, pieces (reset, 3D placement for own pieces, cut-as-pair), the seam truing table, the cloth.
  - **Fit changes**: type what your test garment needed ("take in 1 cm at the side, let out the hips half an inch, shorten
    the sleeves 2 cm"). Each phrase is shown with how it was read ("side seams 1 cm deeper on each piece, so 4 cm less
    round the chest, waist and hip") before anything changes; "Redraft with these" applies them. Girth changes adjust the
    measurements the draft starts from (so sleeve caps re-solve); length changes move the hems. Hand edits stay. Each change
    can be switched off or removed; they're saved with the garment, listed in the pattern facts and the tailor's docket, and
    never shown to other people.
  - *Fitting room* (fit): the pieces wrapped round the mannequin and sewn seam by seam (cloth simulation); steps of the
    making book, "Sew it all", front / side / back, ease map, turn, a breeze.
  - *Lay plan* (lay): cutting layout on folded or single-layer cloth (112 / 140 / 150 cm), how much to buy (incl. shrinkage),
    print at true scale on A4 / US Letter, SVG for a copy shop, projector mode.
  - *Pattern facts* (info): about, the drafting maths, measurements used, open-source references, notes.
- **Making book** (`#book/<pid>`): prep, cutting, every sewing step with needle / stitch / seam allowance / finish / pressing
  for the chosen cloth, seam diagrams, a 3D view per step, progress ticks, confetti on "mission complete", print.
- **Cloth room** (`#fabrics/<tab>/<key>`): 38 cloths, 14 fibres, weave and knit diagrams, ISO iron dots, care symbols,
  needles, stitch lengths, calculators, glossary, sources.
- **Showroom** (`#showroom`): garments members shared, drawn from their real patterns; tip your hat, open read-only, copy.
- **The commission board** (`#requests`): open requests to have a garment made: the garment drawn at the nearest standard
  size, cloth, city, budget, timeline, notes. Never the member's email or measurements. Filters by kind and city; signed-in
  guild tailors get "Matched for me" and their invitations first.
- **A commission** (`#request/<id>`): the public brief and docket; signed in, send a quote (price, days, fittings, a note).
- Sign-up with email and password or Google, "Submit feedback" (Prepsto), the Privacy & Terms page.

**For members:**
- **Wardrobe** (`#wardrobe`): garments with thumbnails, status and progress, the dossier, a banner that brings drafts made
  before signing in into the account, and the commission desk at a glance.
- **Send to a seamstress** (`#tailor/<pid>`): the printable tailor's docket; **open a request** (city, neighbourhood,
  timeline, budget, notes, remote fittings OK) and it goes on the board; your requests and the quotes you sent. Emails,
  phone numbers and links are refused in anything public.
- **On your request**: quotes reach you **only after the shop has read and approved them**; accept one (the others are
  closed and that tailor then sees your full docket with measurements), decline, write to the tailor (your messages go
  straight through; theirs are reviewed first), share your email when you're ready, invite the verified guild tailors who
  match (same city or remote, make that kind of garment), withdraw.
- **For seamstresses and tailors**: join the guild (what you make, city, remote work); verified members get a badge on
  their quotes and see matching requests first. Quote, follow the thread, change or withdraw a quote; once accepted, the
  full docket appears (and the member's email if they share it).

**For admins** (`#admin`; arkulinskis@gmail.com becomes an admin on first sign-in):
- **Review**: every quote and every tailor's message waits here; pass it on to the member or don't (with a private note).
  Recent decisions are listed.
- **Requests**: all requests with the member's contact details, quotes waiting, status (on the board / quote accepted /
  closed; old waiting-list rows too).
- **Guild**: applications (kinds, city, remote, whether linked to an account and how many quotes): verify, decline, delete.
- **Feedback** (older messages), **Users**, **Demo data** (eleven fictional members' garments incl. a shirt and a jacket,
  three open requests with quotes from demo tailors, one quote and one message waiting for review).

## Setting it up in Anvil (once)

1. In the Anvil editor: **Create app → Clone from GitHub**, and paste `https://github.com/arkulinskis/make-your-own-clothes`.
2. **Users** service: email + password and "Continue with Google", sign-up allowed (already set in `anvil.yaml`; check it).
3. Open the app in the editor. If it shows a **Schema Mismatch** alert, choose **"The schema of the source code is correct"**
   (the commission board adds tables `bids` and `bid_messages` and columns on `commissions` and `tailors`).
4. **Run** it and sign up with **arkulinskis@gmail.com** straight away (that account becomes the admin).
5. **Publish** (Publish → public URL, or your own domain).

<!-- libraries:start -->
## Libraries and outside services

What this project uses besides its own code. Generated by `APP_MAKER/tools/libraries.py`; to change it, edit `APP_MAKER/libraries/catalog.py` and re-run the script.

| Name | How it gets in | Used here for |
|---|---|---|
| [three.js](https://threejs.org) r158 | Copied into the app | the fitting room: a mannequin cut to your measurements and the cloth simulation that sews the pattern onto it |
| [YouTube embeds](https://developers.google.com/youtube/player_parameters) | Outside web service | Plays a YouTube video inside the page (the privacy-friendlier youtube-nocookie address). |
| [Google Fonts](https://fonts.google.com) | Loaded from a CDN | Cinzel, Cormorant Garamond, Source Sans 3 |

**Built into the browser:** Canvas 2D, WebGL, localStorage, File downloads (Blob), Fullscreen.

**Anvil platform:** Anvil, Anvil Data Tables, Anvil Google service, Anvil JS bridge (anvil.js), Anvil Users.

**Build and test tools (not shipped):** Node.js, PyYAML, Headless Chrome (DevTools Protocol).

<!-- libraries:end -->

## Working on it

See `.claude/skills/makeyourownclothes/SKILL.md`. In short:

```
python tools/check.py                    # Anvil's validator, JS syntax, asset hashes, server tests, pattern + fit engines
python -I tools/ui_test.py               # the real app in the Anvil App Server (Docker) + headless Chrome
python -I tools/ui_test.py --shots DIR   # screenshots of every page, desktop + phone, light + dark
node tools/testing/simtest.js . shirt    # sew a pattern in the cloth sim without a browser
```

## Project layout

```
client_code/   startup, router, state, auth, my (storage facade + engine wrappers), legal;
               Layouts/Shell, Pages/*, Items/* (RepeatingPanel rows), Components/* (engine wrappers), Dialogs/*
server_code/   common, Accounts, Admin, DemoData, Feedback, Projects, Tailors (the commission desk), SchemaCheck, kits
theme/assets/  app.css, icons.css, app-kit.js, my-*.js (the drafting, fit, drawing, 3D, book and cutting-table engines),
               three.min.js, pictures
tools/         check.py, assets.py, ui_test.py + ui/, live/drive.mjs, testing/ (server tests, drafttest, fittest, simtest)
```
