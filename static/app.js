const $ = (s) => document.querySelector(s);
const ic = (n, cls = "") =>
  `<svg class="ic ${cls}" aria-hidden="true"><use href="/static/icons.svg#${n}"/></svg>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const state = { data: null, imgUrl: null, boxes: true, objectUrl: null };

// ---------------------------------------------------------------- startup
async function init() {
  try {
    const h = await (await fetch("/api/health")).json();
    $("#engine").innerHTML = h.llm_enabled
      ? `<span class="dot"></span>${esc(h.model)} on Groq`
      : `<span class="dot off"></span>Rules mode, no API key`;
  } catch { $("#engine").textContent = "API offline"; }

  const samples = await (await fetch("/api/samples")).json();
  $("#samples").innerHTML = samples
    .map((s) => `<button class="thumb" title="${esc(s.name)}" data-name="${esc(s.name)}" data-url="${esc(s.url)}"><img src="${esc(s.url)}" alt="Sample ${esc(s.name)}"></button>`)
    .join("");
  document.querySelectorAll(".thumb").forEach((b) =>
    b.addEventListener("click", () => {
      markSample(b);
      run(`/api/extract/sample/${b.dataset.name}`, { method: "POST" }, b.dataset.url);
    }));
}

function markSample(el) {
  document.querySelectorAll(".thumb").forEach((t) => t.classList.toggle("active", t === el));
}

// ---------------------------------------------------------------- upload
const drop = $("#drop"), fileInput = $("#file");
drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
fileInput.addEventListener("change", () => fileInput.files[0] && upload(fileInput.files[0]));
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => e.dataTransfer.files[0] && upload(e.dataTransfer.files[0]));
document.addEventListener("paste", (e) => {
  const f = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
  if (f) upload(f);
});

function upload(file) {
  markSample(null);
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);
  const fd = new FormData();
  fd.append("file", file);
  run("/api/extract", { method: "POST", body: fd }, state.objectUrl);
}

// ---------------------------------------------------------------- run
async function run(url, opts, imgUrl) {
  state.data = null;
  state.imgUrl = imgUrl;
  show({ loading: true });
  renderViewer(null);
  try {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Request failed (${res.status})`);
    }
    state.data = await res.json();
    renderAll();
  } catch (err) {
    $("#error").innerHTML = `${ic("triangle-alert")}<span>${esc(err.message)}</span>`;
    show({ error: true });
    renderViewer(null, true);
  }
}

function show({ loading, error, results } = {}) {
  $("#empty").classList.add("hidden");
  $("#loading").classList.toggle("hidden", !loading);
  $("#error").classList.toggle("hidden", !error);
  $("#results").classList.toggle("hidden", !results);
}

// ---------------------------------------------------------------- render
function renderAll() {
  const d = state.data;
  show({ results: true });
  $("#notice").classList.toggle("hidden", !d.notice);
  $("#notice").innerHTML = d.notice ? `${ic("info")}<span>${esc(d.notice)}</span>` : "";
  renderStats(d);
  renderFields(d);
  renderText(d);
  renderJson(d);
  renderViewer(d);
}

function renderStats(d) {
  const s = d.stats;
  const tok = d.usage ? d.usage.prompt_tokens + d.usage.completion_tokens : null;
  const items = [
    ["text", "Text lines", s.lines, ""],
    ["gauge", "OCR confidence", Math.round(s.avg_ocr_confidence * 100), "%"],
    ["timer", "OCR time", (s.ocr_ms / 1000).toFixed(1), "s"],
    [d.mode === "llm" ? "cpu" : "code-xml", d.mode === "llm" ? "LLM time" : "Rules time",
      d.mode === "llm" ? (s.extract_ms / 1000).toFixed(1) : s.extract_ms, d.mode === "llm" ? "s" : "ms"],
  ];
  $("#stats").innerHTML = items
    .map(([i, k, v, u]) => `<div class="stat"><div class="k">${ic(i)}${k}</div><div class="v">${v}<small>${u}</small></div></div>`)
    .join("");
  $("#stats").title = tok ? `${tok} tokens used` : "";
}

function badge(f) {
  return f.status === "verified"
    ? `<span class="badge ok" title="Supported by the cited OCR text (${Math.round(f.support * 100)}% of words found)">${ic("circle-check")}Verified</span>`
    : `<span class="badge review" title="Value not clearly supported by the cited OCR text">${ic("triangle-alert")}Review</span>`;
}

function srcText(f, d) {
  const t = f.lines.map((i) => d.lines[i]?.text).filter(Boolean).join(" / ");
  return t && t.toLowerCase().replace(/\W/g, "") !== f.value.toLowerCase().replace(/\W/g, "")
    ? `<span class="src">Read as: ${esc(t)}</span>` : "";
}

function fieldRow(f, d) {
  if (f.status === "missing") {
    return `<div class="row missing">${ic(f.icon)}<div class="label">${f.label}</div><div class="value-wrap"><div class="value">Not found on label</div></div><span></span></div>`;
  }
  return `<div class="row" data-lines="${f.lines.join(",")}" tabindex="0">${ic(f.icon)}<div class="label">${f.label}</div>
    <div class="value-wrap"><div class="value">${esc(f.value)}</div>${srcText(f, d)}</div><div class="badge-wrap">${badge(f)}</div></div>`;
}

function renderFields(d) {
  const found = d.fields.filter((f) => f.status !== "missing");
  const missing = d.fields.filter((f) => f.status === "missing");
  let html = found.map((f) => fieldRow(f, d)).join("");
  if (d.warnings.length) {
    html += `<div class="sect">${ic("triangle-alert")}Label warnings</div>` +
      d.warnings.map((w) => `<div class="warn-item" data-lines="${w.lines.join(",")}"><span>${esc(w.value)}</span>${badge(w)}</div>`).join("");
  }
  if (missing.length) {
    html += `<div class="sect muted">${ic("circle-alert")}Not found (${missing.length})</div>` + missing.map((f) => fieldRow(f, d)).join("");
  }
  $("#panel-fields").innerHTML = html || `<p class="muted" style="padding:20px">No fields could be extracted.</p>`;
  bindHover("#panel-fields [data-lines]");
}

function renderText(d) {
  $("#panel-text").innerHTML = d.lines
    .map((l) => `<div class="line" data-lines="${l.id}"><span class="id">${l.id}</span><span>${esc(l.text)}</span><span class="sc">${Math.round(l.score * 100)}%</span>
      <div class="bar"><i style="width:${l.score * 100}%"></i></div></div>`).join("");
  bindHover("#panel-text .line");
}

function exportObject(d) {
  const out = { extraction_mode: d.mode, model: d.model, fields: {}, warnings: d.warnings.map((w) => w.value) };
  d.fields.forEach((f) => {
    out.fields[f.key] = f.value === null ? null : { value: f.value, status: f.status, ocr_confidence: f.confidence };
  });
  out.stats = d.stats;
  return out;
}
function renderJson(d) {
  $("#panel-json").innerHTML = `<pre class="json">${esc(JSON.stringify(exportObject(d), null, 2))}</pre>`;
}

// ---------------------------------------------------------------- viewer + highlighting
function renderViewer(d, failed) {
  const v = $("#viewer");
  if (!state.imgUrl) { v.classList.add("hidden"); return; }
  v.classList.remove("hidden");
  const stage = $("#stage");
  const w = d?.image.width, h = d?.image.height;
  const polys = d ? d.lines.map((l) =>
    `<polygon class="box" data-id="${l.id}" points="${l.box.map((p) => p.join(",")).join(" ")}"><title>${esc(l.text)}</title></polygon>`).join("") : "";
  stage.className = "stage" + (d || failed ? "" : " scanning") + (state.boxes ? "" : " hide-boxes");
  stage.innerHTML = `<img src="${esc(state.imgUrl)}" alt="Uploaded label">` + (d ? `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${polys}</svg>` : "");
  $("#viewer-meta").textContent = d ? `${w} x ${h} px, ${d.lines.length} regions` : failed ? "" : "Scanning";
  stage.querySelectorAll(".box").forEach((b) => {
    b.addEventListener("mouseenter", () => highlight([+b.dataset.id], true));
    b.addEventListener("mouseleave", () => highlight([], false));
  });
}

function highlight(ids, on) {
  const set = new Set(ids);
  document.querySelectorAll(".box").forEach((b) => {
    b.classList.toggle("on", on && set.has(+b.dataset.id));
    b.classList.toggle("dim", on && !set.has(+b.dataset.id));
  });
  document.querySelectorAll("[data-lines]").forEach((el) => {
    const mine = el.dataset.lines ? el.dataset.lines.split(",").map(Number) : [];
    el.classList.toggle("on", on && mine.length > 0 && mine.every((i) => set.has(i)));
  });
}

function bindHover(sel) {
  document.querySelectorAll(sel).forEach((el) => {
    const ids = el.dataset.lines ? el.dataset.lines.split(",").map(Number) : [];
    const on = () => ids.length && highlight(ids, true);
    const off = () => highlight([], false);
    el.addEventListener("mouseenter", on);
    el.addEventListener("mouseleave", off);
    el.addEventListener("focus", on);
    el.addEventListener("blur", off);
  });
}

$("#toggle-boxes").addEventListener("click", (e) => {
  state.boxes = !state.boxes;
  const b = e.currentTarget;
  b.setAttribute("aria-pressed", state.boxes);
  b.querySelector("use").setAttribute("href", `/static/icons.svg#${state.boxes ? "eye" : "eye-off"}`);
  $("#stage").classList.toggle("hide-boxes", !state.boxes);
});

// ---------------------------------------------------------------- tabs + export
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    ["fields", "text", "json"].forEach((n) => $(`#panel-${n}`).classList.toggle("hidden", n !== t.dataset.tab));
    highlight([], false);
  }));

$("#copy").addEventListener("click", async () => {
  if (!state.data) return;
  await navigator.clipboard.writeText(JSON.stringify(exportObject(state.data), null, 2));
  const s = $("#copy span");
  s.textContent = "Copied";
  setTimeout(() => (s.textContent = "Copy JSON"), 1400);
});
$("#download").addEventListener("click", () => {
  if (!state.data) return;
  const blob = new Blob([JSON.stringify(exportObject(state.data), null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "drug-label.json" });
  a.click();
  URL.revokeObjectURL(a.href);
});

init();
