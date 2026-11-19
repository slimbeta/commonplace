(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  let articles = [];
  let view = store.get("cp-view", "latest") === "saved" ? "saved" : "latest";
  const saved = new Set(store.get("cp-saved", []));
  const tpl = $("#t-story");
  const content = $("#content");

  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  $("#today").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date());

  function ago(iso) {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 60) return m <= 1 ? "Just now" : `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hr${h > 1 ? "s" : ""} ago`;
    const d = Math.round(h / 24);
    return d === 1 ? "Yesterday" : `${d} days ago`;
  }
  const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

  function card(a, cls) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    if (cls) node.classList.add(cls);
    const link = node.querySelector(".story-link");
    link.href = a.url;
    node.querySelector(".kicker").textContent = a.publication || "";
    const hed = node.querySelector(".hed"), dek = node.querySelector(".dek");
    if (a.title && a.title.toLowerCase() !== a.blurb.toLowerCase()) { hed.textContent = a.title; dek.textContent = a.blurb; }
    else { hed.textContent = a.blurb; dek.remove(); }
    if (a.image) {
      const fig = node.querySelector(".story-photo"), img = fig.querySelector("img");
      img.src = a.image;
      img.addEventListener("error", () => { fig.remove(); node.classList.remove("has-photo"); });
      fig.hidden = false; node.classList.add("has-photo");
    } else node.querySelector(".story-photo").remove();
    node.querySelector(".age").textContent = ago(a.seen);
    const btn = node.querySelector(".save");
    const paint = () => { const on = saved.has(a.url); btn.setAttribute("aria-pressed", on); btn.textContent = on ? "Saved" : "Save"; };
    paint();
    btn.addEventListener("click", () => {
      saved.has(a.url) ? saved.delete(a.url) : saved.add(a.url);
      store.set("cp-saved", [...saved]); paint(); counts();
      if (view === "saved") render();
    });
    return node;
  }

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const empty = (msg) => { content.replaceChildren(el("p", "empty", msg)); };

  function front(list) {
    // Lead = first pick with a photo in the newest batch (falls back to the first pick).
    const top = list.slice(0, 10);
    const leadIdx = Math.max(0, top.findIndex((a) => a.image));
    const lead = top[leadIdx];
    const rest = list.filter((a) => a !== lead);
    const wrap = el("div", "front");
    const leadCol = el("div", "lead-col"), side = el("div", "side-col");
    const leadCard = card(lead, "lead");
    const dek = leadCard.querySelector(".dek");
    if (dek && /^[A-Za-z]/.test(dek.textContent)) dek.classList.add("dropcap");
    leadCol.append(leadCard);
    rest.slice(0, 3).forEach((a) => side.append(card(a)));
    wrap.append(leadCol, side);
    const frag = document.createDocumentFragment();
    frag.append(wrap);
    const more = rest.slice(3, 31);
    if (more.length) {
      frag.append(el("h2", "rule-heading", "Also noted"));
      const grid = el("div", "grid");
      more.forEach((a) => grid.append(card(a)));
      frag.append(grid);
    }
    content.replaceChildren(frag);
  }

  function editions(list) {
    const frag = document.createDocumentFragment();
    let cur = null, box = null;
    for (const a of list) {
      const k = dayKey(a.seen);
      if (k !== cur) {
        cur = k;
        const sec = el("section", "edition list");
        sec.append(el("h2", "edition-date", dayFmt.format(new Date(a.seen))));
        frag.append(sec); box = sec;
      }
      box.append(card(a));
    }
    content.replaceChildren(frag);
  }

  function render() {
    document.querySelectorAll(".sections button[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    let list = articles;
    if (!list.length) return empty("No picks yet. Check back soon.");
    if (view === "saved") {
      list = articles.filter((a) => saved.has(a.url));
      return list.length ? editions(list) : empty("Tap Save on any story to keep it here.");
    }
    front(list);
  }

  function counts() { $("#saved-count").textContent = saved.size ? `(${saved.size})` : ""; }

  // Skim: one story per screen, swiped vertically, with the publisher's own summary text.
  const skimEl = $("#skim"), track = $("#skim-track"), skimCount = $("#skim-count");
  let skimObserver = null, pushedSkim = false;
  function skimCard(a, i, n) {
    const c = el("article", "skim-card");
    if (a.image) {
      const fig = el("figure", "skim-photo"), img = document.createElement("img");
      img.alt = ""; img.decoding = "async"; img.referrerPolicy = "no-referrer";
      if (i > 2) img.loading = "lazy";
      img.src = a.image; img.addEventListener("error", () => fig.remove());
      fig.append(img); c.append(fig);
    } else c.classList.add("no-photo");
    const body = el("div", "skim-body");
    body.append(el("p", "kicker", a.publication || ""));
    const hasTitle = a.title && a.title.toLowerCase() !== a.blurb.toLowerCase();
    body.append(el("h2", "skim-hed", hasTitle ? a.title : a.blurb));
    if (hasTitle) body.append(el("p", "skim-blurb", a.blurb));
    const sum = el("div", "skim-summary");
    if (a.description) sum.append(el("p", "skim-desc", a.description));
    if (a.excerpt) sum.append(el("p", "skim-excerpt", a.excerpt));
    if (!a.description && !a.excerpt) sum.append(el("p", "skim-none", "No preview from the publisher \u2014 tap through to read it."));
    body.append(sum);
    c.append(body);
    const foot = el("div", "skim-foot");
    const go = el("a", "skim-read", "Read the full piece \u2192");
    go.href = a.url; go.target = "_blank"; go.rel = "noopener";
    const sv = el("button", "save");
    sv.type = "button";
    const paint = () => { const on = saved.has(a.url); sv.setAttribute("aria-pressed", on); sv.textContent = on ? "Saved" : "Save"; };
    paint();
    sv.addEventListener("click", () => { saved.has(a.url) ? saved.delete(a.url) : saved.add(a.url); store.set("cp-saved", [...saved]); paint(); counts(); });
    foot.append(sv, go);
    c.append(foot);
    c.dataset.index = i + 1;
    return c;
  }
  function openSkim() {
    const list = articles.slice(0, 30);
    if (!list.length) return;
    track.replaceChildren(...list.map((a, i) => skimCard(a, i, list.length)));
    const end = el("div", "skim-card skim-end");
    end.append(el("p", "fleuron", "\u2766"), el("p", "skim-end-text", "You\u2019re all caught up."));
    const back = el("button", "skim-read", "Back to the front page"); back.type = "button"; back.addEventListener("click", closeSkim);
    end.append(back); track.append(end);
    skimEl.hidden = false; document.body.classList.add("skimming");
    track.scrollTop = 0;
    skimCount.textContent = `1 of ${list.length}`;
    skimObserver?.disconnect();
    skimObserver = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting && e.target.dataset.index) skimCount.textContent = `${e.target.dataset.index} of ${list.length}`;
    }), { root: track, threshold: 0.6 });
    track.querySelectorAll(".skim-card").forEach((c) => skimObserver.observe(c));
    if (location.hash !== "#skim") { history.pushState(null, "", "#skim"); pushedSkim = true; }
  }
  function closeSkim(fromPop) {
    if (skimEl.hidden) return;
    skimEl.hidden = true; document.body.classList.remove("skimming");
    skimObserver?.disconnect();
    if (fromPop !== true && location.hash === "#skim") {
      if (pushedSkim) history.back(); else history.replaceState(null, "", location.pathname + location.search);
    }
    pushedSkim = false;
    render();
  }
  $("#skim-close").addEventListener("click", closeSkim);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSkim(); });
  window.addEventListener("popstate", () => { if (location.hash !== "#skim") closeSkim(true); });
  document.querySelector("[data-action=skim]").addEventListener("click", openSkim);

  document.querySelectorAll(".sections button[data-view]").forEach((b) => b.addEventListener("click", () => {
    view = b.dataset.view; store.set("cp-view", view);
    render(); window.scrollTo({ top: 0 });
  }));

  // Theme
  $("#theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("cp-theme", root.dataset.theme); } catch (e) {}
  });

  async function load() {
    try {
      const r = await fetch("data/articles.json", { cache: "no-cache" });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      articles = data.articles || [];
      $("#updated").textContent = `Updated ${ago(data.updated).toLowerCase()}`;
      render();
      if (location.hash === "#skim" && skimEl.hidden) openSkim();
    } catch (e) {
      if (!articles.length) empty("Couldn’t reach the newsroom. Pull down to try again.");
    }
  }
  counts();
  load();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
