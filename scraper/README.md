# Agilysys reconnaissance scraper

One-off Python tool to capture what the rGuest Stay arrivals + HK
condition pages send to the browser, so we can decide how to extract
arrivals + per-room HK conditions for the Front Desk forecast sheet.

## What it captures

Each run logs in once, then walks the two pages the FD uses to build
the forecast (arrivals → reservations search; supply → Rooms Mgmt → HK
Condition). Writes a timestamped folder under `scraper/recon/`:

```
recon/<timestamp>/
├── 01-reservations/
│   ├── page.html        # rendered DOM
│   ├── page.txt         # innerText — what a human reads
│   └── screenshot.png   # full-page screenshot
├── 02-hk-condition/
│   ├── page.html
│   ├── page.txt
│   └── screenshot.png
├── requests.jsonl       # every XHR/fetch, tagged with page_label
└── summary.txt          # JSON URLs grouped per page
```

`requests.jsonl` is cumulative across both pages — every entry has a
`page_label` field (`01-reservations` or `02-hk-condition`) so you can
filter to the requests fired while a given page was active.

## Setup (one-time)

```bash
cd scraper
python3 -m venv .venv
source .venv/bin/activate
pip install playwright
python -m playwright install chromium
```

## Run

Pick one of:

```bash
# Option A — env vars (recommended)
AGILYSYS_USER='richie' AGILYSYS_PASS='your-rotated-password' \
  python3 agilysys_recon.py

# Option B — leave creds blank and log in by hand in the browser window
python3 agilysys_recon.py
```

The script runs headed by default so you can watch the login work and
intervene if a 2FA / "verify your device" prompt fires. After the
recon page settles, it dumps the four files above and pauses for you
to press Enter before closing.

## After the run

Open `summary.txt` first — it lists every JSON-returning endpoint
grouped by which page was active when the request fired. Then open
`requests.jsonl` and `jq`/grep into the bodies of the interesting URLs.

Auth pattern (decoded from the first run): rGuest issues a UUID token
on `POST /auth-service/auth/tenants/<tenantId>/users/login` and the
SPA sends it back on every subsequent call as an `x-token: <uuid>`
header. So if a page's data lives in a clean JSON endpoint, we can
call it server-side without keeping a browser open.

The `screenshot.png` + `page.txt` together tell us whether each page's
data is real text (good — DOM scrape works as a fallback) or rendered
into a `<canvas>` / image (much harder).

## Things this does NOT do (intentionally)

- It doesn't scrape on a schedule. This is a one-shot recon tool.
- It doesn't persist credentials beyond the env vars you pass in.
- It doesn't bypass any 2FA — if rGuest asks for one, you handle it
  in the browser window the script opens.
- It doesn't commit the recon output. `scraper/.gitignore` excludes
  `recon/` and `.browser_profile/`.

## ToS reminder

Agilysys's commercial PMS likely has terms that restrict automated
access. Before turning any of this into a production scraper, ask
the GM to confirm authorization (and ideally request a real API key
from Agilysys). This tool is for one-time analysis of a page you
already access manually every day.
