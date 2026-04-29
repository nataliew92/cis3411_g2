import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js';

// Use CDN-hosted WASM, don't try local
env.allowLocalModels = false;

const QUERIES = [
  // Toy cars / vehicles
  "a wheel", "a tyre", "a car door", "a windscreen", "a headlight",
  "a steering wheel", "a bumper", "a vehicle window",
  // Dolls & figures
  "a doll's head", "a hat on a doll", "a doll's dress", "a doll's shoe",
  "a doll's hand", "a doll's eye", "a wig", "a bonnet",
  // Doll houses
  "a miniature window", "a miniature door", "a staircase", "a fireplace",
  "a miniature chair", "a miniature table", "a tiny bed",
  // Trains & mechanical
  "a chimney", "a funnel", "a locomotive wheel", "a carriage",
  // Teddy bears & soft toys
  "a button eye", "a stitched nose", "a bow", "a paw",
  // General toy parts
  "a painted face", "a jointed limb", "a pull string", "a key winder"
];

// Map AI cluster names to V&A search keywords
const CLUSTER_QUERIES = {
  'a toy vehicle or mechanical toy': 'vehicle',
  'a doll': 'doll',
  'a soft toy or teddy bear': 'teddy bear',
  'an action figure or toy soldier': 'figure soldier',
  'a puppet or marionette': 'puppet',
  'a game or puzzle': 'game puzzle',
  'a dolls house or miniature room': 'dolls house',
  'doll clothing or doll accessories': 'doll clothing'
};

const CLUSTER_DISPLAY_NAMES = {
  'a toy vehicle or mechanical toy': 'Vehicles',
  'a doll': 'Dolls',
  'a soft toy or teddy bear': 'Soft Toys',
  'an action figure or toy soldier': 'Action Figures',
  'a puppet or marionette': 'Puppets',
  'a game or puzzle': 'Games & Puzzles',
  'a dolls house or miniature room': "Dolls' Houses",
  'doll clothing or doll accessories': 'Doll Accessories'
};

let activeCategory = null;       // The cluster value, e.g. 'a doll'
let activeCategoryQuery = null;  // The V&A search keyword, e.g. 'doll'

const API_BASE   = "https://api.vam.ac.uk/v2/objects/search";
const IMAGE_BASE = "https://framemark.vam.ac.uk/collections";

let detector = null;
let objects  = [], results = {}, current = 0;
let currentPage = 1;
let totalPages  = 1;
let totalCount  = 0;

// ── Threshold slider OLD VERSION ──────────────────────────────────────────────────────
//document.getElementById("threshold").addEventListener("input", e => {
//  document.getElementById("thresholdVal").textContent = Math.round(parseFloat(e.target.value) * 100) + "%";
//});

// ── Threshold slider ──────────────────────────────────────────────────────
const thresholdSlider = document.getElementById("threshold");
const thresholdDisplay = document.getElementById("thresholdVal");
const presetChips = document.querySelectorAll(".chip");

function updateThresholdDisplay() {
  thresholdDisplay.textContent = Math.round(parseFloat(thresholdSlider.value) * 100) + "%";
  const current = parseFloat(thresholdSlider.value).toFixed(2);
  presetChips.forEach(chip => {
    chip.classList.toggle("active", parseFloat(chip.dataset.value).toFixed(2) === current);
  });
}

thresholdSlider.addEventListener("input", updateThresholdDisplay);

presetChips.forEach(chip => {
  chip.addEventListener("click", () => {
    thresholdSlider.value = chip.dataset.value;
    updateThresholdDisplay();
  });
});

// ── Status helpers ────────────────────────────────────────────────────────
function setStatus(msg, loading=false) {
  document.getElementById("status").innerHTML =
    loading ? `<span class="pulse"></span>${msg}` : msg;
}

// ── Load model ────────────────────────────────────────────────────────────
async function loadModel() {
  const banner   = document.getElementById("model-banner");
  const statusEl = document.getElementById("model-status");
  const bar      = document.getElementById("model-progress");

  try {
    detector = await pipeline(
      'zero-shot-object-detection',
      'Xenova/owlvit-base-patch32',
      {
        progress_callback: (p) => {
          if (p.status === 'downloading' || p.status === 'progress') {
            const pct = p.progress ? Math.round(p.progress) : 0;
            bar.style.width = pct + '%';
            statusEl.textContent = `Downloading model… ${pct}%`;
          } else if (p.status === 'loading') {
            bar.style.width = '90%';
            statusEl.textContent = 'Loading model into memory…';
          } else if (p.status === 'ready') {
            bar.style.width = '100%';
          }
        }
      }
    );

    banner.classList.add('ready');
    statusEl.textContent = '✓ OWL-ViT ready — running in your browser';
    bar.style.width = '100%';
    document.getElementById("runBtn").disabled = false;
    setStatus("Model loaded — click Load Collection to begin.");
  } catch(e) {
    statusEl.textContent = `Model failed to load: ${e.message}`;
    banner.style.color = '#e07070';
    setStatus(`Model error: ${e.message}`);
  }
}

// ── Fetch V&A objects ─────────────────────────────────────────────────────
async function fetchObjects(n, page = 1) {
  const params = {
    id_category: "THES48967",
    id_collection: "THES48593",
    images_exist: "1",
    page_size: n,
    page,
    data_restrict: "descriptive_only"
  };
  if (activeCategoryQuery) {
    params.q = activeCategoryQuery;
  }
  const p = new URLSearchParams(params);
  const d = await (await fetch(`${API_BASE}?${p}`)).json();
  totalCount = d.info?.record_count ?? 0;
  totalPages = Math.max(1, Math.ceil(totalCount / n));
  return d.records.filter(r => r._primaryImageId).map(r => ({
    id:          r.systemNumber,
    title:       r._primaryTitle || "Untitled",
    description: r._primaryDescription || "",
    materials:   (r.materialsAndTechniques||[]).map(m=>m.text).join(", ") || "",
    physDesc:    r.physicalDescription || "",
    imageUrl:    `${IMAGE_BASE}/${r._primaryImageId}/full/800,/0/default.jpg`,
    thumbUrl:    `${IMAGE_BASE}/${r._primaryImageId}/full/100,/0/default.jpg`,
  }));
}

// ── Run detection ─────────────────────────────────────────────────────────
async function analyseObject(obj) {
  const threshold = parseFloat(document.getElementById("threshold").value);
  const output = await detector(obj.imageUrl, QUERIES, {
    threshold,
    top_k: 20
  });
  return output.map(d => ({
    label: d.label,
    score: d.score,
    box:   [d.box.xmin, d.box.ymin, d.box.xmax, d.box.ymax]
  }));
}

// ── Build thumbnail strip ─────────────────────────────────────────────────
function buildStrip() {
  const strip = document.getElementById("strip");
  strip.innerHTML = "";
  objects.forEach((obj,i) => {
    const th = document.createElement("div");
    th.className = "strip-thumb" + (i===current?" active":"");
    th.id = `thumb-${i}`;
    th.onclick = () => showDetail(i);
    const img = document.createElement("img");
    img.src = obj.thumbUrl; img.alt = obj.title;
    th.appendChild(img);
    strip.appendChild(th);
  });
  document.getElementById("strip-wrap").style.display = "block";
}

// ── Render detail page ────────────────────────────────────────────────────
function showDetail(index) {
  current = index;
  const obj = objects[index];

  document.querySelectorAll(".strip-thumb").forEach((t,i) => t.classList.toggle("active", i===index));
  const at = document.getElementById(`thumb-${index}`);
  if (at) at.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});

  document.getElementById("prevBtn").disabled = index===0;
  document.getElementById("nextBtn").disabled = index===objects.length-1;

  const detections = results[obj.id] ?? null;

  // Related: other analysed objects sharing detected labels
  let related = [];
  if (detections && detections.length > 0) {
    const myLabels = new Set(detections.map(d=>d.label));
    related = objects
      .map((o,i) => ({o, i}))
      .filter(({o,i}) => i!==index && results[o.id])
      .map(({o}) => ({ obj:o, shared: results[o.id].filter(d=>myLabels.has(d.label)).length }))
      .filter(x=>x.shared>0)
      .sort((a,b)=>b.shared-a.shared)
      .slice(0,6).map(x=>x.obj);
  }

  document.getElementById("main").innerHTML = `
    <div class="detail-grid">
      <div class="left-col">
        <div class="image-wrap" id="imgWrap"><div class="img-skel"></div></div>
        <div class="artefact-meta">
          <h2>${obj.title}</h2>
          <div class="system-num">${obj.id}</div>
          <div class="description">${obj.description || '<em>No description available.</em>'}</div>
        </div>
      </div>

      <div class="right-col">
        <div class="panel">
          <div class="panel-header">AI Identified Objects</div>
          <div class="panel-body">
            <div class="ai-tags">
              ${detections === null
                ? `<span class="empty-note">Analysing…</span>`
                : detections.length === 0
                  ? `<span class="empty-note italic">No objects detected above threshold.</span>`
                  : detections.map(d=>`
                      <div class="ai-tag">
                        ${d.label}
                        <span class="conf-bar"><span class="conf-fill" style="width:${Math.round(d.score*100)}%"></span></span>
                        <span class="conf-num">${(d.score*100).toFixed(0)}%</span>
                      </div>`).join("")
              }
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">Artefacts with the Same Objects</div>
          <div class="panel-body">
            <div class="related-grid">
              ${related.length === 0
                ? `<span class="empty-note italic">${detections===null?"Analysing…":"No related artefacts found yet."}</span>`
                : related.map(r=>`
                    <div class="related-thumb" onclick="window._showDetail(${objects.indexOf(r)})">
                      <img src="${r.thumbUrl}" alt="${r.title}" loading="lazy"/>
                      <div class="rel-label">${r.title}</div>
                    </div>`).join("")
              }
            </div>
          </div>
        </div>
      </div>
    </div>

    <hr class="divider"/>

    <div class="bottom-grid">
      <div class="info-row">
        <div class="info-label">Materials</div>
        <div class="info-content ${obj.materials?'':'empty'}">${obj.materials||'Not recorded.'}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Physical Description</div>
        <div class="info-content ${obj.physDesc?'':'empty'}">${obj.physDesc||'Not recorded.'}</div>
      </div>
    </div>`;

  // Draw image + bounding boxes
  const imgWrap = document.getElementById("imgWrap");
  const canvas  = document.createElement("canvas");
  const ctx     = canvas.getContext("2d");
  const img     = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    imgWrap.innerHTML = "";
    canvas.width = img.width; canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    if (detections) {
      detections.forEach((det,i) => {
        const [x1,y1,x2,y2] = det.box;
        const col = `hsl(${(i*53)%360},65%,58%)`;
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(2, img.width/280);
        ctx.strokeRect(x1, y1, x2-x1, y2-y1);
        const fs = Math.max(12, img.width/45);
        ctx.font = `600 ${fs}px Lato, sans-serif`;
        const lbl = `${det.label}  ${(det.score*100).toFixed(0)}%`;
        const tw  = ctx.measureText(lbl).width;
        ctx.fillStyle = col; ctx.globalAlpha = 0.88;
        ctx.fillRect(x1, y1-fs-6, tw+12, fs+8);
        ctx.globalAlpha = 1; ctx.fillStyle = "#0e0c0a";
        ctx.fillText(lbl, x1+6, y1-5);
      });
    }
    imgWrap.appendChild(canvas);
  };
  img.onerror = () => {
    imgWrap.innerHTML = `<div class="image-error">Image unavailable</div>`;
  };
  img.src = obj.imageUrl;
}

// Expose to onclick handlers in injected HTML
window._showDetail = showDetail;

function navigate(dir) {
  const n = current + dir;
  if (n >= 0 && n < objects.length) showDetail(n);
}
window.navigate = navigate;

// ── Single-artefact deep link (from index.html) ───────────────────────────

// Try to fetch full V&A metadata (description, materials, physDesc) for a
// single object using its system number. Returns null if not found.
async function fetchSingleArtefactDetails(systemNumber) {
  const p = new URLSearchParams({ q: systemNumber, page_size: 5 });
  try {
    const d = await (await fetch(`${API_BASE}?${p}`)).json();
    const rec = (d.records || []).find(r => r.systemNumber === systemNumber);
    if (!rec) return null;
    return {
      description: rec._primaryDescription || '',
      materials:   (rec.materialsAndTechniques || []).map(m => m.text).join(", ") || '',
      physDesc:    rec.physicalDescription || '',
    };
  } catch (e) {
    return null;
  }
}

// If the URL has ?id=...&img=...&title=..., load that artefact directly
// instead of waiting for the user to click Load Collection.
async function loadFromURL() {
  const params  = new URLSearchParams(window.location.search);
  const id      = params.get('id');
  const imageId = params.get('img');
  const title   = params.get('title') || 'Untitled';

  if (!id || !imageId) return false;  // No deep link present

  // Reveal the back link since we arrived from the homepage
  document.getElementById("back-to-collection").hidden = false;

  const cluster = params.get('cluster') || '';
  if (cluster && CLUSTER_QUERIES[cluster]) {
  activeCategory      = cluster;
  activeCategoryQuery = CLUSTER_QUERIES[cluster];
  }

  // Build the focused artefact from URL params
  const focused = {
    id,
    title,
    description: '',
    materials: '',
    physDesc: '',
    imageUrl: `${IMAGE_BASE}/${imageId}/full/800,/0/default.jpg`,
    thumbUrl: `${IMAGE_BASE}/${imageId}/full/100,/0/default.jpg`,
  };

  setStatus(`Loading ${title} and surrounding artefacts…`, true);

  // Load page 1 of the collection alongside the focused artefact
  const n = parseInt(document.getElementById("pageSize").value) || 8;
  let batch = [];
  try {
    batch = await fetchObjects(n, 1);
  } catch (e) {
    batch = [];  // Fall back to focused-only if collection fetch fails
  }

  // If the clicked artefact is already on page 1, just focus on it.
  // Otherwise, prepend it so the user sees it first plus surrounding context.
  const existingIndex = batch.findIndex(o => o.id === id);
  if (existingIndex >= 0) {
    objects = batch;
    current = existingIndex;
  } else {
    objects = [focused, ...batch];
    current = 0;
  }

  results = {};
  currentPage = 1;

  buildStrip();
  showDetail(current);
  updatePageIndicator();  // Enables Next Set button if more pages exist

  // Fetch full V&A metadata for the focused artefact in the background
  fetchSingleArtefactDetails(id).then(details => {
    if (details && objects[current]?.id === id) {
      Object.assign(objects[current], details);
      showDetail(current);
    }
  });

  // Run AI detection on all objects in the batch
  if (!detector) {
    setStatus(`Loaded ${objects.length} artefacts — model not ready, detection skipped.`);
    return true;
  }

  setStatus(`Loaded ${objects.length} artefacts — running AI detection…`, true);
  let done = 0;
  for (const obj of objects) {
    try {
      results[obj.id] = await analyseObject(obj);
    } catch (e) {
      results[obj.id] = [];
    }
    done++;
    setStatus(`Analysed ${done} / ${objects.length}…`, done < objects.length);
    if (objects[current]?.id === obj.id) showDetail(current);
  }

  setStatus(`Done — ${objects.length} artefacts analysed (set ${currentPage} of ${totalPages}).`);
  document.getElementById("reanalyseBtn").disabled = false;
  updateCategoryButtons();
  return true;
}

// ── Main run ──────────────────────────────────────────────────────────────
async function run() {
  if (!detector) { setStatus("Model not loaded yet."); return; }
  const btn = document.getElementById("runBtn");
  const n   = parseInt(document.getElementById("pageSize").value) || 12;
  btn.disabled = true; results = {}; objects = [];
  document.getElementById("prevBtn").disabled = true;
  document.getElementById("nextBtn").disabled = true;
  document.getElementById("prevSetBtn").disabled = true;
  document.getElementById("nextSetBtn").disabled = true;
  document.getElementById("strip-wrap").style.display = "none";
  document.getElementById("main").innerHTML = `<div class="placeholder-msg"><div class="big loading">Fetching…</div></div>`;

  setStatus("Fetching V&A collection…", true);
  try { objects = await fetchObjects(n, currentPage); }
  catch(e) { setStatus(`Failed: ${e.message}`); btn.disabled=false; return; }

  if (!objects.length) { setStatus("No objects found."); btn.disabled=false; return; }

  buildStrip();
  showDetail(0);
  setStatus(`Loaded ${objects.length} objects — running AI detection in browser…`, true);

  let done = 0;
  for (const obj of objects) {
    try {
      results[obj.id] = await analyseObject(obj);
    } catch(e) {
      results[obj.id] = [];
    }
    done++;
    setStatus(`Analysed ${done} / ${objects.length}…`, done < objects.length);
    if (objects[current]?.id === obj.id) showDetail(current);
  }

  setStatus(`Done — ${objects.length} artefacts analysed (set ${currentPage} of ${totalPages}).`);
  btn.disabled = false;
  document.getElementById("reanalyseBtn").disabled = false;
  updatePageIndicator();
  updateCategoryButtons();
}
window.run = run;

function updatePageIndicator() {
  const el = document.getElementById("pageIndicator");
  let text = `Set ${currentPage} of ${totalPages} (${totalCount.toLocaleString()} total)`;
  if (activeCategory && CLUSTER_DISPLAY_NAMES[activeCategory]) {
    text += ` — ${CLUSTER_DISPLAY_NAMES[activeCategory]}`;
  }
  el.textContent = text;
  document.getElementById("prevSetBtn").disabled = currentPage <= 1;
  document.getElementById("nextSetBtn").disabled = currentPage >= totalPages;
}

// Re-run AI detection on the currently loaded objects with the latest threshold
async function reanalyse() {
  if (!detector) { setStatus("Model not loaded yet."); return; }
  if (!objects.length) { setStatus("Nothing loaded — click Load Collection first."); return; }

  const reBtn = document.getElementById("reanalyseBtn");
  reBtn.disabled = true;
  document.getElementById("runBtn").disabled = true;
  document.getElementById("prevSetBtn").disabled = true;
  document.getElementById("nextSetBtn").disabled = true;

  // Clear existing detection results so the UI shows "Analysing…" again
  results = {};
  showDetail(current);

  const threshold = parseFloat(document.getElementById("threshold").value);
  setStatus(`Re-analysing ${objects.length} artefacts at ${Math.round(threshold * 100)}% confidence…`, true);

  let done = 0;
  for (const obj of objects) {
    try { results[obj.id] = await analyseObject(obj); }
    catch (e) { results[obj.id] = []; }
    done++;
    setStatus(`Re-analysed ${done} / ${objects.length}…`, done < objects.length);
    if (objects[current]?.id === obj.id) showDetail(current);
  }

  setStatus(`Done — re-analysed ${objects.length} artefacts at ${Math.round(threshold * 100)}% threshold.`);
  reBtn.disabled = false;
  document.getElementById("runBtn").disabled = false;
  updatePageIndicator();  // Re-enables prev/next set buttons appropriately
}
window.reanalyse = reanalyse;

function loadFirstSet() {
  currentPage = 1;
  run();
}
window.loadFirstSet = loadFirstSet;

function changeSet(dir) {
  const next = currentPage + dir;
  if (next < 1 || next > totalPages) return;
  currentPage = next;
  run();
}
window.changeSet = changeSet;

// ── Category browsing ────────────────────────────────────────────────────

// Highlight the currently active category button
function updateCategoryButtons() {
  document.querySelectorAll(".cat-btn").forEach(btn => {
    const isActive = (btn.dataset.cluster || null) === (activeCategory || null);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

// Switch to a different category and reload from page 1
async function selectCategory(cluster) {
  // Empty cluster = "All" (clear the filter)
  if (!cluster) {
    activeCategory = null;
    activeCategoryQuery = null;
  } else if (CLUSTER_QUERIES[cluster]) {
    activeCategory = cluster;
    activeCategoryQuery = CLUSTER_QUERIES[cluster];
  } else {
    return;  // Unknown cluster — ignore
  }

  updateCategoryButtons();
  currentPage = 1;
  await run();  // Reuses your existing fetch + analyse pipeline
}
window.selectCategory = selectCategory;

// Wire up the click handlers (runs once at page load)
document.querySelectorAll(".cat-btn").forEach(btn => {
  btn.addEventListener("click", () => selectCategory(btn.dataset.cluster || ""));
});

// AI notice dismiss
document.getElementById("ai-notice-dismiss")?.addEventListener("click", () => {
  document.getElementById("ai-notice").hidden = true;
});

// Start loading model, then check for a deep link from index.html
(async () => {
  await loadModel();
  await loadFromURL();
})();