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

function renderCard(c) {
  const el = $("#card-tpl").content.firstElementChild.cloneNode(true);
  $(".orig", el).src = fileUrl(c.original_path);
  $(".rect", el).src = fileUrl(c.rectified_path);
  $(".det-line", el).textContent =
    `${c.filename} · card ${c.box ? "1" : ""} · ${c.detector || c.engine} · rectified`;
  $$(".fields input", el).forEach(inp => {
    inp.value = c[inp.dataset.f] ?? "";
    inp.addEventListener("change", () => el.dataset.dirty = "1");
  });
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
    await api(`/api/cards/${c.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
    });
    toast("Saved");
    loadComps(c, el);
  };

  const enhance = async (kind, btn) => {
    btn.disabled = true;
    try {
      const url = kind === "clean" ? `/api/cards/${c.id}/descratch` : `/api/cards/${c.id}/upscale?factor=${kind}`;
      const r = await api(url, { method: "POST" });
      const img = $(".enh", el);
      img.src = fileUrl(r.enhanced_path) + `?t=${Date.now()}`;
      $(".enh-wrap", el).classList.remove("hidden");
      dl.href = fileUrl(r.enhanced_path);
      toast("Enhanced");
    } catch (e) { toast(`Enhance failed: ${e.message}`); }
    btn.disabled = false;
  };
  $(".up2", el).onclick = e => enhance(2, e.target);
  $(".up4", el).onclick = e => enhance(4, e.target);
  $(".clean", el).onclick = e => enhance("clean", e.target);
  loadComps(c, el);
  return el;
}

async function loadComps(c, el) {
  const q = [c.year, c.manufacturer, c.player].filter(Boolean).join(" ");
  if (!q.trim()) return;
  const box = $(".comps", el);
  box.classList.remove("hidden");
  $(".comps-note", el).textContent = `“${q}”`;
  try {
    const r = await api(`/api/comps?q=${encodeURIComponent(q)}`);
    const nums = $(".comps-nums", el);
    if (r.ok && r.count) {
      nums.innerHTML = `<div>LOW<b>$${r.low}</b></div><div>MEDIAN<b>$${r.median}</b></div><div>HIGH<b>$${r.high}</b></div><div>SOLD<b>${r.count}</b></div>`;
    } else {
      nums.innerHTML = `<span style="color:var(--muted)">${r.error || r.note || "No comps"}</span>`;
    }
    $(".comps-links", el).innerHTML =
      `<a href="${r.link}" target="_blank" rel="noopener">eBay sold search</a>
       <a href="${r.pricecharting}" target="_blank" rel="noopener">PriceCharting</a>`;
  } catch {
    $(".comps-nums", el).innerHTML = `<span style="color:var(--muted)">comps unavailable</span>`;
  }
}

async function processFiles(files) {
  if (!files.length) return;
  $("#batch").classList.remove("hidden");
  const meta = $("#batch-meta");
  meta.textContent = `processing ${files.length} file(s)…`;
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  try {
    const r = await api("/api/process", { method: "POST", body: fd });
    meta.textContent = `${r.cards.length} card(s) · ${r.errors.length} failed`;
    for (const e of r.errors) toast(`${e.filename}: ${e.error}`);
    const host = $("#cards");
    for (const c of r.cards) host.prepend(renderCard(c));
  } catch (e) {
    meta.textContent = "failed";
    toast(e.message);
  }
}

const drop = $("#drop");
$("#pick").onclick = () => $("#file").click();
$("#file").onchange = e => processFiles([...e.target.files]);
["dragover", "dragleave", "drop"].forEach(ev =>
  drop.addEventListener(ev, e => {
    e.preventDefault();
    drop.classList.toggle("over", ev === "dragover");
    if (ev === "drop") processFiles([...e.dataTransfer.files]);
  }));

api("/api/status").then(s => {
  $("#status").textContent = `${s.cards} cards · ocr ${s.ocr === "ready" ? "ready" : "off"}`;
}).catch(() => {});
