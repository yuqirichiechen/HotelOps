"""
Agilysys rGuest Stay reconnaissance scraper — Sprint 17 (HotelOps).

GOAL: log in once, walk the two pages the Front Desk uses to build the
morning forecast sheet, and dump EVERYTHING (text, HTML, XHR/fetch,
screenshots) so we can analyse the structure offline and decide how to
extract arrivals + per-room HK conditions for the FD forecast sheet
without further live sessions.

Pages we walk (in order):
  01-reservations   /v2/search/reservations  — today's arrivals
                    (demand side: who's coming, what room type they need)
  02-hk-condition   Rooms Mgmt → HK Condition  — every room + its
                    current HK status (D-Dirty, PU-Pickup, VI-Vacant
                    Inspected, IP-In Progress) + inventory status
                    (OCC/VAC). Supply side: which rooms still need
                    cleaning.

Pairing arrivals with HK conditions per floor is the whole forecast
logic.

Why this shape:
  - rGuest Stay is a React/Angular single-page app. Static HTTP libraries
    (requests, httpx) see only the empty shell. We need a real browser.
  - Playwright is the modern choice (Selenium works too, but Playwright
    has built-in request interception + better selectors).
  - We default to HEADED mode so you can: (a) watch the login work,
    (b) handle 2FA / CAPTCHA / any "unusual login" prompt that fires
    the first time a new IP/UA hits the system. Flip HEADLESS = True
    once login is reliable.

PRE-REQS (one-time):
    python3 -m venv .venv && source .venv/bin/activate
    pip install playwright
    python -m playwright install chromium

USAGE:
    AGILYSYS_USER=richie AGILYSYS_PASS='…' python3 agilysys_recon.py

OUTPUT (under scraper/recon/<timestamp>/):
    01-reservations/
      page.html         # rendered DOM
      page.txt          # innerText — what a human reads
      screenshot.png    # full-page screenshot
    02-hk-condition/
      page.html
      page.txt
      screenshot.png
    requests.jsonl      # every XHR/fetch tagged with which page was
                        # active when it fired (page_label field)
    summary.txt         # quick stats + JSON URLs grouped per page

WHAT TO DO WITH THE OUTPUT:
    1. Open requests.jsonl FIRST. If a page returned a clean JSON
       endpoint with the data we need, we skip DOM scraping entirely
       and call that endpoint directly with the rGuest x-token header.
       That's the holy-grail outcome.
    2. If no clean JSON, fall back to parsing page.html with
       BeautifulSoup (selector strategy comes after we eyeball it).
    3. screenshot.png + page.txt confirm whether table rows are real
       text (good) or canvas/<img>-rendered (much harder).

NOTE ON CREDENTIALS:
    Leave them in env vars (AGILYSYS_USER / AGILYSYS_PASS) so they
    aren't in the file the IDE auto-uploads to source control. The
    script falls back to the literals only if env vars are missing.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from playwright.sync_api import (  # type: ignore[import-not-found]
    sync_playwright,
    TimeoutError as PWTimeoutError,
)


# ─── Config ──────────────────────────────────────────────────────────────────

# Read from env first; fall back to the literals below ONLY for local
# testing. Production runs should always set the env vars. Accept both
# AGILYSYS_* (correct spelling) and AGILSYS_* (common typo) so neither
# falls through to "no creds, manual login" by accident.
USERNAME = (
    os.environ.get("AGILYSYS_USER")
    or os.environ.get("AGILSYS_USER")
    or ""
)
PASSWORD = (
    os.environ.get("AGILYSYS_PASS")
    or os.environ.get("AGILSYS_PASS")
    or ""
)

# Sprint 17 — go STRAIGHT to the target. stay.rguest.com/ lands on
# tenant-select with no login form, so the previous "navigate to root
# first" flow skipped login and we recorded the unauthenticated shell
# instead of real reservation data. rGuest's auth gate redirects us to
# a tenant-scoped login form from the deep URL, then bounces back
# after we sign in.
TARGET_URL = (
    "https://stay.rguest.com/v2/search/reservations"
    "?tenantId=1566&propertyId=481"
)

# Direct URL of the HK Condition page (Rooms Mgmt → HK Condition).
# Discovered from the referer header on a prior recon run. Using this
# direct URL skips a brittle nav-click chain (open Rooms Mgmt menu →
# click HK Condition) that needed manual intervention in 20260604-124629.
HK_CONDITION_URL = (
    "https://stay.rguest.com/v2/housekeeping/condition"
    "?tenantId=1566&propertyId=481"
)

# HEADED so we can see what's happening (and intervene if a 2FA prompt
# appears the first time a new IP hits the system). Flip to True once
# login is reproducible.
HEADLESS = False

# How long to wait for the arrivals page to settle after navigation.
# rGuest can take 5-10 s on a cold load while it pulls reservations.
SETTLE_SECONDS = 12

# Login selectors. rGuest's login form uses standard input types, but
# the exact name/id changes occasionally — we try several patterns.
# Order matters: most-specific first, generic fallback last.
USERNAME_SELECTORS = [
    'input[name="username"]',
    'input[name="user"]',
    'input[name="email"]',
    'input[type="email"]',
    'input#username',
    'input[autocomplete="username"]',
]
PASSWORD_SELECTORS = [
    'input[name="password"]',
    'input[type="password"]',
    'input#password',
    'input[autocomplete="current-password"]',
]
SUBMIT_SELECTORS = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Sign in")',
    'button:has-text("Log in")',
    'button:has-text("Login")',
]


# ─── Helpers ─────────────────────────────────────────────────────────────────


def first_matching(page, selectors: list[str], timeout_ms: int = 3000):
    """Return the first selector that resolves to a visible element."""
    for sel in selectors:
        try:
            el = page.wait_for_selector(sel, timeout=timeout_ms, state="visible")
            if el:
                return sel, el
        except PWTimeoutError:
            continue
    return None, None


def maybe_login(page) -> bool:
    """Try the credentials. Returns True if login form was found + submitted.

    If we don't have creds OR the form isn't where we expect, we hand
    control to you — finish login in the browser window, then press
    Enter back at the terminal.
    """
    if not USERNAME or not PASSWORD:
        print(
            "[i] No credentials configured. Log in manually in the browser, "
            "then come back here and press Enter."
        )
        input(">>> press Enter once you're logged in and seeing the dashboard: ")
        return False

    user_sel, user_el = first_matching(page, USERNAME_SELECTORS, timeout_ms=8000)
    if not user_el:
        print(
            "[!] Username field not found via any known selector. "
            "Finish login manually, then press Enter."
        )
        input(">>> press Enter when logged in: ")
        return False

    print(f"[i] Found username field via: {user_sel}")
    user_el.fill(USERNAME)

    pw_sel, pw_el = first_matching(page, PASSWORD_SELECTORS, timeout_ms=4000)
    if not pw_el:
        print("[!] Password field not found. Finish login manually + Enter.")
        input(">>> press Enter when logged in: ")
        return False
    print(f"[i] Found password field via: {pw_sel}")
    pw_el.fill(PASSWORD)

    submit_sel, submit_el = first_matching(page, SUBMIT_SELECTORS, timeout_ms=2000)
    if submit_el:
        print(f"[i] Submitting via: {submit_sel}")
        submit_el.click()
    else:
        # Some forms submit on Enter only.
        print("[i] No submit button found — pressing Enter on the password field.")
        pw_el.press("Enter")

    # If 2FA or "verify your device" fires, give the human a chance to
    # complete it. We'll wait up to 60 s for the URL to leave the login
    # page; if it doesn't, prompt for help.
    try:
        page.wait_for_url(lambda u: "login" not in u, timeout=60_000)
        print("[✓] Login navigation complete.")
        return True
    except PWTimeoutError:
        print(
            "[!] Still on login URL after 60 s — maybe a 2FA / verify step? "
            "Finish in the browser, then press Enter."
        )
        input(">>> press Enter once you're on the post-login dashboard: ")
        return True


def attach_network_logger(page, log_path: Path, page_label_ref: dict[str, str]):
    """Write every XHR/fetch response (URL + body) to a JSONL file.

    page_label_ref is a mutable container; the main loop updates
    page_label_ref["current"] before each navigation so each logged
    entry is tagged with which UI page was active when it fired.
    """

    fh = open(log_path, "w", encoding="utf-8")

    def on_response(response):
        try:
            req = response.request
            # Skip media + static assets — only interesting traffic.
            rtype = req.resource_type
            if rtype not in ("xhr", "fetch", "document"):
                return
            url = response.url
            # Static asset URLs we can confidently drop.
            if any(url.endswith(ext) for ext in (".js", ".css", ".woff2", ".woff", ".ttf", ".svg", ".png", ".jpg", ".ico", ".map")):
                return

            entry: dict[str, Any] = {
                "page_label": page_label_ref.get("current", "unknown"),
                "method": req.method,
                "url": url,
                "status": response.status,
                "resource_type": rtype,
                "request_headers": dict(req.headers),
                "response_headers": dict(response.headers),
            }
            # Try to capture the response body. JSON is the prize.
            ct = (response.headers.get("content-type") or "").lower()
            try:
                if "application/json" in ct:
                    entry["body_json"] = response.json()
                elif "text/" in ct or "javascript" in ct:
                    text = response.text()
                    # Cap to 100 KB per body so the log stays scannable.
                    entry["body_text"] = text[:100_000]
                    if len(text) > 100_000:
                        entry["body_truncated"] = True
            except Exception as e:
                entry["body_error"] = str(e)
            fh.write(json.dumps(entry, ensure_ascii=False, default=str) + "\n")
            fh.flush()
        except Exception as e:
            # Never let the logger break the scrape.
            print(f"[warn] network log error: {e}", file=sys.stderr)

    page.on("response", on_response)
    return fh


def dump_page(page, out_dir: Path, label: str):
    """Save html / text / screenshot under out_dir/<label>/ for offline analysis."""
    sub = out_dir / label
    sub.mkdir(parents=True, exist_ok=True)

    print(f"[i] [{label}] Dumping page HTML…")
    html = page.content()
    (sub / "page.html").write_text(html, encoding="utf-8")

    print(f"[i] [{label}] Dumping visible text (innerText of body)…")
    try:
        text = page.evaluate("() => document.body.innerText")
    except Exception:
        text = ""
    (sub / "page.txt").write_text(text or "(empty)", encoding="utf-8")

    print(f"[i] [{label}] Capturing screenshot (full page)…")
    page.screenshot(path=str(sub / "screenshot.png"), full_page=True)


def navigate_to_hk_condition(page) -> bool:
    """Open the HK Condition page. Return True on success.

    Strategy (in order of preference):
      1. Direct goto HK_CONDITION_URL. Cheapest, no UI clicks needed.
         The session is already authenticated (we came from page 1)
         so rGuest doesn't bounce us back to login.
      2. Click fallback: top nav → Rooms Mgmt dropdown → HK Condition.
         Used only if (1) fails (e.g., rGuest changed the URL scheme).
      3. Manual fallback: prompt the human to navigate and press Enter.

    Why a direct goto works: rGuest is a SPA but it uses real URL
    routing under /v2/, so deep-linking holds state. We discovered
    the URL from a referer header on a prior run.
    """
    print(f"[i] Navigating → {HK_CONDITION_URL}")
    try:
        page.goto(HK_CONDITION_URL, wait_until="domcontentloaded", timeout=20_000)
        # Network idle is the closest proxy to "table has loaded"
        # without knowing rGuest's exact internal selectors.
        try:
            page.wait_for_load_state("networkidle", timeout=15_000)
        except PWTimeoutError:
            pass
        # Confirm we ended up on the right page. If rGuest's URL
        # scheme changes, this check catches it and we fall back to
        # clicking through the nav.
        if "/housekeeping/condition" in page.url:
            print(f"[✓] On HK Condition page. URL: {page.url}")
            return True
        print(f"[!] Unexpected URL after goto: {page.url}. Trying nav click…")
    except PWTimeoutError as e:
        print(f"[!] Direct goto failed: {e}. Trying nav click…")

    # Fallback: click through Rooms Mgmt → HK Condition.
    try:
        page.get_by_text(re.compile(r"rooms\s*mgmt", re.IGNORECASE)).first.click(timeout=5000)
        page.wait_for_timeout(500)
        page.get_by_text(re.compile(r"hk\s*condition", re.IGNORECASE)).first.click(timeout=5000)
        try:
            page.wait_for_load_state("networkidle", timeout=15_000)
        except PWTimeoutError:
            pass
        print(f"[✓] On HK Condition page via nav click. URL: {page.url}")
        return True
    except PWTimeoutError as e:
        print(f"[!] Nav click also failed: {e}")
        print(
            "    Navigate manually: top nav → Rooms Mgmt → HK Condition.\n"
            "    Wait until the room rows are visible, then press Enter."
        )
        input(">>> press Enter once you're on the HK Condition page: ")
        return False


def write_summary(out_dir: Path, network_log: Path):
    """Quick eyeball of the network log so you know where to look.

    Breaks down JSON-returning URLs by which page was active when the
    request fired — the page_label tag on each entry — so you can see
    at a glance which endpoint belongs to reservations vs. HK condition.
    """
    lines = []
    if not network_log.exists():
        (out_dir / "summary.txt").write_text(
            "(no network log written)\n", encoding="utf-8"
        )
        return

    all_seen: dict[str, int] = {}
    json_urls_by_page: dict[str, list[str]] = {}
    with open(network_log, "r", encoding="utf-8") as f:
        for raw in f:
            try:
                entry = json.loads(raw)
            except Exception:
                continue
            url = entry["url"]
            label = entry.get("page_label", "unknown")
            all_seen[url] = all_seen.get(url, 0) + 1
            if "body_json" in entry:
                json_urls_by_page.setdefault(label, []).append(url)

    total_json = sum(len(v) for v in json_urls_by_page.values())
    lines.append(f"Total interesting responses: {sum(all_seen.values())}")
    lines.append(f"Unique URLs:                 {len(all_seen)}")
    lines.append(f"Responses returning JSON:    {total_json}")
    lines.append("")
    for label in sorted(json_urls_by_page):
        urls = json_urls_by_page[label]
        lines.append(f"=== JSON URLs while on: {label} ({len(urls)} responses) ===")
        seen_set: set[str] = set()
        for u in urls:
            if u in seen_set:
                continue
            seen_set.add(u)
            lines.append(f"  - {u}")
        lines.append("")

    (out_dir / "summary.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


# ─── Main ────────────────────────────────────────────────────────────────────


def main():
    timestamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = Path(__file__).parent / "recon" / timestamp
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"[i] Output → {out_dir}")

    with sync_playwright() as pw:
        # Use a persistent context so cookies survive between runs — fewer
        # logins, less chance of triggering a 2FA challenge. Stored beside
        # the script (gitignored — see scraper/.gitignore).
        user_data_dir = Path(__file__).parent / ".browser_profile"
        user_data_dir.mkdir(exist_ok=True)

        ctx = pw.chromium.launch_persistent_context(
            user_data_dir=str(user_data_dir),
            headless=HEADLESS,
            viewport={"width": 1440, "height": 900},
            # Realistic UA. Default Playwright UA gets flagged by some
            # bot-detection layers; matching the installed Chromium UA
            # avoids that.
            user_agent=None,
        )
        page = ctx.new_page()

        # Page-label container — mutated by the main loop before each
        # navigation so the network logger can tag each request with
        # the page it was fired from. Initialized to "boot" for the
        # very first requests fired before we hit the target.
        page_label_ref: dict[str, str] = {"current": "boot"}

        # Wire up network logging BEFORE navigating so we don't miss
        # responses that fire during initial load.
        log_path = out_dir / "requests.jsonl"
        fh = attach_network_logger(page, log_path, page_label_ref)

        try:
            # === Page 1: reservations ============================
            page_label_ref["current"] = "01-reservations"

            # Hit the deep URL. rGuest's auth gate will bounce us to a
            # tenant-scoped login if we're not authenticated.
            print(f"[i] Navigating → {TARGET_URL}")
            page.goto(TARGET_URL, wait_until="domcontentloaded", timeout=30_000)

            # Detect login form. If it appears within 8 s, fill it in
            # (or hand off to the human for 2FA). If not, we already
            # have a session — skip to the recon.
            login_form_visible = False
            try:
                page.wait_for_selector(
                    ", ".join(PASSWORD_SELECTORS),
                    timeout=8000,
                    state="visible",
                )
                login_form_visible = True
            except PWTimeoutError:
                pass

            if login_form_visible:
                print("[i] Login form present — attempting sign-in.")
                maybe_login(page)

                # After login, rGuest may land us on a generic dashboard
                # rather than the deep URL we asked for. Navigate back
                # explicitly so the recon dump is the reservations page,
                # not whatever landing they default to.
                if not page.url.startswith(
                    "https://stay.rguest.com/v2/search/reservations"
                ):
                    print(
                        f"[i] Post-login URL is {page.url} — re-navigating "
                        f"to the reservations page."
                    )
                    page.goto(
                        TARGET_URL,
                        wait_until="domcontentloaded",
                        timeout=30_000,
                    )
            else:
                print("[i] No login form visible — assuming existing session.")

            # Let the SPA hydrate + fetch arrivals. We don't know the
            # exact "arrivals loaded" selector yet (that's what this
            # recon is for), so we wait a fixed window. Bump
            # SETTLE_SECONDS if your network is slow.
            print(
                f"[i] Letting the page settle for {SETTLE_SECONDS}s "
                "(SPA is fetching arrivals…)"
            )
            page.wait_for_timeout(SETTLE_SECONDS * 1000)

            # Sanity check: warn if we ended up somewhere unexpected so
            # you don't analyze a useless dump.
            final_url = page.url
            if "/search/reservations" not in final_url:
                print(
                    f"[!] WARNING: final URL is {final_url}\n"
                    "    The recon may not contain reservations data.\n"
                    "    If a login challenge is on screen, finish it\n"
                    "    manually, navigate to the reservations page,\n"
                    "    then press Enter to continue."
                )
                input(">>> press Enter once you're on the reservations page: ")

            dump_page(page, out_dir, "01-reservations")

            # === Page 2: Rooms Mgmt → HK Condition ===============
            # Switch the label BEFORE we click so the navigation's
            # XHRs (the per-room HK conditions endpoint we're hunting)
            # are tagged correctly.
            page_label_ref["current"] = "02-hk-condition"

            navigate_to_hk_condition(page)

            # Let the HK table render + paginate.
            print(
                f"[i] Letting HK Condition settle for {SETTLE_SECONDS}s "
                "(table is loading rooms…)"
            )
            page.wait_for_timeout(SETTLE_SECONDS * 1000)

            dump_page(page, out_dir, "02-hk-condition")
        finally:
            fh.close()
            # Leave the browser open for a beat so you can manually
            # inspect if something looks off. Comment out if running
            # unattended.
            if not HEADLESS:
                input(
                    "[i] Recon complete. Browser stays open for inspection. "
                    "Press Enter to close and exit: "
                )
            ctx.close()

    write_summary(out_dir, log_path)
    print(f"\n[✓] Done. Look in: {out_dir}")


if __name__ == "__main__":
    main()
