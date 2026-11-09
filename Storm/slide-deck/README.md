# FacultyPlan QA Review (slide deck)

- `FacultyPlan-QA-Review.pdf` — 21 slides, 16:9, ready to present or attach.
- `FacultyPlan-QA-Review.html` — the same deck as one web page (open in a browser; images load from `../qa-screenshots/`).
- `deck.json` + `slides/` — the editable source.

Live deck: https://claude.ai/artifact/1KQoypZ2hrgHW63PEb7YTb (private until shared from its Share menu).
The PDF was rendered locally with Playwright Chromium; if the live deck is edited, re-render or re-export to keep them in sync.

## Re-rendering the PDF
From the repo root: `node Storm/slide-deck/render-deck.mjs` rebuilds the HTML and PDF from `deck.json` and `slides/`.
Add a folder name to also save a PNG of each slide: `node Storm/slide-deck/render-deck.mjs previews`.
It needs the project's dependencies (`npm ci`) and an internet connection for the Google Fonts.
A new screenshot added to the live deck must also be added to the `blobs` map at the top of the script.
