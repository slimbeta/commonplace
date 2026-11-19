#!/usr/bin/env python3
"""Fetch the Arts & Letters Daily RSS feed and merge new picks into data/articles.json.

The feed only carries the latest ~10 picks and has no dates, so each item is
stamped with the time it was first seen and the file keeps a rolling archive.
For new items it also tries to read the publisher page's og:image / og:title.
Standard library only, so it runs on a bare GitHub Actions runner.
"""
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

FEED = "https://www.aldaily.com/feed/"
OUT = Path(__file__).resolve().parent.parent / "data" / "articles.json"
MAX_ITEMS = 600
UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")

PUBLICATIONS = {
    "wsj.com": "The Wall Street Journal", "harpers.org": "Harper's",
    "chronicle.com": "The Chronicle of Higher Education", "worksinprogress.co": "Works in Progress",
    "thenation.com": "The Nation", "thepointmag.com": "The Point", "theguardian.com": "The Guardian",
    "theatlantic.com": "The Atlantic", "theamericanscholar.org": "The American Scholar",
    "newyorker.com": "The New Yorker", "nytimes.com": "The New York Times",
    "washingtonpost.com": "The Washington Post", "nybooks.com": "The New York Review",
    "lrb.co.uk": "London Review of Books", "the-tls.co.uk": "The TLS", "economist.com": "The Economist",
    "newstatesman.com": "New Statesman", "spectator.co.uk": "The Spectator", "ft.com": "Financial Times",
    "bookforum.com": "Bookforum", "lareviewofbooks.org": "Los Angeles Review of Books",
    "aeon.co": "Aeon", "nplusonemag.com": "n+1", "newrepublic.com": "The New Republic",
    "commentary.org": "Commentary", "firstthings.com": "First Things", "city-journal.org": "City Journal",
    "tabletmag.com": "Tablet", "thefreepress.com": "The Free Press", "unherd.com": "UnHerd",
    "prospectmagazine.co.uk": "Prospect", "literaryreview.co.uk": "Literary Review",
    "theparisreview.org": "The Paris Review", "nautil.us": "Nautilus", "vox.com": "Vox",
    "slate.com": "Slate", "newcriterion.com": "The New Criterion", "claremontreviewofbooks.com":
    "Claremont Review of Books", "hedgehogreview.com": "The Hedgehog Review", "telegraph.co.uk":
    "The Telegraph", "thetimes.com": "The Times", "thetimes.co.uk": "The Times",
    "bostonreview.net": "Boston Review", "dissentmagazine.org": "Dissent", "compactmag.com": "Compact",
    "washingtonexaminer.com": "Washington Examiner", "nationalreview.com": "National Review",
    "smithsonianmag.com": "Smithsonian", "artforum.com": "Artforum", "apollo-magazine.com": "Apollo",
    "the-american-interest.com": "The American Interest", "quillette.com": "Quillette",
    "theconversation.com": "The Conversation", "noemamag.com": "Noema", "lithub.com": "Literary Hub",
    "bbc.com": "BBC", "bbc.co.uk": "BBC", "lapham's quarterly": "Lapham's Quarterly",
    "laphamsquarterly.org": "Lapham's Quarterly", "historytoday.com": "History Today",
    "theamericanconservative.com": "The American Conservative", "persuasion.community": "Persuasion",
    "reason.com": "Reason", "thecritic.co.uk": "The Critic", "engelsbergideas.com": "Engelsberg Ideas",
    "plough.com": "Plough", "commonwealmagazine.org": "Commonweal", "insidehighered.com": "Inside Higher Ed",
}


def get(url, limit=400_000, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xml"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(limit).decode("utf-8", "replace")


def publication(url):
    host = urlparse(url).hostname or ""
    host = re.sub(r"^(www|m|amp)\.", "", host)
    if host in PUBLICATIONS:
        return PUBLICATIONS[host]
    if host.endswith(".substack.com"):
        return host.split(".")[0].replace("-", " ").title()
    parts = host.split(".")
    base = parts[-2] if len(parts) >= 2 else host
    if f"{base}.{parts[-1]}" in PUBLICATIONS:
        return PUBLICATIONS[f"{base}.{parts[-1]}"]
    return base.replace("-", " ").title()


def meta(page, prop):
    for tag in re.findall(r"<meta\b[^>]*>", page, re.I):
        if not re.search(rf'(?:property|name)\s*=\s*["\']{re.escape(prop)}["\']', tag, re.I):
            continue
        m = re.search(r'content\s*=\s*(?:"([^"]*)"|\'([^\']*)\')', tag, re.I)
        if m:
            return html.unescape(m.group(1) if m.group(1) is not None else m.group(2)).strip()
    return None


def enrich(item):
    try:
        page = get(item["url"])
    except Exception as e:  # paywalls and bot walls are common; the card still works without
        print(f"  no preview for {item['url'][:70]}: {e}", file=sys.stderr)
        return
    img = meta(page, "og:image") or meta(page, "twitter:image")
    if img and img.startswith("http"):
        item["image"] = img
    site = meta(page, "og:site_name")
    if site and len(site) < 60 and urlparse(item["url"]).hostname.removeprefix("www.") not in PUBLICATIONS:
        item["publication"] = site
    title = meta(page, "og:title")
    if title:
        title = re.sub(r"^(Opinion|Review|Essay)\s*\|\s*", "", title)
        title = re.sub(r"\s+[|\u2013\u2014-]\s+[^|\u2013\u2014-]{2,40}$", "", title).strip()
    if title and len(title) < 200 and "just a moment" not in title.lower():
        item["title"] = title


def main():
    xml = get(FEED, limit=2_000_000)
    root = ET.fromstring(xml)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    existing = json.loads(OUT.read_text()) if OUT.exists() else {"articles": []}
    known = {a["url"] for a in existing["articles"]}
    fresh = []
    for it in root.iter("item"):
        url = (it.findtext("link") or "").strip()
        blurb = html.unescape((it.findtext("title") or it.findtext("description") or "").strip())
        if not url or not blurb or url in known or "aldaily.com" in (urlparse(url).hostname or ""):
            continue
        item = {"url": url, "blurb": blurb, "publication": publication(url), "seen": now}
        print(f"new: {item['publication']}: {blurb[:60]}")
        enrich(item)
        fresh.append(item)
    retried = 0
    for item in existing["articles"][:40]:
        if "image" not in item and item.get("tries", 1) < 3:
            item["tries"] = item.get("tries", 1) + 1
            enrich(item)
            retried += 1
    if not fresh and not retried and OUT.exists():
        print("no new picks")
        return
    articles = (fresh + existing["articles"])[:MAX_ITEMS]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"updated": now, "articles": articles}, ensure_ascii=False, indent=1))
    print(f"wrote {len(articles)} articles ({len(fresh)} new)")


if __name__ == "__main__":
    main()
