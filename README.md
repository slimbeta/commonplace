# The Commonplace

An unofficial, iPhone-installable reader for the picks on [Arts & Letters Daily](https://www.aldaily.com/),
laid out like a newspaper front page with a New Yorker-leaning typographic style.

- `index.html`, `styles.css`, `app.js`: the reader (a static site; installs to the home screen).
- `scripts/update.py`: fetches the ALDaily RSS feed, adds new picks to `data/articles.json`, and grabs each
  article's preview image and headline from the publisher's page.
- `.github/workflows/update.yml`: runs the script hourly on GitHub Actions and commits any new picks.
- `sw.js`, `manifest.webmanifest`, `icons/`: offline cache and home-screen app metadata.

Run the fetcher locally: `python3 scripts/update.py`
Preview locally: `python3 -m http.server 8765`, then open http://localhost:8765
