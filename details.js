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

const API_BASE   = "https://api.vam.ac.uk/v2/objects/search";
const IMAGE_BASE = "https://framemark.vam.ac.uk/collections";

let detector = null;
let objects  = [], results = {}, current = 0;

// ── Threshold slider ──────────────────────────────────────────────────────
document.getElementById("threshold").addEventListener("input", e => {
  document.getElementById("thresholdVal").textContent = parseFloat(e.target.value).toFixed(2);
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
async function fetchObjects(n) {
  const p = new URLSearchParams({
    id_category:"THES48967", id_collection:"THES48593",
    images_exist:"1", page_size:n, data_restrict:"descriptive_only"
  });
  const d = await (await fetch(`${API_BASE}?${p}`)).json();
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
          <div class="description">${obj.description || '<em style="color:var(--muted)">No description available.</em>'}</div>
        </div>
      </div>

      <div class="right-col">
        <div class="panel">
          <div class="panel-header">AI Identified Objects</div>
          <div class="panel-body">
            <div class="ai-tags">
              ${detections === null
                ? `<span style="font-family:'Lato';font-size:0.7rem;color:var(--muted)">Analysing…</span>`
                : detections.length === 0
                  ? `<span style="font-family:'Lato';font-size:0.7rem;color:var(--muted);font-style:italic">No objects detected above threshold.</span>`
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
                ? `<span style="font-family:'Lato';font-size:0.7rem;color:var(--muted);grid-column:1/-1;font-style:italic">${detections===null?"Analysing…":"No related artefacts found yet."}</span>`
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
    imgWrap.innerHTML = `<div style="color:var(--cream);font-size:0.8rem;padding:40px;font-family:'Lato'">Image unavailable</div>`;
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

// ── Main run ──────────────────────────────────────────────────────────────
async function run() {
  if (!detector) { setStatus("Model not loaded yet."); return; }
  const btn = document.getElementById("runBtn");
  const n   = parseInt(document.getElementById("pageSize").value) || 12;
  btn.disabled = true; results = {}; objects = [];
  document.getElementById("prevBtn").disabled = true;
  document.getElementById("nextBtn").disabled = true;
  document.getElementById("strip-wrap").style.display = "none";
  document.getElementById("main").innerHTML = `<div class="placeholder-msg"><div class="big" style="font-size:1.4rem">Fetching…</div></div>`;

  setStatus("Fetching V&A collection…", true);
  try { objects = await fetchObjects(n); }
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

  setStatus(`Done — ${objects.length} artefacts analysed.`);
  btn.disabled = false;
}
window.run = run;

// Start loading model immediately
loadModel();
