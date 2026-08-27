const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

function fileUrl(rel) { return rel ? `/files/${rel}` : ""; }

let ALL = [];

function matches(c, q) {
  if (!q) return true;
  const hay = [c.player, c.set_name, c.manufacturer, c.year, c.number, c.parallel, c.filename, c.ocr_text]
    .filter(Boolean).join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}

function renderGrid() {
  const q = $("#q").value.trim();
  const rows = ALL.filter(c => matches(c, q));
  const grid = $("#grid");
  grid.innerHTML = "";
  $("#empty").classList.toggle("hidden", ALL.length !== 0);
  $("#count").textContent = `${rows.length} card(s)`;
  for (const c of rows) {
    const t = document.createElement("div");
    t.className = "tile";
    t.innerHTML = `
      <img loading="lazy" src="${fileUrl(c.enhanced_path || c.rectified_path || c.original_path)}" alt="">
      <div class="t-body">
        <div class="t-name"></div>
        <div class="t-sub"></div>
      </div>`;
    $(".t-name", t).textContent = c.player || c.filename;
    $(".t-sub", t).textContent =
      [c.year, c.manufacturer, c.set_name, c.number ? `#${c.number}` : null].filter(Boolean).join(" · ") || c.engine;
    t.onclick = () => openDetail(c);
    grid.appendChild(t);
  }
}

function openDetail(c) {
  const host = $("#detail");
  host.innerHTML = "";
  const el = $("#lib-card-tpl").content.firstElementChild.cloneNode(true);
  $(".orig", el).src = fileUrl(c.original_path);
  $(".rect", el).src = fileUrl(c.rectified_path);
  if (c.enhanced_path) {
    $(".enh", el).src = fileUrl(c.enhanced_path);
    $(".enh-wrap", el).classList.remove("hidden");
  }
  $(".det-line", el).textContent = `${c.filename} · ${c.detector || c.engine} · ${c.created_at || ""}`;
  $$(".fields input", el).forEach(inp => { inp.value = c[inp.dataset.f] ?? ""; });
  if (c.ocr_text) $(".ocr pre", el).textContent = c.ocr_text;
  else $(".ocr", el).classList.add("hidden");

  const dl = $(".dl", el);
  dl.href = fileUrl(c.enhanced_path || c.rectified_path);
  dl.setAttribute("download", `${(c.player || "card").replace(/\s+/g, "-")}.png`);

  $(".save", el).onclick = async () => {
    const patch = {};
    $$(".fields input", el).forEach(i => {
      patch[i.dataset.f] = i.dataset.f === "year" ? (parseInt(i.value) || null) : (i.value || null);
    });
    const updated = await api(`/api/cards/${c.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
    });
    Object.assign(c, updated);
    toast("Saved");
    renderGrid();
  };

  const enhance = async (kind, btn) => {
    btn.disabled = true;
    try {
      const url = kind === "clean" ? `/api/cards/${c.id}/descratch` : `/api/cards/${c.id}/upscale?factor=${kind}`;
      const r = await api(url, { method: "POST" });
      c.enhanced_path = r.enhanced_path;
      $(".enh", el).src = fileUrl(r.enhanced_path) + `?t=${Date.now()}`;
      $(".enh-wrap", el).classList.remove("hidden");
      dl.href = fileUrl(r.enhanced_path);
      toast("Enhanced");
      renderGrid();
    } catch (e) { toast(`Enhance failed: ${e.message}`); }
    btn.disabled = false;
  };
  $(".up2", el).onclick = e => enhance(2, e.target);
  $(".up4", el).onclick = e => enhance(4, e.target);
  $(".clean", el).onclick = e => enhance("clean", e.target);
  $(".close", el).onclick = () => { host.classList.add("hidden"); host.innerHTML = ""; };

  host.appendChild(el);
  host.classList.remove("hidden");
  host.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#q").addEventListener("input", renderGrid);

api("/api/cards").then(r => {
  ALL = r.cards;
  renderGrid();
  api("/api/status").then(s => {
    $("#status").textContent = `${s.cards} cards · ocr ${s.ocr === "ready" ? "ready" : "off"}`;
  }).catch(() => {});
}).catch(e => toast(e.message));
