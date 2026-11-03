# Make Your Own Clothes

A bespoke tailor's shop for people who want to make their own clothes. It drafts real sewing patterns from your body
measurements (the tailor's block method, like FreeSewing and Seamly2D do), lets you redraw them on a cutting table, sews
the flat pieces together at their seam lines in a 3D cloth simulation on a mannequin built from your measurements,
explains fabrics in a researched reference guide, and writes a step-by-step making book for your pattern and cloth.
"Send it to a seamstress" is a waiting list for a future made-to-order service. Styled as a Savile Row tailor's
shopfront with a quiet gentleman-spy wit. Built on [Anvil](https://anvil.works).

- **App repo:** github.com/arkulinskis/make-your-own-clothes (branch `master`). Anvil pulls `master`.
- **Live:** https://make-my-clothes.anvil.app

## What it does

**For everyone (no account needed; work is kept in the browser):**
- **Landing** (`#landing`): an illustrated shopfront (the door opens on hover / tap), how it works, features, live pattern thumbnails, FAQ.
- **Measurement dossier** (`#measure`): 13 measurements with how-to-measure help and a highlighted body diagram, size presets
  (XS–XXL, straight and curved figures), cm / inches, sanity checks, and a rotating 3D mannequin built from the numbers.
- **Pattern archive** (`#patterns`): nine parametric patterns drafted live to your measurements: T-shirt, waistcoat, shift dress,
  A-line skirt, circle skirt, drawstring trousers, kimono jacket, tote bag, bodice block (fitting toile). Details show the maths,
  the notions, suggested cloths and the open-source designs they follow. "Bring your own pattern" (SVG import / photo trace).
- **Studio** (`#studio/<pid>/<tab>`), one garment:
  - *Cutting table* (draft): move points and Bézier handles, add / delete points, curve or corner, measure, the needle tool
    (sew any two edges into a new seam), trace a photo, import an SVG; undo / redo; size nest overlay; panel with fit options,
    measurements (size or "my dossier"), seam allowance, pieces (reset, 3D placement for own pieces, cut-as-pair), the seam truing
    table, and the cloth (fabric + weave / colours).
  - *Fitting room* (fit): the pieces wrapped round the mannequin and sewn seam by seam (cloth simulation); steps of the making
    book, "Sew it all", front / side / back, ease map (tight to loose colours), turn, a breeze.
  - *Lay plan* (lay): cutting layout on folded or single-layer cloth (112 / 140 / 150 cm), how much to buy (incl. shrinkage),
    print at true scale on A4 / US Letter (test square, page map), SVG for a copy shop, projector mode (calibrated 1:1).
  - *Pattern facts* (info): about, the drafting maths, measurements used, open-source references, notes.
- **Making book** (`#book/<pid>`): prep (brief, prewash, toile, printing), cutting (layout diagram, marking, fusing), every sewing
  step with needle / stitch / seam allowance / finish / pressing for the chosen cloth, seam diagrams, a 3D view per step,
  progress ticks (status updates itself), confetti on "mission complete", print.
- **Cloth room** (`#fabrics/<tab>/<key>`): 38 cloths (search, filters, full detail cards), 14 fibres (regain, burn test, care),
  weave and knit diagrams, ISO iron dots, care symbols, needles, stitch lengths, calculators (stretch %, GSM / oz, shrinkage,
  Super numbers), suiting weights, glossary, sources.
- **Showroom** (`#showroom`): garments members shared, drawn from their real patterns; tip your hat, open read-only, copy.
- **Send to a tailor** (`#tailor/<pid>`): the printable tailor's docket, the commission waiting list (members), the guild
  application for seamstresses and tailors (anyone).
- Sign-up with email and password or Google, a feedback form, the Privacy & Terms page.

**For members:** the **Wardrobe** home (`#wardrobe`): garments with thumbnails, status and progress, the dossier, and a banner
that moves drafts made before signing in into the account. Garments and measurements are saved on the server; share to the
Showroom; requests to a tailor.

**For admins** (`#admin`; arkulinskis@gmail.com becomes an admin on first sign-in):
- **Feedback inbox:** New / Read / Done, private notes.
- **Commissions:** the tailor waiting list (contact details, docket, budget, timeline), statuses Waiting / Contacted / Matched /
  Closed, private notes.
- **Guild:** seamstress and tailor applications: verify, decline, delete.
- **Users:** search, make admin, disable an account.
- **Demo data:** nine fictional members' garments in the Showroom (with hats), two commissions and three guild applicants;
  remove or reload.

## Setting it up in Anvil (once)

1. In the Anvil editor: **Create app → Clone from GitHub**, and paste `https://github.com/arkulinskis/make-your-own-clothes`.
2. **Users** service: email + password and "Continue with Google", sign-up allowed (already set in `anvil.yaml`; check it).
3. Open the app in the editor. If it shows a **Schema Mismatch** alert, choose **"The schema of the source code is correct"** so Anvil creates the tables.
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
python -I tools/check.py --ui                    # syntax, server tests, headless UI tests → ALL CHECKS PASSED
python -I tools/preview/devserver.py 8765        # the app on in-memory data: http://localhost:8765/  (?as=ana#wardrobe, ?as=admin#admin)
python tools/deploy.py                           # dry run (needs PyYAML, so no -I)
python tools/deploy.py --push "Message"          # deploy: commit + push to GitHub, Anvil pulls it
```

## Project layout

```
web/            the interface: core.js/core.css (shared engine + design tokens), app.js (header, footer), pages/*.html
client_code/    Main.py (the only Anvil form: bridge to the server, sign-in), legal.py
server_code/    common.py, Accounts.py, Feedback.py, Admin.py, DemoData.py, legal_server.py, and the app's own modules
assets/         icon.svg + generated PNG icons, pictures (served at _/theme/<name>)
tools/          sync_to_anvil.py (settings + table schema), deploy.py, check.py, preview/ (dev server, UI tests, screenshots), testing/
```
