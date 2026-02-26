// ======================================================================== //
// importdanych.js – PEŁNY, KONVA.JS – GLOBALNY CLIPBOARD + JEDNORAZOWE WKLEJANIE + PEŁNE DRAG & DROP + MENU WARSTW + USUWANIE STRON + CANVA-STYLE EDYTOR
// ======================================================================== //
const RMBG_MODEL_URL =
  "https://firebasestorage.googleapis.com/v0/b/pdf-creator-f7a8b.firebasestorage.app/o/modul%2Fmodel_fp16.onnx?alt=media";
const RMBG_PIPELINE_VERSION = "rmbg-v4";

let rmbgSession = null;
const RMBG_CACHE_LIMIT = 120;
const rmbgResultCache = new Map();
const rmbgInflight = new Map();
const rmbgQueue = [];
let rmbgQueueRunning = false;
let rmbgQueueActiveTask = null;

async function getU2NetSession() {
    if (rmbgSession) return rmbgSession;

    rmbgSession = await ort.InferenceSession.create(
        RMBG_MODEL_URL,
        {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        }
    );

    return rmbgSession;
}

function getRmbgStatusHost() {
    let el = document.getElementById("rmbgQueueStatus");
    if (el) return el;
    el = document.createElement("div");
    el.id = "rmbgQueueStatus";
    el.style.cssText = [
        "position:fixed",
        "right:14px",
        "bottom:14px",
        "z-index:1000003",
        "background:rgba(15,23,42,.92)",
        "color:#fff",
        "padding:8px 10px",
        "border-radius:10px",
        "font:600 12px/1.25 Arial,sans-serif",
        "box-shadow:0 10px 22px rgba(0,0,0,.20)",
        "display:none",
        "max-width:280px"
    ].join(";");
    document.body.appendChild(el);
    return el;
}

function updateRmbgStatusUI(state = {}) {
    const el = getRmbgStatusHost();
    const pending = Number.isFinite(state.pending) ? state.pending : rmbgQueue.length;
    const active = state.activeTask || rmbgQueueActiveTask;
    const running = !!active;
    if (!running && pending <= 0) {
        el.style.display = "none";
        return;
    }
    const phase = String(state.phase || (running ? "processing" : "queued"));
    const label = phase === "queued"
        ? "Usuwanie tła: kolejka"
        : (phase === "done" ? "Usuwanie tła: gotowe" : "Usuwanie tła: przetwarzanie");
    el.style.display = "block";
    el.innerHTML = `
      <div style="font-weight:800;margin-bottom:3px;">${label}</div>
      <div style="opacity:.92;">W toku: ${running ? 1 : 0} • W kolejce: ${pending}</div>
    `;
}

function getRmbgCache(key) {
    if (!rmbgResultCache.has(key)) return null;
    const val = rmbgResultCache.get(key);
    // LRU refresh
    rmbgResultCache.delete(key);
    rmbgResultCache.set(key, val);
    return val;
}

function setRmbgCache(key, value) {
    rmbgResultCache.set(key, value);
    while (rmbgResultCache.size > RMBG_CACHE_LIMIT) {
        const oldestKey = rmbgResultCache.keys().next().value;
        rmbgResultCache.delete(oldestKey);
    }
}

function createWorkCanvas(width, height) {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
}

function imageFromSrc(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function sampleMaskBilinear(mask, size, x, y) {
    const x0 = Math.max(0, Math.min(size - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(size - 1, Math.floor(y)));
    const x1 = Math.max(0, Math.min(size - 1, x0 + 1));
    const y1 = Math.max(0, Math.min(size - 1, y0 + 1));
    const tx = Math.max(0, Math.min(1, x - x0));
    const ty = Math.max(0, Math.min(1, y - y0));
    const a = mask[y0 * size + x0] || 0;
    const b = mask[y0 * size + x1] || 0;
    const c = mask[y1 * size + x0] || 0;
    const d = mask[y1 * size + x1] || 0;
    const top = a + (b - a) * tx;
    const bottom = c + (d - c) * tx;
    return top + (bottom - top) * ty;
}

function smoothMaskAt(mask, size, x, y) {
    let sum = 0;
    let wsum = 0;
    for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
            const w = (ox === 0 && oy === 0) ? 4 : ((ox === 0 || oy === 0) ? 2 : 1);
            sum += sampleMaskBilinear(mask, size, x + ox * 0.6, y + oy * 0.6) * w;
            wsum += w;
        }
    }
    return wsum ? (sum / wsum) : 0;
}

function clamp255(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
}

function autoCropCanvasTransparency(srcCanvas, alphaThreshold = 10, pad = 2) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const ctx = srcCanvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, w, h);
    const px = imgData.data;

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const a = px[(y * w + x) * 4 + 3];
            if (a > alphaThreshold) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0 || maxY < 0) return srcCanvas; // nic nie znaleziono

    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad);
    maxY = Math.min(h - 1, maxY + pad);
    const cw = Math.max(1, maxX - minX + 1);
    const ch = Math.max(1, maxY - minY + 1);

    if (cw === w && ch === h) return srcCanvas;

    const out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    out.getContext("2d").drawImage(srcCanvas, minX, minY, cw, ch, 0, 0, cw, ch);
    return out;
}

function detectForegroundBoxByBorderColor(img, opts = {}) {
    const w = img.width;
    const h = img.height;
    if (!w || !h) return { x: 0, y: 0, w, h };

    const scanCanvas = document.createElement("canvas");
    scanCanvas.width = w;
    scanCanvas.height = h;
    const sctx = scanCanvas.getContext("2d");
    sctx.drawImage(img, 0, 0);
    const px = sctx.getImageData(0, 0, w, h).data;

    const borderStep = Math.max(1, Math.floor(Math.min(w, h) / 120));
    let sr = 0, sg = 0, sb = 0, count = 0;
    const addPixel = (x, y) => {
        const i = (y * w + x) * 4;
        sr += px[i];
        sg += px[i + 1];
        sb += px[i + 2];
        count += 1;
    };
    for (let x = 0; x < w; x += borderStep) {
        addPixel(x, 0);
        addPixel(x, h - 1);
    }
    for (let y = borderStep; y < h - 1; y += borderStep) {
        addPixel(0, y);
        addPixel(w - 1, y);
    }
    if (!count) return { x: 0, y: 0, w, h };
    const br = sr / count;
    const bg = sg / count;
    const bb = sb / count;

    const diffThreshold = Number.isFinite(opts.diffThreshold) ? opts.diffThreshold : 28;
    const rowHitRatio = Number.isFinite(opts.rowHitRatio) ? opts.rowHitRatio : 0.006;
    const colHitRatio = Number.isFinite(opts.colHitRatio) ? opts.colHitRatio : 0.006;

    const isFg = (x, y) => {
        const i = (y * w + x) * 4;
        const r = px[i], g = px[i + 1], b = px[i + 2];
        const d = Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb);
        return d >= diffThreshold;
    };

    let minX = w, minY = h, maxX = -1, maxY = -1;
    const rowStep = Math.max(1, Math.floor(h / 220));
    const colStep = Math.max(1, Math.floor(w / 220));

    for (let y = 0; y < h; y += rowStep) {
        let hits = 0;
        for (let x = 0; x < w; x += colStep) {
            if (isFg(x, y)) hits++;
        }
        if (hits / Math.ceil(w / colStep) >= rowHitRatio) {
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    }
    for (let x = 0; x < w; x += colStep) {
        let hits = 0;
        for (let y = 0; y < h; y += rowStep) {
            if (isFg(x, y)) hits++;
        }
        if (hits / Math.ceil(h / rowStep) >= colHitRatio) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
        }
    }

    if (maxX < 0 || maxY < 0 || minX >= maxX || minY >= maxY) {
        return { x: 0, y: 0, w, h };
    }

    const padX = Math.round(w * 0.04);
    const padY = Math.round(h * 0.04);
    minX = Math.max(0, minX - padX);
    minY = Math.max(0, minY - padY);
    maxX = Math.min(w - 1, maxX + padX);
    maxY = Math.min(h - 1, maxY + padY);

    const boxW = Math.max(1, maxX - minX + 1);
    const boxH = Math.max(1, maxY - minY + 1);
    const areaRatio = (boxW * boxH) / (w * h);
    if (areaRatio > 0.92) return { x: 0, y: 0, w, h }; // praktycznie całe zdjęcie

    return { x: minX, y: minY, w: boxW, h: boxH };
}

function cleanupEdgeFrameArtifacts(pixels, w, h) {
    if (!pixels || !w || !h) return;
    const visited = new Uint8Array(w * h);
    const qx = new Int32Array(w * h);
    const qy = new Int32Array(w * h);
    let head = 0;
    let tail = 0;

    const isRemovableBgPixel = (x, y) => {
        const i = (y * w + x) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        if (a === 0) return true;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const chroma = maxC - minC;
        const avg = (r + g + b) / 3;
        // Krawędziowe artefakty po masce: zwykle jasne/szare i półprzezroczyste.
        if (a <= 210 && avg >= 95 && chroma <= 70) return true;
        if (avg >= 222 && chroma <= 26) return true;
        if (a <= 140) return true;
        return false;
    };

    const push = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const idx = y * w + x;
        if (visited[idx]) return;
        visited[idx] = 1;
        qx[tail] = x;
        qy[tail] = y;
        tail += 1;
    };

    for (let x = 0; x < w; x++) {
        push(x, 0);
        push(x, h - 1);
    }
    for (let y = 1; y < h - 1; y++) {
        push(0, y);
        push(w - 1, y);
    }

    while (head < tail) {
        const x = qx[head];
        const y = qy[head];
        head += 1;

        if (!isRemovableBgPixel(x, y)) continue;

        const i = (y * w + x) * 4;
        pixels[i + 3] = 0;

        push(x + 1, y);
        push(x - 1, y);
        push(x, y + 1);
        push(x, y - 1);
    }
}

function estimateAlphaCoverage(pixels) {
    if (!pixels || !pixels.length) return 1;
    let opaque = 0;
    let nonZero = 0;
    const total = pixels.length / 4;
    for (let i = 0; i < pixels.length; i += 4) {
        const a = pixels[i + 3];
        if (a > 0) nonZero++;
        if (a >= 245) opaque++;
    }
    return {
        nonZeroRatio: total ? (nonZero / total) : 1,
        opaqueRatio: total ? (opaque / total) : 1
    };
}

function fallbackRemoveUniformBackground(outData, opts = {}) {
    const px = outData?.data;
    const w = outData?.width;
    const h = outData?.height;
    if (!px || !w || !h) return false;

    let sr = 0, sg = 0, sb = 0, count = 0;
    const step = Math.max(1, Math.floor(Math.min(w, h) / 100));
    const add = (x, y) => {
        const i = (y * w + x) * 4;
        sr += px[i];
        sg += px[i + 1];
        sb += px[i + 2];
        count++;
    };
    for (let x = 0; x < w; x += step) { add(x, 0); add(x, h - 1); }
    for (let y = step; y < h - 1; y += step) { add(0, y); add(w - 1, y); }
    if (!count) return false;

    const br = sr / count, bg = sg / count, bb = sb / count;
    const diffThreshold = Number.isFinite(opts.diffThreshold) ? opts.diffThreshold : 34;
    const alphaSoftMin = Number.isFinite(opts.alphaSoftMin) ? opts.alphaSoftMin : 8;
    const alphaSoftMax = Number.isFinite(opts.alphaSoftMax) ? opts.alphaSoftMax : 38;

    const visited = new Uint8Array(w * h);
    const qx = new Int32Array(w * h);
    const qy = new Int32Array(w * h);
    let head = 0, tail = 0;
    const push = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const id = y * w + x;
        if (visited[id]) return;
        visited[id] = 1;
        qx[tail] = x;
        qy[tail] = y;
        tail++;
    };
    const colorDiff = (x, y) => {
        const i = (y * w + x) * 4;
        return Math.abs(px[i] - br) + Math.abs(px[i + 1] - bg) + Math.abs(px[i + 2] - bb);
    };
    const isBgLike = (x, y) => colorDiff(x, y) <= diffThreshold;

    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 1; y < h - 1; y++) { push(0, y); push(w - 1, y); }

    let removed = 0;
    while (head < tail) {
        const x = qx[head];
        const y = qy[head];
        head++;
        if (!isBgLike(x, y)) continue;
        const i = (y * w + x) * 4;
        if (px[i + 3] !== 0) {
            px[i + 3] = 0;
            removed++;
        }
        push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }

    // Soft edge near subject border to avoid hard jagged cut.
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const i = (y * w + x) * 4;
            if (px[i + 3] === 0) continue;
            const d = colorDiff(x, y);
            if (d <= diffThreshold) {
                px[i + 3] = 0;
                removed++;
                continue;
            }
            const dd = d - diffThreshold;
            if (dd <= alphaSoftMax) {
                const t = Math.max(0, Math.min(1, (dd - alphaSoftMin) / Math.max(1, (alphaSoftMax - alphaSoftMin))));
                px[i + 3] = clamp255(px[i + 3] * t);
            }
        }
    }

    return removed > (w * h * 0.03);
}

async function processRemoveBackgroundCore(imgData, options = {}) {
    const session = await getU2NetSession();
    const img = await imageFromSrc(imgData);
    if (img.decode) { try { await img.decode(); } catch (_e) {} }

    const SIZE = Number.isFinite(options.modelSize) ? Number(options.modelSize) : 1024;
    const smoothStrength = Number.isFinite(options.smoothStrength) ? Number(options.smoothStrength) : 1;
    const alphaThreshold = Number.isFinite(options.alphaThreshold) ? Number(options.alphaThreshold) : 14;
    const featherGamma = Number.isFinite(options.featherGamma) ? Number(options.featherGamma) : 0.95;
    const defringeStrength = Number.isFinite(options.defringeStrength) ? Number(options.defringeStrength) : 0.35;
    const cropPad = Number.isFinite(options.cropPad) ? Number(options.cropPad) : 2;

    const fgBox = detectForegroundBoxByBorderColor(img, {
        diffThreshold: Number.isFinite(options.preCropDiffThreshold) ? options.preCropDiffThreshold : 24
    });
    const srcX = fgBox.x;
    const srcY = fgBox.y;
    const srcW = fgBox.w;
    const srcH = fgBox.h;

    const canvas = createWorkCanvas(SIZE, SIZE);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, SIZE, SIZE);

    const input = new Float32Array(SIZE * SIZE * 3);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
    for (let i = 0; i < SIZE * SIZE; i++) {
        input[i] = data[i * 4] / 255;
        input[i + SIZE * SIZE] = data[i * 4 + 1] / 255;
        input[i + 2 * SIZE * SIZE] = data[i * 4 + 2] / 255;
    }

    const tensor = new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]);
    const inputName = session.inputNames[0];
    const result = await session.run({ [inputName]: tensor });
    const mask = result[session.outputNames[0]].data;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = img.width;
    outCanvas.height = img.height;
    const outCtx = outCanvas.getContext("2d");
    outCtx.drawImage(img, 0, 0);
    const outData = outCtx.getImageData(0, 0, img.width, img.height);
    const outPixels = outData.data;

    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            let nx;
            let ny;
            if (x < srcX || y < srcY || x >= (srcX + srcW) || y >= (srcY + srcH)) {
                nx = 0;
                ny = 0;
            } else {
                nx = ((x - srcX) / Math.max(1, srcW - 1)) * (SIZE - 1);
                ny = ((y - srcY) / Math.max(1, srcH - 1)) * (SIZE - 1);
            }
            let m = smoothStrength > 0 ? smoothMaskAt(mask, SIZE, nx, ny) : sampleMaskBilinear(mask, SIZE, nx, ny);
            m = Math.max(0, Math.min(1, m));
            if (x < srcX || y < srcY || x >= (srcX + srcW) || y >= (srcY + srcH)) m = 0;

            // Lekki feather + threshold dla ładniejszej krawędzi packshotów.
            if (m < (alphaThreshold / 255)) m = 0;
            else m = Math.pow(m, featherGamma);

            const idx = (y * img.width + x) * 4;
            const alpha = clamp255(m * 255);

            // Defringe (głównie na białe halo po kompresji/światle studyjnym).
            if (alpha > 0 && alpha < 255) {
                const a = alpha / 255;
                const r = outPixels[idx];
                const g = outPixels[idx + 1];
                const b = outPixels[idx + 2];
                const avg = (r + g + b) / 3;
                const isNearWhite = avg > 180 && Math.abs(r - g) < 28 && Math.abs(g - b) < 28;
                if (isNearWhite) {
                    const pull = 1 - Math.min(0.9, defringeStrength * (1 - a));
                    outPixels[idx] = clamp255(r * pull);
                    outPixels[idx + 1] = clamp255(g * pull);
                    outPixels[idx + 2] = clamp255(b * pull);
                }
            }
            outPixels[idx + 3] = alpha;
        }
    }

    cleanupEdgeFrameArtifacts(outPixels, img.width, img.height);

    const alphaStats = estimateAlphaCoverage(outPixels);
    // Jeśli AI praktycznie nic nie usunęło (częste przy małym produkcie na jednolitym tle),
    // uruchamiamy fallback packshotowy: usuwanie tła na podstawie koloru z krawędzi.
    if (alphaStats.opaqueRatio > 0.9) {
        fallbackRemoveUniformBackground(outData, {
            diffThreshold: Number.isFinite(options.packshotDiffThreshold) ? options.packshotDiffThreshold : 34
        });
        cleanupEdgeFrameArtifacts(outPixels, img.width, img.height);
    }

    outCtx.putImageData(outData, 0, 0);
    const cropped = autoCropCanvasTransparency(outCanvas, Math.max(alphaThreshold, 18), cropPad);
    return cropped.toDataURL("image/png");
}

function enqueueRmbgTask(task) {
    return new Promise((resolve, reject) => {
        rmbgQueue.push({ ...task, resolve, reject });
        updateRmbgStatusUI({ phase: "queued", pending: rmbgQueue.length });
        if (!rmbgQueueRunning) processRmbgQueue();
    });
}

async function processRmbgQueue() {
    if (rmbgQueueRunning) return;
    rmbgQueueRunning = true;
    try {
        while (rmbgQueue.length) {
            const item = rmbgQueue.shift();
            rmbgQueueActiveTask = item;
            updateRmbgStatusUI({ phase: "processing", pending: rmbgQueue.length, activeTask: item });
            try {
                const result = await processRemoveBackgroundCore(item.imgData, item.options || {});
                item.resolve(result);
            } catch (err) {
                item.reject(err);
            } finally {
                rmbgQueueActiveTask = null;
                updateRmbgStatusUI({ phase: rmbgQueue.length ? "queued" : "done", pending: rmbgQueue.length });
            }
        }
    } finally {
        rmbgQueueRunning = false;
        setTimeout(() => updateRmbgStatusUI({ pending: rmbgQueue.length }), 350);
    }
}


window.pages = window.pages || [];
window.productImageCache = window.productImageCache || {};
const TNZ_BADGE_URL =
  "https://firebasestorage.googleapis.com/v0/b/pdf-creator-f7a8b.firebasestorage.app/o/CREATOR%20BASIC%2FTNZ.png?alt=media";

window.TNZ_IMAGE = null;
const COUNTRY_RO_BADGE_URL =
  "https://firebasestorage.googleapis.com/v0/b/pdf-creator-f7a8b.firebasestorage.app/o/CREATOR%20BASIC%2FRumunia.png?alt=media";

window.COUNTRY_RO_IMAGE = null;

const COUNTRY_UA_BADGE_URL =
  "https://firebasestorage.googleapis.com/v0/b/pdf-creator-f7a8b.firebasestorage.app/o/CREATOR%20BASIC%2FUkraina.png?alt=media";

window.COUNTRY_UA_IMAGE = null;
const COUNTRY_LT_BADGE_URL =
  "https://firebasestorage.googleapis.com/v0/b/pdf-creator-f7a8b.firebasestorage.app/o/CREATOR%20BASIC%2FLitwa.png?alt=media";

window.COUNTRY_LT_IMAGE = null;

const COUNTRY_BG_BADGE_URL =
  "https://firebasestorage.googleapis.com/v0/b/pdf-creator-f7a8b.firebasestorage.app/o/CREATOR%20BASIC%2FBulgaria.png?alt=media";

window.COUNTRY_BG_IMAGE = null;

const COUNTRY_PL_BADGE_URL =
  "https://firebasestorage.googleapis.com/v0/b/pdf-creator-f7a8b.firebasestorage.app/o/CREATOR%20BASIC%2FPolska.png?alt=media";

window.COUNTRY_PL_IMAGE = null;
// ============================================
// 🔒 NORMALIZACJA ZAZNACZENIA (dziecko → GROUP)
// ============================================
function normalizeSelection(nodes) {
    if (!Array.isArray(nodes)) return [];

    const toGroupRoot = (node) => {
        let current = node;
        while (
            current &&
            current.getParent &&
            current.getParent() instanceof Konva.Group
        ) {
            const parent = current.getParent();
            if (
                parent.getAttr("isPriceGroup") ||
                parent.getAttr("isPreset") ||
                parent.getAttr("isShape") ||
                parent.getAttr("isUserGroup")
            ) {
                current = parent;
                continue;
            }
            break;
        }
        return current;
    };

    return nodes
        .map(toGroupRoot)
        .filter((v, i, a) => v && a.indexOf(v) === i);
}

// Rozszerza zaznaczenie o wszystkie top-level elementy modułu direct (styl-wlasny)
// po wspólnym directModuleId. Działa głównie dla rozgrupowanych modułów.
function expandSelectionForDirectModules(nodes, layer) {
    if (!Array.isArray(nodes) || !layer || typeof layer.find !== "function") return Array.isArray(nodes) ? nodes : [];

    const directIds = new Set();
    nodes.forEach((node) => {
        if (!node || !node.getAttr) return;
        if (node instanceof Konva.Group && node.getAttr("isUserGroup")) return; // zachowaj normalne grupy bez rozbijania
        const id = String(node.getAttr("directModuleId") || "").trim();
        if (id) directIds.add(id);
    });
    if (!directIds.size) return nodes;

    const expanded = nodes.slice();
    const extras = layer.find((n) => {
        if (!n || !n.getAttr) return false;
        const id = String(n.getAttr("directModuleId") || "").trim();
        if (!id || !directIds.has(id)) return false;
        if (n instanceof Konva.Group && n.getAttr("isUserGroup")) return false;
        const parent = n.getParent ? n.getParent() : null;
        if (parent !== layer) return false;
        return (
            n instanceof Konva.Text ||
            n instanceof Konva.Image ||
            n instanceof Konva.Group ||
            n instanceof Konva.Rect
        );
    });

    extras.forEach((n) => {
        if (!expanded.includes(n)) expanded.push(n);
    });
    return expanded;
}

function collectProductSlotsFromNode(page, node) {
    const slots = new Set();
    if (!node || !node.getAttr) return slots;

    const isProductCarrier = (n) => {
        if (!n || !n.getAttr) return false;
        return !!(
            n.getAttr("isUserGroup") ||
            n.getAttr("isAutoSlotGroup") ||
            n.getAttr("isProductImage") ||
            n.getAttr("isPriceGroup") ||
            n.getAttr("isBarcode") ||
            n.getAttr("isCountryBadge")
        );
    };

    const tryAddSlot = (n) => {
        if (!n || !n.getAttr) return;
        const direct = Number(n.getAttr("slotIndex"));
        const preserved = Number(n.getAttr("preservedSlotIndex"));
        if (Number.isFinite(direct)) slots.add(direct);
        if (Number.isFinite(preserved)) slots.add(preserved);
    };

    if (isProductCarrier(node)) {
        tryAddSlot(node);
    }

    if (node.getChildren) {
        const walk = (n) => {
            if (!n) return;
            if (isProductCarrier(n)) tryAddSlot(n);
            if (n.getChildren) n.getChildren().forEach(walk);
        };
        node.getChildren().forEach(walk);
    }

    let parent = node.getParent ? node.getParent() : null;
    while (parent && parent !== page?.stage) {
        if (isProductCarrier(parent)) tryAddSlot(parent);
        parent = parent.getParent ? parent.getParent() : null;
    }

    return slots;
}

function clearCatalogSlotStateForNode(page, node) {
    if (!page) return;
    const slots = collectProductSlotsFromNode(page, node);
    if (!slots.size) return;

    slots.forEach((slot) => {
        if (!Number.isFinite(slot)) return;
        if (Array.isArray(page.products)) page.products[slot] = null;
        if (Array.isArray(page.slotObjects)) page.slotObjects[slot] = null;
        if (Array.isArray(page.barcodeObjects)) page.barcodeObjects[slot] = null;
        if (Array.isArray(page.barcodePositions)) page.barcodePositions[slot] = null;
        if (Array.isArray(page.boxScales)) page.boxScales[slot] = null;
        if (page._customProtectedSlots instanceof Set) page._customProtectedSlots.delete(slot);
    });
}

// ============================================
// CROP MODE (CANVA-LIKE) DLA OBRAZKÓW
// ============================================
const TRANSFORMER_ANCHORS_DEFAULT = [
    'top-left', 'top-center', 'top-right',
    'middle-left', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right'
];

const TRANSFORMER_ANCHORS_CROP = [
    'middle-left', 'middle-right',
    'top-center', 'bottom-center'
];

function ensureImageCropData(img) {
    if (!(img instanceof Konva.Image)) return null;
    const imgEl = img.image();
    if (!imgEl) return null;

    const cropX = Number.isFinite(img.cropX()) ? img.cropX() : 0;
    const cropY = Number.isFinite(img.cropY()) ? img.cropY() : 0;
    let baseW = img.width() || imgEl.width;
    let baseH = img.height() || imgEl.height;
    if (!baseW || baseW <= 0) baseW = imgEl.width || 1;
    if (!baseH || baseH <= 0) baseH = imgEl.height || 1;

    let cropW = img.cropWidth() || baseW;
    let cropH = img.cropHeight() || baseH;

    // domyślne pełne kadrowanie
    if (!cropW || cropW <= 0) cropW = baseW;
    if (!cropH || cropH <= 0) cropH = baseH;

    img.crop({ x: cropX, y: cropY, width: cropW, height: cropH });
    img.width(cropW);
    img.height(cropH);
    return { imgEl, cropX, cropY, cropW, cropH };
}

function disableCropMode(page) {
    if (!page || !page._cropMode) return;
    const img = page._cropTarget;
    if (img) img.off('.crop');

    page._cropMode = false;
    page._cropTarget = null;

    page.transformer.enabledAnchors(TRANSFORMER_ANCHORS_DEFAULT);
    page.transformer.rotateEnabled(true);
    page.transformer.keepRatio(true);
    page.transformer.borderStroke('#007cba');
    page.transformer.anchorStroke('#007cba');
    page.transformer.anchorFill('#ffffff');
    page.layer.batchDraw();
    page.transformerLayer.batchDraw();
}

function enableCropMode(page, img) {
    if (!page || !(img instanceof Konva.Image)) return false;
    if (img.getAttr && img.getAttr("isBarcode")) {
        return false;
    }
    if (Math.abs(img.rotation()) > 0.01) {
        // nie blokuj pracy — po prostu pomiń crop dla obróconych
        return false;
    }

    if (page._cropMode && page._cropTarget === img) {
        return true;
    }
    if (page._cropMode && page._cropTarget && page._cropTarget !== img) {
        disableCropMode(page);
    }

    // resetuj poprzednie handlery crop, żeby nie dublować eventów
    img.off('.crop');

    ensureImageCropData(img);

    page._cropMode = true;
    page._cropTarget = img;

    page.transformer.enabledAnchors(TRANSFORMER_ANCHORS_DEFAULT);
    page.transformer.rotateEnabled(true);
    page.transformer.keepRatio(true);
    page.transformer.borderStroke('#007cba');
    page.transformer.anchorStroke('#007cba');
    page.transformer.anchorFill('#ffffff');
    page.transformer.nodes([img]);

    img.on('transformstart.crop', () => {
        const anchor = page.transformer.getActiveAnchor();
        const isCropAnchor = (
            anchor === 'middle-left' ||
            anchor === 'middle-right' ||
            anchor === 'top-center' ||
            anchor === 'bottom-center'
        );
        if (!isCropAnchor) {
            img._cropState = { isCropping: false };
            return;
        }

        const data = ensureImageCropData(img);
        if (!data) return;
        img._cropApplying = false;
        img._cropState = {
            isCropping: true,
            origX: img.x(),
            origY: img.y(),
            origScaleX: img.scaleX(),
            origScaleY: img.scaleY(),
            cropX: img.cropX(),
            cropY: img.cropY(),
            cropW: img.cropWidth(),
            cropH: img.cropHeight(),
            imgW: data.imgEl.width,
            imgH: data.imgEl.height
        };
    });

    img.on('transform.crop', () => {
        const s = img._cropState;
        if (!s || !s.isCropping) return;
        if (img._cropApplying) return;
        img._cropApplying = true;

        const anchor = page.transformer.getActiveAnchor();
        const scaleFactorX = img.scaleX() / s.origScaleX;
        const scaleFactorY = img.scaleY() / s.origScaleY;

        const minDisplay = 20;
        const minCropW = minDisplay / s.origScaleX;
        const minCropH = minDisplay / s.origScaleY;

        let newCropW = s.cropW;
        let newCropH = s.cropH;
        let newCropX = s.cropX;
        let newCropY = s.cropY;
        let newX = s.origX;
        let newY = s.origY;

        if (anchor === 'middle-right') {
            newCropW = Math.max(minCropW, s.cropW * scaleFactorX);
        }
        if (anchor === 'middle-left') {
            newCropW = Math.max(minCropW, s.cropW * scaleFactorX);
            const deltaCrop = s.cropW - newCropW;
            newCropX = s.cropX + deltaCrop;
            newX = s.origX + deltaCrop * s.origScaleX;
        }
        if (anchor === 'bottom-center') {
            newCropH = Math.max(minCropH, s.cropH * scaleFactorY);
        }
        if (anchor === 'top-center') {
            newCropH = Math.max(minCropH, s.cropH * scaleFactorY);
            const deltaCrop = s.cropH - newCropH;
            newCropY = s.cropY + deltaCrop;
            newY = s.origY + deltaCrop * s.origScaleY;
        }

        if (newCropX < 0) {
            newX -= newCropX * s.origScaleX;
            newCropW += newCropX;
            newCropX = 0;
        }
        if (newCropY < 0) {
            newY -= newCropY * s.origScaleY;
            newCropH += newCropY;
            newCropY = 0;
        }

        const maxW = s.imgW - newCropX;
        const maxH = s.imgH - newCropY;
        if (newCropW > maxW) newCropW = maxW;
        if (newCropH > maxH) newCropH = maxH;

        try {
            img.crop({ x: newCropX, y: newCropY, width: newCropW, height: newCropH });
            img.width(newCropW);
            img.height(newCropH);
            img.scaleX(s.origScaleX);
            img.scaleY(s.origScaleY);
            img.x(newX);
            img.y(newY);
            img.getLayer()?.batchDraw();
        } finally {
            img._cropApplying = false;
        }
    });

    img.on('transformend.crop', () => {
        const s = img._cropState;
        if (!s || !s.isCropping) return;
        img.scaleX(s.origScaleX);
        img.scaleY(s.origScaleY);
        img.getLayer()?.batchDraw();
    });

    return true;
}



// ==========================================================
//  WYLICZANIE CYFRY KONTROLNEJ DLA EAN-13
// ==========================================================
function calculateEAN13Checksum(code12) {
    const digits = code12.split("").map(Number);
    let sum = 0;

    for (let i = 0; i < 12; i++) {
        sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }

    return (10 - (sum % 10)) % 10;
}

// ==========================================================
//  NORMALIZACJA EAN → zawsze 13 cyfr
// ==========================================================
function normalizeEAN(eanRaw) {
    // ================================

    let ean = eanRaw.replace(/\D/g, "");

    if (ean.length === 7) ean = ean.padStart(12, "0");

    if (ean.length === 8) return "00000" + ean;

    if (ean.length < 12) ean = ean.padStart(12, "0");

    if (ean.length === 12) {
        return ean + calculateEAN13Checksum(ean);
    }

    if (ean.length === 13) return ean;

    ean = ean.slice(0, 12);
    return ean + calculateEAN13Checksum(ean);
}
// ================================
// LOADER TNZ (CANVA STYLE – TYLKO RAZ)
// ================================
function loadTNZImage(cb) {
    if (window.TNZ_IMAGE) {
        cb(window.TNZ_IMAGE);
        return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
        window.TNZ_IMAGE = img;
        cb(img);
    };

    img.onerror = (e) => {
        console.error("❌ Błąd ładowania TNZ:", TNZ_BADGE_URL, e);
    };

    img.src = TNZ_BADGE_URL;
}
// ================================
// LOADER COUNTRY RO (CANVA STYLE – TYLKO RAZ)
// ================================
function loadCountryROImage(cb) {
    if (window.COUNTRY_RO_IMAGE) {
        cb(window.COUNTRY_RO_IMAGE);
        return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
        window.COUNTRY_RO_IMAGE = img;
        cb(img);
    };

    img.onerror = (e) => {
        console.error("❌ Błąd ładowania Rumunia:", COUNTRY_RO_BADGE_URL, e);
    };

    img.src = COUNTRY_RO_BADGE_URL;
}
// ================================
// LOADER COUNTRY UA (CANVA STYLE – TYLKO RAZ)
// ================================
function loadCountryUAImage(cb) {
    if (window.COUNTRY_UA_IMAGE) {
        cb(window.COUNTRY_UA_IMAGE);
        return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
        window.COUNTRY_UA_IMAGE = img;
        cb(img);
    };

    img.onerror = (e) => {
        console.error("❌ Błąd ładowania Ukraina:", COUNTRY_UA_BADGE_URL, e);
    };

    img.src = COUNTRY_UA_BADGE_URL;
}




window.isEditingText = false;
// ================================
// CANVA TEXT HELPERS – Z DEMO
// ================================
function getTokensInString(text) {
    if (typeof text === "string") {
        return text.split(/[\s\n]+/).filter(t => t.length > 0);
    }
    return [];
}

function hasBrokenWords(sourceTokens, renderLines) {
    let combined = "";
    for (let i = 0; i < renderLines.length; i++) {
        combined += (i === 0 ? "" : " ") + renderLines[i].text;
    }
    const a = sourceTokens;
    const b = getTokensInString(combined);
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return true;
    }
    return false;
}

function shrinkText(textNode, minFontSize = 8) {
    const sourceTokens = getTokensInString(textNode.text());
    let brokenWords = hasBrokenWords(sourceTokens, textNode.textArr);
    let textHeight = textNode.textArr.length * textNode.textHeight;
    let textAreaHeight = textNode.height();

    while ((textHeight > textAreaHeight || brokenWords) && textNode.fontSize() > minFontSize) {
        textNode.fontSize(textNode.fontSize() - 1);
        brokenWords = hasBrokenWords(sourceTokens, textNode.textArr);
        textHeight = textNode.textArr.length * textNode.textHeight;
        textAreaHeight = textNode.height();
    }
    return textNode.fontSize();
}

function createRotationLabel(layer) {
    const label = new Konva.Label({
        opacity: 0,
        visible: false
    });
    const tag = new Konva.Tag({
        fill: "black",
        cornerRadius: 6,
        padding: 6
    });
    const text = new Konva.Text({
        text: "",
        fontSize: 16,
        fill: "white",
        fontFamily: "Arial"
    });
    label.add(tag);
    label.add(text);
    layer.add(label);
    return { label, text };
}
window.allProducts = [];
window.pages = [];

// ================================
// LOADER COUNTRY LT (CANVA STYLE – TYLKO RAZ)
// ================================
function loadCountryLTImage(cb) {
    if (window.COUNTRY_LT_IMAGE) {
        cb(window.COUNTRY_LT_IMAGE);
        return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
        window.COUNTRY_LT_IMAGE = img;
        cb(img);
    };

    img.onerror = (e) => {
        console.error("❌ Błąd ładowania Litwa:", COUNTRY_LT_BADGE_URL, e);
    };

    img.src = COUNTRY_LT_BADGE_URL;
}
// ================================
// LOADER COUNTRY BG (CANVA STYLE – TYLKO RAZ)
// ================================
function loadCountryBGImage(cb) {
    if (window.COUNTRY_BG_IMAGE) {
        cb(window.COUNTRY_BG_IMAGE);
        return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
        window.COUNTRY_BG_IMAGE = img;
        cb(img);
    };

    img.onerror = (e) => {
        console.error("❌ Błąd ładowania Bulgaria:", COUNTRY_BG_BADGE_URL, e);
    };

    img.src = COUNTRY_BG_BADGE_URL;
}

// ================================
// LOADER COUNTRY PL (CANVA STYLE – TYLKO RAZ)
// ================================
function loadCountryPLImage(cb) {
    if (window.COUNTRY_PL_IMAGE) {
        cb(window.COUNTRY_PL_IMAGE);
        return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
        window.COUNTRY_PL_IMAGE = img;
        cb(img);
    };

    img.onerror = (e) => {
        console.error("❌ Błąd ładowania Polska:", COUNTRY_PL_BADGE_URL, e);
    };

    img.src = COUNTRY_PL_BADGE_URL;
}


// =====================================================
// CENTRALNA FUNKCJA BUDOWANIA STRON Z PRODUKTÓW
// =====================================================
window.buildPagesFromProducts = function (products) {

    if (!Array.isArray(products) || products.length === 0) {
        console.warn("Brak produktów – nie buduję stron");
        return;
    }

    // 🔥 usuń stare strony
    pages.forEach(p => {
        p.stage?.destroy();
        p.container?.remove();
    });

    pages.length = 0;
    document.getElementById('pagesContainer').innerHTML = '';

    const perPage = COLS * ROWS;

    for (let i = 0; i < products.length; i += perPage) {
        const prods = products.slice(i, i + perPage);
        createPage(Math.floor(i / perPage) + 1, prods);
    }

    console.log("📄 Strony przebudowane. Layout:", window.LAYOUT_MODE);
};


const MM_TO_PX = 3.78;
const PAGE_MARGIN = 15 * MM_TO_PX;  // ~56.7px
const BOTTOM_MARGIN_TARGET = 18 * MM_TO_PX; // 18mm
const BOTTOM_MARGIN_DELTA = (28 + PAGE_MARGIN) - BOTTOM_MARGIN_TARGET;
// ================================
// CANVA STYLE SHADOW – DLA ZDJĘĆ
// ================================
const IMAGE_SHADOW = {
    color: 'rgba(0,0,0,0.25)',
    blur: 18,
    offsetX: 0,
    offsetY: 8,
    opacity: 1
};

function addImageShadow(layer, img) {
    if (!img) return;
    // nie dodawaj cienia do zdjęć produktów (ramki wyglądały źle)
    if (img.getAttr && img.getAttr("isProductImage")) return;
    img.shadowColor(IMAGE_SHADOW.color);
    img.shadowBlur(IMAGE_SHADOW.blur);
    img.shadowOffset({ x: IMAGE_SHADOW.offsetX, y: IMAGE_SHADOW.offsetY });
    img.shadowOpacity(IMAGE_SHADOW.opacity);
    if (layer) img.moveToTop();
}

function setupProductImageDrag(img, layer) {
    if (!img) return;
    img.draggable(true);
    img.listening(true);
    if (img.off) img.off(".productDrag");
    const disableBoxes = () => {
        if (!layer) return;
        layer.find(n => n.getAttr && n.getAttr("isBox")).forEach(b => {
            if (b.getAttr("boxListenWas")) return;
            b.setAttr("boxListenWas", b.listening());
            b.listening(false);
        });
    };
    const restoreBoxes = () => {
        if (!layer) return;
        layer.find(n => n.getAttr && n.getAttr("isBox")).forEach(b => {
            const prev = b.getAttr("boxListenWas");
            if (prev !== undefined) {
                b.listening(!!prev);
                b.setAttr("boxListenWas", undefined);
            }
        });
        layer.batchDraw();
    };
    img.on('mousedown.productDrag touchstart.productDrag', () => {
        disableBoxes();
    });
    img.on('mouseup.productDrag touchend.productDrag dragend.productDrag', () => {
        restoreBoxes();
    });
    ensureImageFX(img, layer);
}

function normalizeHexColor(color, fallback = "#000000") {
    if (!color) return fallback;
    if (typeof color === "string" && color.startsWith("#")) return color;
    const m = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return fallback;
    const r = Math.max(0, Math.min(255, parseInt(m[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(m[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(m[3], 10)));
    return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

function isNodeDestroyed(node) {
    if (!node) return true;
    if (typeof node.isDestroyed === "function") return node.isDestroyed();
    return !!node._destroyed;
}

function getImageFxState(img) {
    return {
        opacity: Number.isFinite(img.getAttr("fxOpacity")) ? img.getAttr("fxOpacity") : (img.opacity ? img.opacity() : 1),
        shadowEnabled: typeof img.getAttr("fxShadowEnabled") === "boolean"
            ? img.getAttr("fxShadowEnabled")
            : (img.shadowBlur && img.shadowBlur() > 0),
        shadowColor: img.getAttr("fxShadowColor") || normalizeHexColor(img.shadowColor ? img.shadowColor() : "#000000"),
        shadowBlur: Number.isFinite(img.getAttr("fxShadowBlur")) ? img.getAttr("fxShadowBlur") : 0,
        shadowOffsetX: Number.isFinite(img.getAttr("fxShadowOffsetX")) ? img.getAttr("fxShadowOffsetX") : (img.shadowOffsetX ? img.shadowOffsetX() : 0),
        shadowOffsetY: Number.isFinite(img.getAttr("fxShadowOffsetY")) ? img.getAttr("fxShadowOffsetY") : (img.shadowOffsetY ? img.shadowOffsetY() : 0),
        shadowOpacity: Number.isFinite(img.getAttr("fxShadowOpacity")) ? img.getAttr("fxShadowOpacity") : 0.35,
        brightness: Number.isFinite(img.getAttr("fxBrightness")) ? img.getAttr("fxBrightness") : 0,
        contrast: Number.isFinite(img.getAttr("fxContrast")) ? img.getAttr("fxContrast") : 0,
        saturation: Number.isFinite(img.getAttr("fxSaturation")) ? img.getAttr("fxSaturation") : 0,
        temperature: Number.isFinite(img.getAttr("fxTemperature")) ? img.getAttr("fxTemperature") : 0,
        grayscale: !!img.getAttr("fxGrayscale"),
        sepia: !!img.getAttr("fxSepia"),
        strokeColor: img.getAttr("fxStrokeColor") || "#000000",
        strokeWidth: Number.isFinite(img.getAttr("fxStrokeWidth")) ? img.getAttr("fxStrokeWidth") : 0,
        bgBlur: Number.isFinite(img.getAttr("fxBgBlur")) ? img.getAttr("fxBgBlur") : 0
    };
}

function ensureImageFX(img, layer) {
    if (!img || img.getAttr("fxReady")) return;
    img.setAttr("fxReady", true);
    const fx = getImageFxState(img);
    img.setAttr("fxOpacity", fx.opacity);
    img.setAttr("fxShadowEnabled", fx.shadowEnabled);
    img.setAttr("fxShadowColor", fx.shadowColor);
    img.setAttr("fxShadowBlur", fx.shadowBlur);
    img.setAttr("fxShadowOffsetX", fx.shadowOffsetX);
    img.setAttr("fxShadowOffsetY", fx.shadowOffsetY);
    img.setAttr("fxShadowOpacity", fx.shadowOpacity);
    img.setAttr("fxBrightness", fx.brightness);
    img.setAttr("fxContrast", fx.contrast);
    img.setAttr("fxSaturation", fx.saturation);
    img.setAttr("fxTemperature", fx.temperature);
    img.setAttr("fxGrayscale", fx.grayscale);
    img.setAttr("fxSepia", fx.sepia);
    img.setAttr("fxStrokeColor", fx.strokeColor);
    img.setAttr("fxStrokeWidth", fx.strokeWidth);
    img.setAttr("fxBgBlur", fx.bgBlur);

    if (img.strokeScaleEnabled) img.strokeScaleEnabled(false);

    if (img.off) img.off(".fxPerf");
    img.on("dragstart.fxPerf transformstart.fxPerf", () => suspendImageFX(img, true));
    img.on("dragend.fxPerf transformend.fxPerf", () => suspendImageFX(img, false));
    img.on("destroy.fx", () => {
        if (img._bgBlurClone && !isNodeDestroyed(img._bgBlurClone)) {
            img._bgBlurClone.destroy();
        }
        img._bgBlurClone = null;
    });

    if (layer && layer.batchDraw) layer.batchDraw();
}

function suspendImageFX(img, suspend) {
    if (!img) return;
    if (typeof img.isDestroyed === "function" && img.isDestroyed()) return;
    if (suspend) {
        img.setAttr("fxSuspended", true);
        if (img._bgBlurClone && !isNodeDestroyed(img._bgBlurClone)) {
            img._bgBlurClone.visible(false);
        }
        if (img.filters) {
            const currentFilters = img.filters() || [];
            if (Array.isArray(currentFilters) && currentFilters.length) {
                img._fxSavedFilters = currentFilters;
                img.filters([]);
                if (img.clearCache) img.clearCache();
            }
        }
    } else {
        img.setAttr("fxSuspended", false);
        if (img._bgBlurClone && !isNodeDestroyed(img._bgBlurClone)) {
            img._bgBlurClone.visible(true);
        }
        applyImageFX(img);
    }
}

function ensureBgBlurClone(img) {
    if (!img || !img.getLayer) return null;
    const layer = img.getLayer();
    if (!layer) return null;
    if (img._bgBlurClone && !isNodeDestroyed(img._bgBlurClone)) return img._bgBlurClone;
    const clone = img.clone({ listening: false, draggable: false });
    clone.setAttr("isBgBlur", true);
    clone.setAttr("isFxHelper", true);
    clone.setAttr("selectable", false);
    clone.setAttr("isProductImage", false);
    clone.setAttr("isOverlayElement", false);
    clone.setAttr("slotIndex", null);
    clone.opacity(0.45);
    if (clone.filters) {
        clone.filters([Konva.Filters.Blur]);
        clone.blurRadius(10);
    }
    clone.listening(false);
    clone.draggable(false);
    clone.perfectDrawEnabled(false);
    layer.add(clone);
    // ustaw poniżej oryginału
    const z = Math.max(1, img.getZIndex() - 1);
    clone.setZIndex(z);
    img._bgBlurClone = clone;
    return clone;
}

function syncBgBlur(img) {
    if (!img) return;
    if (typeof img.isDestroyed === "function" && img.isDestroyed()) return;
    const fxBgBlur = Number.isFinite(img.getAttr("fxBgBlur")) ? img.getAttr("fxBgBlur") : 0;
    if (!fxBgBlur || fxBgBlur <= 0) {
        if (img._bgBlurClone && !isNodeDestroyed(img._bgBlurClone)) {
            img._bgBlurClone.remove();
            img._bgBlurClone.destroy();
        }
        img._bgBlurClone = null;
        return;
    }
    const clone = ensureBgBlurClone(img);
    if (!clone) return;
    clone.x(img.x());
    clone.y(img.y());
    clone.scaleX(img.scaleX());
    clone.scaleY(img.scaleY());
    clone.rotation(img.rotation());
    clone.offsetX(img.offsetX());
    clone.offsetY(img.offsetY());
    clone.width(img.width());
    clone.height(img.height());
    const cw = Number.isFinite(img.cropWidth()) ? img.cropWidth() : null;
    const ch = Number.isFinite(img.cropHeight()) ? img.cropHeight() : null;
    if (cw && ch) {
        clone.crop({ x: img.cropX(), y: img.cropY(), width: cw, height: ch });
    }
    if (clone.blurRadius) clone.blurRadius(fxBgBlur);
    if (clone.filters) {
        clone.filters([Konva.Filters.Blur]);
    }
    clone.opacity(0.45);
    // trzymaj pod oryginałem
    const z = Math.max(1, img.getZIndex() - 1);
    clone.setZIndex(z);
    clone.getLayer()?.batchDraw();
}

function applyImageFX(img) {
    if (!img) return;
    if (img.getAttr && img.getAttr("isBgBlur")) return;
    if (typeof img.isDestroyed === "function" && img.isDestroyed()) return;
    if (img._fxApplying) return;
    img._fxApplying = true;
    try {
        ensureImageFX(img);
        const fx = getImageFxState(img);

        img.opacity(fx.opacity);

    // obrys/ramka
    if (fx.strokeWidth && fx.strokeWidth > 0) {
        img.strokeEnabled(true);
        img.stroke(fx.strokeColor);
        img.strokeWidth(fx.strokeWidth);
    } else {
        img.strokeEnabled(false);
        img.strokeWidth(0);
    }

    // cień
    const shadowOn = !!fx.shadowEnabled && (fx.shadowBlur > 0 || fx.shadowOpacity > 0);
    img.shadowEnabled(shadowOn);
    if (shadowOn) {
        img.shadowColor(fx.shadowColor);
        img.shadowBlur(fx.shadowBlur);
        img.shadowOffset({ x: fx.shadowOffsetX, y: fx.shadowOffsetY });
        img.shadowOpacity(fx.shadowOpacity);
        img.setAttr("fxShadowEnabled", true);
    }

    // filtry
    const filters = [];
    const useHSL = (fx.saturation !== 0 || fx.temperature !== 0);
    if (fx.grayscale && Konva.Filters.Grayscale) filters.push(Konva.Filters.Grayscale);
    if (fx.sepia && Konva.Filters.Sepia) filters.push(Konva.Filters.Sepia);
    if (useHSL && Konva.Filters.HSL) filters.push(Konva.Filters.HSL);
    if (fx.brightness !== 0 && Konva.Filters.Brighten) filters.push(Konva.Filters.Brighten);
    if (fx.contrast !== 0 && Konva.Filters.Contrast) filters.push(Konva.Filters.Contrast);

    if (filters.length) {
        img.filters(filters);
        if (img.clearCache) img.clearCache();
        img.cache({ pixelRatio: 1 });
        if (useHSL && img.hue) {
            const hue = fx.temperature * 0.4; // -40..40
            img.hue(hue);
            if (img.saturation) img.saturation(fx.saturation / 100);
            if (img.luminance) img.luminance(0);
        }
        if (img.brightness) img.brightness(fx.brightness / 100);
        if (img.contrast) img.contrast(fx.contrast);
    } else {
        img.filters([]);
        if (img.clearCache) img.clearCache();
    }

        syncBgBlur(img);
        img.getLayer()?.batchDraw();
    } finally {
        img._fxApplying = false;
    }
}

function fixProductTextSlotIndex(page) {
    if (!page || !page.layer) return;
    const boxes = page.layer.find(n => n.getAttr && n.getAttr("isBox"));
    if (!boxes.length) return;
    const texts = page.layer.find(n =>
        n instanceof Konva.Text &&
        n.getAttr("isProductText") &&
        !Number.isFinite(n.getAttr("slotIndex"))
    );
    texts.forEach(t => {
        const tRect = t.getClientRect({ relativeTo: page.layer });
        const match = boxes.find(b => {
            const bRect = b.getClientRect({ relativeTo: page.layer });
            return Konva.Util.haveIntersection(tRect, bRect);
        });
        if (match) {
            t.setAttr("slotIndex", match.getAttr("slotIndex"));
        }
    });
}

window.fixProductImageDrag = function() {
    if (!Array.isArray(window.pages)) return;
    window.pages.forEach(p => {
        const imgs = p.layer.find(n => n instanceof Konva.Image && n.getAttr("isProductImage"));
        imgs.forEach(img => setupProductImageDrag(img, p.layer));
        p.layer.batchDraw();
    });
};

window.W = 794 + PAGE_MARGIN * 2;
window.H = 1123 + PAGE_MARGIN * 2;
// Użyj szerokości strony jako odniesienie dla paneli UI
document.documentElement.style.setProperty('--page-width', `${window.W}px`);
document.documentElement.style.setProperty('--panel-center-offset', `36px`);

function setupImportPanelToggle() {
    const panel = document.getElementById('importPanel');
    const toggle = document.getElementById('importPanelToggle');
    if (!panel || !toggle) return;

    const setState = (collapsed) => {
        panel.classList.toggle('collapsed', collapsed);
        toggle.setAttribute('aria-expanded', (!collapsed).toString());
        toggle.title = collapsed ? 'Rozwiń panel' : 'Zwiń panel';
        const icon = toggle.querySelector('.panel-toggle-icon');
        if (icon) icon.textContent = collapsed ? '▾' : '▴';
        const text = toggle.querySelector('.panel-toggle-text');
        if (text) text.textContent = collapsed ? 'Rozwiń' : 'Zwiń';
    };

    setState(panel.classList.contains('collapsed'));

    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setState(!panel.classList.contains('collapsed'));
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupImportPanelToggle);
} else {
    setupImportPanelToggle();
}

let ML = 14 + PAGE_MARGIN;  // lewy margines strony + 15mm
let MT = 140 + PAGE_MARGIN + BOTTOM_MARGIN_DELTA; // przesunięcie w dół
let MB = BOTTOM_MARGIN_TARGET;  // docelowo ~18mm
let COLS = 2, ROWS = 3, GAP = 6;
window.LAYOUT_MODE = "layout6"; // DOMYŚLNY LAYOUT
window.CATALOG_STYLE = window.CATALOG_STYLE || "default";
let BW = 0;           // GLOBALNIE – bazowa szerokość boxa
let BH = 0;           // GLOBALNIE – bazowa wysokość boxa
let BW_dynamic = 0;   // GLOBALNIE – dostępne wszędzie
let BH_dynamic = 0;   // GLOBALNIE – dostępne wszędzie
// =============================
// PREDEFINIOWANE USTAWIENIA
// =============================
const layout6Defaults = {
    COLS: 2,
    ROWS: 3,
    GAP: 6,
    MT: 140 + BOTTOM_MARGIN_DELTA,
    scaleBox: 1
};

const layout8Defaults = {
    COLS: 2,
    ROWS: 4,
    GAP: 5,     // bardzo mały odstęp 5 mm
    MT: 200 + BOTTOM_MARGIN_DELTA,    // opuszczamy siatkę niżej
    scaleBox: 1.00   // boxy 25% mniejsze
};

// === SKALA CENY (większa i proporcjonalna dla całej grupy ceny) ===
const PRICE_SIZE_MULTIPLIER_LAYOUT6 = 1.8;
const PRICE_SIZE_MULTIPLIER_LAYOUT8 = 1.15;


// === GLOBALNY CLIPBOARD + PASTE MODE ===
window.globalClipboard = null;
window.globalPasteMode = false;
window.globalStyleClipboard = null;
window.globalStylePasteMode = false;

const STYLE_KEYS = [
    "fill",
    "stroke",
    "strokeWidth",
    "opacity",
    "cornerRadius",
    "dash",
    "lineCap",
    "lineJoin",
    "shadowColor",
    "shadowBlur",
    "shadowOpacity",
    "fontFamily",
    "fontSize",
    "fontStyle",
    "textDecoration",
    "align",
    "verticalAlign",
    "lineHeight",
    "letterSpacing",
    "padding"
];
const GEOMETRY_STYLE_KEYS = ["width", "height", "scaleX", "scaleY", "rotation"];

function cloneStyleValue(v) {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.slice();
    if (typeof v === "object") return JSON.parse(JSON.stringify(v));
    return v;
}

function readStyleAttrs(node) {
    const out = {};
    const attrs = (node && node.getAttrs) ? node.getAttrs() : {};
    STYLE_KEYS.forEach((k) => {
        if (attrs[k] !== undefined && attrs[k] !== null) {
            out[k] = cloneStyleValue(attrs[k]);
            return;
        }
        if (node && typeof node[k] === "function") {
            try {
                const v = node[k]();
                if (v !== undefined && v !== null) out[k] = cloneStyleValue(v);
            } catch (_) {}
        }
    });
    GEOMETRY_STYLE_KEYS.forEach((k) => {
        if (node && typeof node[k] === "function") {
            try {
                const v = node[k]();
                if (v !== undefined && v !== null) out[k] = cloneStyleValue(v);
            } catch (_) {}
        }
    });

    if (node && typeof node.shadowOffsetX === "function" && typeof node.shadowOffsetY === "function") {
        out.shadowOffsetX = node.shadowOffsetX() || 0;
        out.shadowOffsetY = node.shadowOffsetY() || 0;
    }
    return out;
}

function writeStyleAttrs(node, attrs, copyGeometry = false) {
    if (!node || !attrs) return false;
    let changed = false;
    Object.keys(attrs).forEach((k) => {
        if (k === "shadowOffsetX" || k === "shadowOffsetY") return;
        if (!copyGeometry && GEOMETRY_STYLE_KEYS.includes(k)) return;
        const v = attrs[k];
        if (v === undefined || v === null) return;
        if (typeof node[k] === "function") {
            node[k](cloneStyleValue(v));
            changed = true;
        } else if (node.setAttr) {
            node.setAttr(k, cloneStyleValue(v));
            changed = true;
        }
    });

    if ((attrs.shadowOffsetX !== undefined || attrs.shadowOffsetY !== undefined) && typeof node.shadowOffset === "function") {
        node.shadowOffset({
            x: attrs.shadowOffsetX || 0,
            y: attrs.shadowOffsetY || 0
        });
        changed = true;
    }
    return changed;
}

function extractNodeStyle(node) {
    if (!node) return null;

    const style = {
        kind: "node",
        className: node.getClassName ? node.getClassName() : "",
        attrs: readStyleAttrs(node),
        meta: {
            sourceIsBox: !!(node.getAttr && node.getAttr("isBox")),
            sourceIsBarcode: !!(node.getAttr && node.getAttr("isBarcode")),
            sourceIsPriceGroup: !!(node.getAttr && node.getAttr("isPriceGroup")),
            copyGeometry: !!(node.getAttr && (
                node.getAttr("isBox") ||
                node.getAttr("isPriceGroup") ||
                node.getAttr("isShape") ||
                node.getAttr("isPreset") ||
                node.getAttr("isUserGroup")
            ))
        }
    };

    if (node instanceof Konva.Image) {
        style.kind = "image";
        style.imageFX = node.getAttr ? cloneStyleValue(node.getAttr("imageFX")) : null;
        if (node.getAttr && node.getAttr("isBarcode")) {
            style.barcode = {
                color: node.getAttr("barcodeColor") || "#000000",
                isBarcode: true
            };
        }
    } else if (node instanceof Konva.Text) {
        style.kind = "text";
    } else if (node instanceof Konva.Group) {
        style.kind = "group";
        style.children = node.getChildren().map((child) => extractNodeStyle(child));
    } else if (node instanceof Konva.Rect) {
        style.kind = "rect";
    }

    return style;
}

function applyNodeStyle(target, style, inheritedCopyGeometry = false) {
    if (!target || !style) return false;

    const copyGeometry = !!(inheritedCopyGeometry || (style.meta && style.meta.copyGeometry));
    let changed = writeStyleAttrs(target, style.attrs || {}, copyGeometry);

    if (style.kind === "group" && target instanceof Konva.Group && Array.isArray(style.children)) {
        const targetChildren = target.getChildren();
        const len = Math.min(targetChildren.length, style.children.length);
        for (let i = 0; i < len; i++) {
            if (applyNodeStyle(targetChildren[i], style.children[i], copyGeometry)) {
                changed = true;
            }
        }
    }

    if (style.kind === "image" && target instanceof Konva.Image) {
        if (style.imageFX && target.setAttr) {
            target.setAttr("imageFX", cloneStyleValue(style.imageFX));
            if (typeof ensureImageFX === "function") ensureImageFX(target, target.getLayer?.());
            if (typeof applyImageFX === "function") applyImageFX(target);
            changed = true;
        }
        if (
            style.barcode &&
            style.barcode.isBarcode &&
            target.getAttr &&
            target.getAttr("isBarcode") &&
            typeof window.recolorBarcode === "function"
        ) {
            window.recolorBarcode(target, style.barcode.color || "#000000", true);
            changed = true;
        }
    }

    return changed;
}

// === USTAWIENIA KATALOGU (GLOBALNE) ===
window.catalogSettings = {
    priceFormat: 'full'
};

// === ZOOM DLA CAŁEJ STRONY ===
let currentZoom = 1.0;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;

function applyZoomToPage(page, scale) {
    const wrapper = page.container.querySelector('.canvas-wrapper');
    if (!wrapper) return;

    // Upewnij się, że wrapper i przycisk są w jednym kontenerze zoomu
    let zoomWrap = page.container.querySelector('.page-zoom-wrap');
    const addBtnWrap = page.container.querySelector('.add-page-btn-wrapper');

    if (!zoomWrap) {
        zoomWrap = document.createElement('div');
        zoomWrap.className = 'page-zoom-wrap';
        zoomWrap.style.width = `${W}px`;
        zoomWrap.style.margin = '0 auto';
        zoomWrap.style.position = 'relative';
        wrapper.parentNode.insertBefore(zoomWrap, wrapper);
        zoomWrap.appendChild(wrapper);
        if (addBtnWrap) zoomWrap.appendChild(addBtnWrap);
    } else if (addBtnWrap && addBtnWrap.parentNode !== zoomWrap) {
        zoomWrap.appendChild(addBtnWrap);
    }

    // Reset transformy na dzieciach — skaluje tylko kontener
    wrapper.style.transform = 'none';
    if (addBtnWrap) addBtnWrap.style.transform = 'none';

    if (!page._zoomBaseHeight) {
        // Bazowa wysokość do obliczenia odstępu przy zoomie
        page._zoomBaseHeight = zoomWrap.getBoundingClientRect().height || (H + 160);
    }

    zoomWrap.style.transition = 'transform 0.15s ease-out';
    zoomWrap.style.transform = `scale(${scale})`;
    zoomWrap.style.transformOrigin = 'top center';
    zoomWrap.style.marginBottom = `${Math.max(0, (scale - 1) * page._zoomBaseHeight)}px`;

    if (page.stage) page.stage.batchDraw();
}

// Styl kontenera zoomu (żeby przycisk pod stroną zachował się jak w Canva)
if (!document.getElementById('pageZoomWrapStyle')) {
    const zw = document.createElement('style');
    zw.id = 'pageZoomWrapStyle';
    zw.textContent = `
      .page-zoom-wrap { display: block; }
    `;
    document.head.appendChild(zw);
}

function createZoomSlider() {
    if (document.getElementById('zoomSlider')) return;

    // Footer bar (Canva-like) – przypięta do dołu
    let footer = document.getElementById('appFooterBar');
    if (!footer) {
        footer = document.createElement('div');
        footer.id = 'appFooterBar';
        footer.style.cssText = `
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            height: 56px;
            background: rgba(248,250,252,0.96);
            border-top: 1px solid #e5e7eb;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding: 0 18px;
            z-index: 100000;
            backdrop-filter: blur(6px);
            pointer-events: auto;
        `;
        document.body.appendChild(footer);
    }

    const slider = document.createElement('div');
    slider.id = 'zoomSlider';
    slider.style.cssText = `
        background: #ffffff;
        padding: 6px 10px;
        border-radius: 999px;
        box-shadow: 0 6px 16px rgba(15,23,42,0.18);
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: Arial;
        border: 1px solid #e5e7eb;
        pointer-events: auto;
        margin-right: 180px; /* odsunięcie od prawego panelu */
    `;

    slider.innerHTML = `
        <button class="zoom-btn" data-delta="-0.1" type="button" onclick="window.changeZoom && window.changeZoom(-0.1)">−</button>
        <input type="range" id="zoomRange" min="${ZOOM_MIN}" max="${ZOOM_MAX}" step="0.1" value="1" class="zoom-range">
        <span id="zoomValue" class="zoom-val">100%</span>
        <button class="zoom-btn" data-delta="0.1" type="button" onclick="window.changeZoom && window.changeZoom(0.1)">+</button>
    `;

    footer.appendChild(slider);

    const range = document.getElementById('zoomRange');
    const value = document.getElementById('zoomValue');

    const updateZoomTrack = () => {
        const min = parseFloat(range.min);
        const max = parseFloat(range.max);
        const val = parseFloat(range.value);
        const pct = ((val - min) / (max - min)) * 100;
        range.style.background = `linear-gradient(90deg, #6b7280 ${pct}%, #e5e7eb ${pct}%)`;
    };

    window.changeZoom = (delta) => {
        const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, currentZoom + delta));
        range.value = newZoom;
        currentZoom = newZoom;
        value.textContent = Math.round(newZoom * 100) + '%';
        pages.forEach(p => applyZoomToPage(p, newZoom));
        updateZoomTrack();
    };

    range.oninput = () => {
        currentZoom = parseFloat(range.value);
        value.textContent = Math.round(currentZoom * 100) + '%';
        pages.forEach(p => applyZoomToPage(p, currentZoom));
        updateZoomTrack();
    };

    slider.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const delta = parseFloat(btn.dataset.delta || "0");
            if (!delta || Number.isNaN(delta)) return;
            window.changeZoom(delta);
        });
    });

    // awaryjny delegowany handler (gdyby ktoś nadpisał eventy)
    slider.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.zoom-btn');
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();
        const delta = parseFloat(btn.dataset.delta || "0");
        if (!delta || Number.isNaN(delta)) return;
        window.changeZoom(delta);
    });

    updateZoomTrack();

    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === '0') {
            e.preventDefault();
            range.value = 1;
            currentZoom = 1.0;
            value.textContent = '100%';
            pages.forEach(p => applyZoomToPage(p, 1.0));
        }
    });
}

// Styl suwaka zoom (Canva-like)
if (!document.getElementById('zoomSliderStyle')) {
    const zs = document.createElement('style');
    zs.id = 'zoomSliderStyle';
    zs.textContent = `
      #appFooterBar .zoom-btn{
        width: 32px;
        height: 32px;
        border-radius: 10px;
        border: 1px solid #d1d5db;
        color: #374151;
        background: #f9fafb;
        font-size: 20px;
        line-height: 1;
        font-weight: 700;
        cursor: pointer;
      }
      #appFooterBar .zoom-btn:active{
        transform: translateY(1px);
      }
      #appFooterBar .zoom-range{
        width: 150px;
        height: 6px;
        border-radius: 999px;
        background: linear-gradient(90deg, #6b7280 0%, #e5e7eb 0%);
        outline: none;
        -webkit-appearance: none;
      }
      #appFooterBar .zoom-btn,
      #appFooterBar .zoom-range,
      #appFooterBar .zoom-val{
        pointer-events: auto;
      }
      #appFooterBar .zoom-range::-webkit-slider-thumb{
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 999px;
        background: #6b7280;
        border: 2px solid #fff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      #appFooterBar .zoom-range::-moz-range-thumb{
        width: 14px;
        height: 14px;
        border-radius: 999px;
        background: #6b7280;
        border: 2px solid #fff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      #appFooterBar .zoom-val{
        font-weight: 700;
        color: #111827;
        min-width: 48px;
        text-align: center;
      }
    `;
    document.head.appendChild(zs);
}

// Delegowany handler zoom +/- (awaryjnie dla już istniejącego slidera)
if (!window._zoomBtnDelegated) {
    window._zoomBtnDelegated = true;
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#zoomSlider .zoom-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const delta = parseFloat(btn.dataset.delta || "0");
        if (Number.isNaN(delta) || delta === 0) return;
        if (typeof window.changeZoom === "function") {
            window.changeZoom(delta);
        }
    }, true);
}


// === IMPORT EXCEL (POMIJA NAGŁÓWEK) ===
window.importExcelMultiPage = async function() {
    const file = document.getElementById('excelFile')?.files[0];
    if (!file) return alert('Wybierz plik Excel!');

    // 🔥 WYBÓR LAYOUTU – Z edytor.js (lub szybki kreator)
    if (window.quickCreatorExcelPick && window.quickCreatorLayout) {
        window.LAYOUT_MODE = window.quickCreatorLayout;
        window.quickCreatorLayout = null;
        window.quickCreatorExcelPick = false;
    } else {
        window.LAYOUT_MODE = await window.openLayoutSelector();
    }


    let scaleBox = 1;

// -------------------------------
// USTAWIENIA DLA LAYOUTU 6
// -------------------------------
if (window.LAYOUT_MODE === "layout6") {
    COLS = layout6Defaults.COLS;
    ROWS = layout6Defaults.ROWS;
    GAP  = layout6Defaults.GAP;
    MT   = layout6Defaults.MT;
    scaleBox = layout6Defaults.scaleBox;
}

// -------------------------------
// USTAWIENIA DLA LAYOUTU 8
// -------------------------------
if (window.LAYOUT_MODE === "layout8") {
    COLS = layout8Defaults.COLS;
    ROWS = layout8Defaults.ROWS;
    GAP  = layout8Defaults.GAP;
    MT   = layout8Defaults.MT;
    scaleBox = layout8Defaults.scaleBox;
}




if (window.LAYOUT_MODE === "layout6"){
    COLS = 2;
    ROWS = 3;
}
// =====================================================
//   PRZELICZANIE ROZMIARÓW BOXÓW *PO* WYBORZE LAYOUTU
// =====================================================

// standardowe parametry
// -------------------------------
// PRZELICZENIE ROZMIARÓW BOXÓW
// -------------------------------
BW = (W - ML * 2 - GAP * (COLS - 1)) / COLS;
BH = (H - MT - MB - GAP * (ROWS - 1)) / ROWS;

BW_dynamic = BW * scaleBox;
BH_dynamic = BH * scaleBox;



// 3️⃣ Przelicz wysokość i szerokość boxów
const perPage = COLS * ROWS;


    try {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(1);

  allProducts = json.map(row => ({
    INDEKS: String(row[0] || '').trim(),        // A
    NAZWA: String(row[1] || '').trim(),         // B
    JEDNOSTKA: String(row[2] || '').trim(),     // C  ✅ NOWE
    CENA: String(row[3] || '').trim(),          // D
    'KOD EAN': String(row[4] || '').trim(),     // E
    TNZ: String(row[5] || '').trim(),           // F
    RANKING: String(row[6] || '').trim(),       // G
    LOGO: String(row[7] || '').trim(),          // H
    KRAJPOCHODZENIA: String(row[8] || '').trim()// I
}))



        pages.forEach(p => {
            p.stage?.destroy();
            p.container?.remove();
        });
        pages = [];
        document.getElementById('pagesContainer').innerHTML = '';

        window.ExcelImporterReady = true;
        window.ExcelImporter = { pages };

        buildPagesFromProducts(allProducts);
        window.projectOpen = true;
        window.projectDirty = true;
        if (typeof window.quickStatusUpdate === "function") {
            window.quickStatusUpdate("excel", true);
        }
        // Jeśli zdjęcia były już wybrane (np. szybki kreator) – zaimportuj je po zbudowaniu stron
        if (window.quickImageFiles && window.quickImageFiles.length > 0) {
            if (typeof window.importImagesFromFiles === "function") {
                window.importImagesFromFiles(window.quickImageFiles);
            }
        } else {
            const imgInput = document.getElementById('imageInput');
            if (imgInput && imgInput.files && imgInput.files.length > 0) {
                if (typeof window.importImagesFromFiles === "function") {
                    window.importImagesFromFiles();
                }
            }
        }
        if (typeof window.resetProjectHistory === "function") {
            window.resetProjectHistory(null);
        }


        const pdfButton = document.getElementById('pdfButton');
        if (pdfButton) pdfButton.disabled = false;

        document.getElementById('fileLabel').textContent = file.name;
        createZoomSlider();
        window.dispatchEvent(new Event('excelImported'));

    } catch (e) {
        alert('Błąd: ' + e.message);
    }
};

// === TWORZENIE STRONY + KONVA + TRANSFORMER + MULTI-SELECT + WŁASNE SKALOWANIE ===
function createPage(n, prods) {
    const div = document.createElement('div');
    div.className = 'page-container';
    div.style.position = 'relative';

    // === WAŻNE: dopiero teraz tworzymy HTML strony ===
    div.innerHTML = `
  <div class="page-toolbar">
      <span class="page-title">Page ${n}</span>

      <div class="page-tools">
    <button class="page-btn move-up" data-tip="Przenieś stronę wyżej">⬆</button>
<button class="page-btn move-down" data-tip="Przenieś stronę niżej">⬇</button>
<button class="page-btn duplicate" data-tip="Powiel stronę">⧉</button>
<button class="page-btn add" data-tip="Dodaj pustą stronę">＋</button>
<button class="page-btn settings" data-tip="Edytuj stronę">⚙</button>
<button class="page-btn delete" data-tip="Usuń stronę">🗑</button>

</div>

  </div>

  <div class="canvas-wrapper"
       style="width:${W}px;height:${H}px;background:#fff;overflow:hidden;position:relative;">
      <div id="k${n}" style="width:${W}px;height:${H}px;"></div>
      <div class="grid-overlay" id="g${n}"></div>
  </div>
`;


    document.getElementById('pagesContainer').appendChild(div);

    const stage = new Konva.Stage({
        container: `k${n}`,
        width: W,
        height: H
    });

    // (drag priorytet dla zdjęć ustawiany w setupProductImageDrag)

    // (usuniete: ensurePageInteractive - wywolanie bylo zbyt wczesne)
    // === OBRYSY DLA MULTI-SELECT (CANVA STYLE) ===
    function highlightSelection() {
    // Usuń stare obrysy
    page.layer.find('.selectionOutline').forEach(n => n.destroy());

    // Dodaj dla każdego zaznaczonego obiektu
    page.selectedNodes.forEach(node => {
        if (!node) return;
        if (typeof node.isDestroyed === "function" && node.isDestroyed()) return;
        if (node.getAttr && node.getAttr("isBgBlur")) return;
        let box;
        try {
            box = node.getClientRect({ relativeTo: page.layer });
        } catch (e) {
            return;
        }

        const outline = new Konva.Rect({
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            stroke: '#00baff',
            strokeWidth: 1.5,
            dash: [4, 4],
            listening: false,
            name: 'selectionOutline'
        });

        page.layer.add(outline);
        outline.moveToTop();
    });

    page.layer.batchDraw();
}

    // WARSTWA 1: OBIEKTY
    const layer = new Konva.Layer();
    stage.add(layer);
    
// 🔥 TŁO STRONY – MUSI BYĆ NA POCZĄTKU WARSTWY
const bgRect = new Konva.Rect({
    x: 0,
    y: 0,
    width: W,
    height: H,
    fill: "#ffffff",
    listening: true  // 🔥 pozwala na double-click!
});

bgRect.setAttr("isPageBg", true);
layer.add(bgRect);
bgRect.moveToBottom(); // 🔥 zawsze na samym dole!
bgRect.setZIndex(0);
// 🔒 BLOKADA INTERAKCJI DLA TŁA STRONY
bgRect.draggable(false);         
bgRect.listening(true);          
bgRect.name("pageBackground");   
bgRect.setAttr("selectable", false);

// 🔒 uniemożliwiamy skalowanie i zaznaczanie
bgRect.on('mousedown', (e) => {
    // jeśli ktoś kliknie tło, to odznacz wszystkie inne zaznaczenia
    if (!window.globalPasteMode) {
        page.selectedNodes = [];
        page.transformer.nodes([]); // usuwamy uchwyty transformera
        hideFloatingButtons();
        page.layer.batchDraw();
        page.transformerLayer.batchDraw();
    }
});

// 🔒 nigdy nie pozwalaj transformować tła
bgRect.on('transformstart', (e) => e.cancelBubble = true);
bgRect.on('transform', (e) => e.cancelBubble = true);
bgRect.on('transformend', (e) => e.cancelBubble = true);



    // WARSTWA 2: TRANSFORMER
    const transformerLayer = new Konva.Layer();
    stage.add(transformerLayer);

    // TRANSFORMER – DOKŁADNE SKALOWANIE + WIĘCEJ UCHWYTÓW
const tr = new Konva.Transformer({
    hitStrokeWidth: 20,
    padding: 6,

    enabledAnchors: [
        'top-left', 'top-center', 'top-right',
        'middle-left', 'middle-right',
        'bottom-left', 'bottom-center', 'bottom-right'
    ],

    rotateEnabled: true,
    keepRatio: true,   // 🔥 PROPORCJE
    rotationSnaps: [0, 90, 180, 270],
    rotationSnapTolerance: 5,
    borderStroke: '#007cba',
    borderStrokeWidth: 2,
    anchorStroke: '#007cba',
    anchorFill: '#ffffff',
    anchorSize: 12,
    padding: 4,

    boundBoxFunc: (oldBox, newBox) => {
        // 🔥 ograniczamy minimalny rozmiar aby nic się nie "odwróciło"
        if (Math.abs(newBox.width) < 20 || Math.abs(newBox.height) < 20) return oldBox;
        return newBox;
    }
});

tr.anchorDragBoundFunc(function(oldPos, newPos) {
    const anchor = tr.getActiveAnchor();

    // 🟢 Rogi — pełne proporcjonalne skalowanie
    if (
        anchor === 'top-left' ||
        anchor === 'top-right' ||
        anchor === 'bottom-left' ||
        anchor === 'bottom-right'
    ) {
        return newPos;
    }

    // 🔵 Boki — tylko szerokość
    if (anchor === 'middle-left' || anchor === 'middle-right') {
        return {
            x: newPos.x,  // szerokość
            y: oldPos.y   // blokada góra–dół
        };
    }

    // 🔴 Góra/Dół — tylko wysokość
    if (anchor === 'top-center' || anchor === 'bottom-center') {
        return {
            x: oldPos.x,  // blokada lewo–prawo
            y: newPos.y   // wysokość
        };
    }

    return newPos;
});

    transformerLayer.add(tr);

// === MARQUEE SELECTION (ZAZNACZANIE PRZECIĄGANIEM) ===
let marqueeActive = false;
let marqueeStart = null;
let marqueeHadDrag = false;
let marqueeSuppressClickUntil = 0;
let marqueeDragSuppressedNode = null;
let marqueePendingDirectStart = null;

const selectionRect = new Konva.Rect({
    
    fill: 'rgba(0, 160, 255, 0.15)',
    stroke: 'rgba(0, 160, 255, 0.7)',
    strokeWidth: 1,
    visible: false,
    listening: false,   // 🔥 najważniejsze — nie przechwytuje kliknięć!
    name: 'selectionRect'
    
});
layer.add(selectionRect);


stage.on('mousedown.marquee', (e) => {
    const rawTarget = e.target;
    const targetIsBg = (rawTarget === stage) || (!!(rawTarget && rawTarget.getAttr) && rawTarget.getAttr("isPageBg") === true);
    let directStartNode = null;
    if (!targetIsBg && rawTarget && rawTarget.getAttr) {
        let candidate = rawTarget;
        const parent = candidate.getParent ? candidate.getParent() : null;
        if (parent && parent.getAttr && parent.getAttr("isPriceGroup")) candidate = parent;
        const directId = String(candidate.getAttr("directModuleId") || "").trim();
        const candidateParent = candidate.getParent ? candidate.getParent() : null;
        const insideUserGroup = !!(candidateParent && candidateParent.getAttr && candidateParent.getAttr("isUserGroup"));
        if (directId && !insideUserGroup) {
            const selectedNow = Array.isArray(page.selectedNodes) ? page.selectedNodes : [];
            const alreadySelected =
                selectedNow.includes(candidate) ||
                selectedNow.includes(rawTarget) ||
                (rawTarget && rawTarget.getParent && selectedNow.includes(rawTarget.getParent()));
            // Jeśli element direct jest już zaznaczony, pozwól normalnie go przeciągać.
            if (alreadySelected && !(e.evt && e.evt.shiftKey)) return;
            directStartNode = candidate;
        }
    }

    // standardowo start tylko z tła, ale dla rozgrupowanych modułów direct
    // pozwalamy startować marquee także z elementu.
    if (!targetIsBg && !directStartNode) return;

    marqueeHadDrag = false;
    marqueeDragSuppressedNode = null;
    marqueePendingDirectStart = null;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Dla direct-start nie uruchamiamy marquee od razu (bo psuje zwykły klik/zaznaczenie).
    // Najpierw czekamy na realny ruch myszy; wtedy dopiero aktywujemy prostokąt zaznaczenia.
    if (directStartNode) {
        if (typeof directStartNode.draggable === "function") {
            marqueeDragSuppressedNode = {
                node: directStartNode,
                draggable: !!directStartNode.draggable()
            };
            if (marqueeDragSuppressedNode.draggable) {
                directStartNode.draggable(false);
            }
        }
        marqueePendingDirectStart = { x: pointer.x, y: pointer.y };
        marqueeStart = { x: pointer.x, y: pointer.y };
        return;
    }

    marqueeActive = true;
    marqueeStart = { x: pointer.x, y: pointer.y };
    if (!marqueeStart) {
        marqueeActive = false;
        if (marqueeDragSuppressedNode && marqueeDragSuppressedNode.node && typeof marqueeDragSuppressedNode.node.draggable === "function") {
            marqueeDragSuppressedNode.node.draggable(!!marqueeDragSuppressedNode.draggable);
        }
        marqueeDragSuppressedNode = null;
        marqueePendingDirectStart = null;
        return;
    }
selectionRect.moveToTop();
    selectionRect.setAttrs({
        x: marqueeStart.x,
        y: marqueeStart.y,
        width: 0,
        height: 0,
        visible: true
        
    });

    page.selectedNodes = [];
page.transformer.nodes([]);
page.layer.find('.selectionOutline').forEach(n => n.destroy());
page.layer.batchDraw();
floatingButtons?.remove();
    disableCropMode(page);


});

stage.on('mousemove.marquee', () => {
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (!marqueeActive && marqueePendingDirectStart) {
        const dx = Math.abs(pos.x - marqueePendingDirectStart.x);
        const dy = Math.abs(pos.y - marqueePendingDirectStart.y);
        if (dx <= 3 && dy <= 3) return;

        marqueeActive = true;
        marqueeHadDrag = true;
        marqueeStart = { x: marqueePendingDirectStart.x, y: marqueePendingDirectStart.y };
        marqueePendingDirectStart = null;

        selectionRect.moveToTop();
        selectionRect.setAttrs({
            x: marqueeStart.x,
            y: marqueeStart.y,
            width: 0,
            height: 0,
            visible: true
        });

        page.selectedNodes = [];
        page.transformer.nodes([]);
        page.layer.find('.selectionOutline').forEach(n => n.destroy());
        page.layer.batchDraw();
        floatingButtons?.remove();
        disableCropMode(page);
    }

    if (!marqueeActive) return;
    if (!marqueeStart) return;
    if (Math.abs(pos.x - marqueeStart.x) > 3 || Math.abs(pos.y - marqueeStart.y) > 3) {
        marqueeHadDrag = true;
    }

    selectionRect.setAttrs({
        x: Math.min(pos.x, marqueeStart.x),
        y: Math.min(pos.y, marqueeStart.y),
        width: Math.abs(pos.x - marqueeStart.x),
        height: Math.abs(pos.y - marqueeStart.y)
    });
    selectionRect.moveToTop();  // 🔥 DODAJ TO
    layer.batchDraw();
});

stage.on('mouseup.marquee', () => {
    if (!marqueeActive && marqueePendingDirectStart) {
        if (marqueeDragSuppressedNode && marqueeDragSuppressedNode.node && typeof marqueeDragSuppressedNode.node.draggable === "function") {
            marqueeDragSuppressedNode.node.draggable(!!marqueeDragSuppressedNode.draggable);
        }
        marqueeDragSuppressedNode = null;
        marqueePendingDirectStart = null;
        marqueeStart = null;
        marqueeHadDrag = false;
        return;
    }
    if (!marqueeActive) return;
    marqueeActive = false;
    if (marqueeDragSuppressedNode && marqueeDragSuppressedNode.node && typeof marqueeDragSuppressedNode.node.draggable === "function") {
        marqueeDragSuppressedNode.node.draggable(!!marqueeDragSuppressedNode.draggable);
    }
    marqueeDragSuppressedNode = null;
    marqueePendingDirectStart = null;
    if (marqueeHadDrag) marqueeSuppressClickUntil = Date.now() + 180;

    // Upewnij się, że wszystkie elementy produktu mają slotIndex
    const boxesForSlots = page.layer.find(n => n.getAttr && n.getAttr("isBox"));
    if (boxesForSlots.length) {
        page.layer.children.forEach(n => {
            if (n === bgRect || n === selectionRect) return;
            if (n.getAttr && n.getAttr("isBgBlur")) return;
            if (!n.getAttr || Number.isFinite(n.getAttr("slotIndex"))) return;
            const eligible =
                n instanceof Konva.Text ||
                n instanceof Konva.Image ||
                n instanceof Konva.Group;
            if (!eligible) return;
            const nRect = n.getClientRect({ relativeTo: page.layer });
            const match = boxesForSlots.find(b => {
                const bRect = b.getClientRect({ relativeTo: page.layer });
                return Konva.Util.haveIntersection(nRect, bRect);
            });
            if (match) n.setAttr("slotIndex", match.getAttr("slotIndex"));
        });
    }

    const area = selectionRect.getClientRect({ relativeTo: page.layer });

let nodes = page.layer.children.filter(node => {
    // Pomijamy tło strony i sam prostokąt zaznaczania
    if (node === bgRect || node.getAttr("isPageBg")) return false;
    if (node === selectionRect) return false;
    if (node.getAttr && (node.getAttr("isBgBlur") || node.getAttr("isFxHelper"))) return false;
    if (typeof node.isDestroyed === "function" && node.isDestroyed()) return false;

    // Wszystko inne co jest draggable lub tekst/obraz/box
    if (
    node instanceof Konva.Group ||        // 🔥 DODANE
    node.draggable() ||
    node instanceof Konva.Text ||
    node instanceof Konva.Image ||
    node instanceof Konva.Rect
) {

        let box;
        try {
            box = node.getClientRect({ relativeTo: page.layer });
        } catch (e) {
            return false;
        }
        return Konva.Util.haveIntersection(area, box);
    }
    return false;
});
    nodes = normalizeSelection(nodes);
    nodes = expandSelectionForDirectModules(nodes, page.layer);

    selectionRect.visible(false);

    // USUŃ STARE OBRYSY
    page.layer.find(".selectionOutline").forEach(n => n.destroy());

    if (page._cropMode && (nodes.length !== 1 || nodes[0] !== page._cropTarget)) {
        disableCropMode(page);
    }

    if (nodes.length > 0) {
        page.selectedNodes = nodes;
        const singleImage = (nodes.length === 1 && nodes[0] instanceof Konva.Image);
        if (singleImage) {
            enableCropMode(page, nodes[0]);
        } else {
            disableCropMode(page);
            page.transformer.nodes(nodes);
        }
        
        highlightSelection();
        showFloatingButtons();
    } else {
        page.selectedNodes = [];
        page.transformer.nodes([]);
        hideFloatingButtons();
    }

    page.layer.batchDraw();
    page.transformerLayer.batchDraw();

    setTimeout(() => {
        marqueeStart = null;
        selectionRect.visible(false);
        page.layer.batchDraw();
    }, 50);
});

    // === TWORZENIE OBIEKTU STRONY ===
const page = {
    number: n,
    products: prods,
    stage: stage,
    layer: layer,
    transformerLayer: transformerLayer,
    container: div,
    transformer: tr,

    slotObjects: Array(prods.length).fill(null),
    barcodeObjects: Array(prods.length).fill(null),
    barcodePositions: Array(prods.length).fill(null),
    textPositions: [],
    boxScales: Array(prods.length).fill(null),

    selectedNodes: [],
    _oldTransformBox: null,

    settings: {
        nameSize: 12,
        indexSize: 14,
        priceSize: Math.round(
            24 * (window.LAYOUT_MODE === "layout6"
                ? PRICE_SIZE_MULTIPLIER_LAYOUT6
                : PRICE_SIZE_MULTIPLIER_LAYOUT8)
        ),
        fontFamily: 'Arial',
        textColor: '#000000',
        bannerUrl: null,
        currency: 'gbp',
        pageBgColor: '#ffffff'
    }
};

    // === PODGLĄD KĄTA OBRACANIA (CANVA STYLE) ===
    const rotationUI = createRotationLabel(layer);
    page.rotationUI = rotationUI;

    const updateRotationLabel = () => {
        const nodes = tr.nodes();
        if (!nodes || nodes.length === 0) return;
        const target = nodes[0];
        const box = target.getClientRect({ relativeTo: layer });
        const angle = Math.round(((target.rotation() % 360) + 360) % 360);

        rotationUI.text.text(angle + "°");
        rotationUI.label.position({
            x: box.x + box.width / 2,
            y: box.y - 40
        });
        rotationUI.label.visible(true);
        rotationUI.label.opacity(1);
        rotationUI.label.moveToTop();
        layer.batchDraw();
    };

    tr.on("transformstart", () => {
        if (tr.getActiveAnchor && tr.getActiveAnchor() !== "rotater") return;
        updateRotationLabel();
    });

    tr.on("transform", () => {
        if (tr.getActiveAnchor && tr.getActiveAnchor() !== "rotater") return;
        updateRotationLabel();
    });

    tr.on("transformend", () => {
        const label = rotationUI?.label;
        if (!label || (label.isDestroyed && label.isDestroyed()) || !label.getLayer || !label.getLayer()) {
            return;
        }

        label.to({
            opacity: 0,
            duration: 0.2,
            onFinish: () => {
                if (!label.isDestroyed || !label.isDestroyed()) {
                    label.visible(false);
                }
            }
        });
    });



    // === PEŁNE DRAG & DROP PO CAŁEJ STRONIE ===
    stage.container().style.touchAction = 'none';
    stage.on('dragover', e => e.evt.preventDefault());
    // === OBSŁUGA PRZECIĄGANIA ZDJĘĆ Z PULPITU NA STRONĘ (IMPORT Z SYSTEMU) ===
stage.container().addEventListener('dragover', (e) => {
  e.preventDefault();
  stage.container().style.border = "2px dashed #007cba";
});

stage.container().addEventListener('dragleave', () => {
  stage.container().style.border = "none";
});

stage.container().addEventListener('drop', (e) => {
  e.preventDefault();
  stage.container().style.border = "none";

  const file = e.dataTransfer.files[0];
  if (!file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();

  reader.onload = (ev) => {
      Konva.Image.fromURL(ev.target.result, (img) => {

          const pos = stage.getPointerPosition();
          img.x(pos.x);
          img.y(pos.y);

          const maxWidth = W * 0.6;
          const scale = Math.min(maxWidth / img.width(), 1);

          img.scale({ x: scale, y: scale });
          img.draggable(true);
          img.listening(true);

          img.setAttrs({
            isProductImage: true,
            slotIndex: null,
            originalSrc: ev.target.result
        });
        
        // 🔥 KROK 3 — dodajemy nazwę obiektu, aby działał transform, multi-select i menu warstw
        img.name("droppedImage");
        
        // ustawienia: w pełni edytowalne, tak jak wszystkie obiekty
        img.draggable(true);
        img.listening(true);
        
        layer.add(img);
        
        
        layer.batchDraw();
        page.transformerLayer.batchDraw(); // ważne dla transformera
        
      });
  };

  reader.readAsDataURL(file);
});
// === ANIMACJA DRAG & DROP — CANVA STYLE ===
stage.on('dragstart', (e) => {
    const node = e.target;
    if (!node.draggable()) return;

    // jeśli box łapie drag, a zaznaczony jest obraz — przenieś drag na obraz
    const selectedImage =
        page.selectedNodes &&
        page.selectedNodes.length === 1 &&
        page.selectedNodes[0] instanceof Konva.Image &&
        page.selectedNodes[0].getAttr("isProductImage")
            ? page.selectedNodes[0]
            : null;
    if (node.getAttr("isBox") && selectedImage) {
        node.stopDrag();
        if (selectedImage.draggable() && typeof selectedImage.startDrag === 'function') {
            selectedImage.startDrag();
        }
        return;
    }

    // 🔥 TYLKO DLA BOXÓW
    if (node.getAttr("isBox")) {
        node._shadowBackup = {
            blur: node.shadowBlur(),
            offsetX: node.shadowOffsetX(),
            offsetY: node.shadowOffsetY(),
            opacity: node.shadowOpacity()
        };

        // 🔥 zostawiamy delikatny cień nawet podczas drag
node.shadowBlur(6);
node.shadowOffset({ x: 0, y: 3 });
node.shadowOpacity(0.35);

    }

    node.startX = node.x();
    node.startY = node.y();

    stage.container().style.cursor = 'grabbing';
});

// === DRAG CALEJ GRUPY USERGROUP (takze przy kliknieciu dziecka) ===
stage.on('mousedown.userGroupDrag touchstart.userGroupDrag', (e) => {
    if (window.isEditingText) return;
    if (e.evt && e.evt.shiftKey) return;
    document.activeStage = stage;

    let target = e.target;
    let userGroup = null;
    while (target && target !== stage) {
        if (target.getAttr && target.getAttr("isUserGroup")) {
            userGroup = target;
            break;
        }
        target = target.getParent ? target.getParent() : null;
    }
    if (!userGroup || typeof userGroup.startDrag !== 'function') return;
    if (!userGroup.draggable || !userGroup.draggable()) return;

    page.selectedNodes = [userGroup];
    disableCropMode(page);
    page.transformer.nodes([userGroup]);
    highlightSelection();
    showFloatingButtons();

    if (!userGroup.isDragging || !userGroup.isDragging()) {
        userGroup.startDrag();
    }
});


stage.on('dragmove', () => {
    stage.batchDraw(); // 🚀 turbo płynność
});

stage.on('dragend', (e) => {
    page.layer.find('.selectionOutline').forEach(n => n.destroy());
    

    const node = e.target;
    if (!node.draggable()) return;

    // 🔥 PRZYWRÓCENIE CIENIA DLA BOXA
    if (node.getAttr("isBox") && node._shadowBackup) {
        node.shadowBlur(node._shadowBackup.blur);
        node.shadowOffset({
            x: node._shadowBackup.offsetX,
            y: node._shadowBackup.offsetY
        });
        node.shadowOpacity(node._shadowBackup.opacity);

        delete node._shadowBackup;
    }

    stage.container().style.cursor = 'grab';
    node.getLayer().batchDraw();
});



    // === NOWE PRZYCISKI NA GÓRZE STRONY (NOWY PANEL) ===
const toolbar = div.querySelector(".page-toolbar");

const btnUp       = toolbar.querySelector(".move-up");
const btnDown     = toolbar.querySelector(".move-down");
const btnDuplicate = toolbar.querySelector(".duplicate");
const btnAdd      = toolbar.querySelector(".add");
const btnDelete   = toolbar.querySelector(".delete");
const btnSettings = toolbar.querySelector(".settings");

btnSettings.onclick = (e) => {
    e.stopPropagation();

    // Jeśli to okładka → blokujemy edycję
    if (page.isCover) {
        alert("Edycja okładki jest osobnym modułem.");
        return;
    }

    // Uruchomienie panelu edycji strony
    if (typeof window.openPageEdit === "function") {
        window.openPageEdit(page);
    } else {
        console.error("Brak funkcji openPageEdit!");
    }
};



// ⬆ przesuwanie strony w górę
btnUp.onclick = () => {
    movePage(page, -1);
};

// ⬇ przesuwanie strony w dół
btnDown.onclick = () => {
    movePage(page, +1);
};

// ⧉ duplikuj stronę
btnDuplicate.onclick = () => {
    if (typeof window.createEmptyPageUnder === "function") {
        window.createEmptyPageUnder(page);
    } else {
        alert("Brak funkcji duplikowania strony.");
    }
};

// ＋ dodaj pustą stronę POD aktualną
btnAdd.onclick = () => {
    if (typeof window.createEmptyPageUnder === "function") {
        window.createEmptyPageUnder(page);
    } else {
        alert("Brak funkcji dodawania strony.");
    }
};

// 🗑 usuń stronę
btnDelete.onclick = () => {
    if (confirm("Czy na pewno chcesz usunąć tę stronę?")) {
        window.deletePage(page);
    }
};

    // === KOPIOWANIE + WKLEJANIE + MENU WARSTW ===
    let floatingButtons = null;
    let groupQuickMenu = null;
    function getGroupableSelection() {
      const normalized = normalizeSelection(page.selectedNodes).filter(n =>
        n &&
        n !== bgRect &&
        n !== selectionRect &&
        !(n.getAttr && n.getAttr("isPageBg"))
      );

      return normalized.filter(n =>
        !normalized.some(other =>
          other !== n &&
          typeof n.isDescendantOf === "function" &&
          n.isDescendantOf(other)
        )
      );
    }

    function groupSelectedNodes() {
      const nodes = getGroupableSelection();
      if (nodes.length < 2) return;

      const sortedNodes = [...nodes].sort((a, b) => a.getZIndex() - b.getZIndex());
      const minZ = Math.min(...sortedNodes.map(n => n.getZIndex()));

      const group = new Konva.Group({
        draggable: true,
        listening: true,
        name: "userGroup"
      });
      group.setAttrs({
        isUserGroup: true,
        selectable: true
      });

      layer.add(group);
      group.setZIndex(minZ);

      sortedNodes.forEach(node => {
        const abs = node.getAbsolutePosition();
        // W grupie przeciągamy całość, nie pojedyncze dzieci.
        node.setAttr("_wasDraggableBeforeUserGroup", node.draggable());
        node.draggable(false);
        node.moveTo(group);
        node.absolutePosition(abs);
      });

      page.selectedNodes = [group];
      disableCropMode(page);
      page.transformer.nodes([group]);
      highlightSelection();
      layer.batchDraw();
      transformerLayer.batchDraw();
      window.dispatchEvent(new CustomEvent('canvasModified', { detail: stage }));
      showFloatingButtons();
    }

    function ungroupSelectedNodes() {
      const groups = normalizeSelection(page.selectedNodes).filter(n =>
        n instanceof Konva.Group && n.getAttr("isUserGroup")
      );
      if (!groups.length) return;

      const newSelection = [];
      groups.forEach(group => {
        const parent = group.getParent();
        if (!parent) return;

        const groupZ = group.getZIndex();
        const children = Array.from(group.getChildren());

        children.forEach((child, idx) => {
          const abs = child.getAbsolutePosition();
          child.moveTo(parent);
          child.absolutePosition(abs);
          child.setZIndex(groupZ + idx);
          const prevDraggable = child.getAttr("_wasDraggableBeforeUserGroup");
          child.draggable(typeof prevDraggable === "boolean" ? prevDraggable : true);
          child.setAttr("_wasDraggableBeforeUserGroup", null);
          newSelection.push(child);
        });

        group.destroy();
      });

      page.selectedNodes = normalizeSelection(newSelection);
      disableCropMode(page);
      page.transformer.nodes(page.selectedNodes);
      highlightSelection();
      layer.batchDraw();
      transformerLayer.batchDraw();
      window.dispatchEvent(new CustomEvent('canvasModified', { detail: stage }));
      showFloatingButtons();
    }

    page.groupSelectedNodes = groupSelectedNodes;
    page.ungroupSelectedNodes = ungroupSelectedNodes;

    function positionFloatingMenu(menuEl) {
      if (!menuEl) return;
      const header = document.querySelector('.header-bar');
      if (!page || !page.container) return;
      const wrap =
        page.container.querySelector('.page-zoom-wrap') ||
        page.container.querySelector('.canvas-wrapper') ||
        page.container;
      const rect = wrap.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      let top = Math.max(12, rect.top - menuEl.offsetHeight - 12);
      if (header) {
        const h = header.getBoundingClientRect();
        // przypnij do górnego paska, wyśrodkuj w jego wysokości
        top = Math.max(h.top + 6, h.top + (h.height - menuEl.offsetHeight) / 2);
      }
      menuEl.style.left = `${centerX}px`;
      menuEl.style.top = `${top}px`;
      menuEl.style.transform = 'translateX(-50%)';
    }

    function positionSubmenuMenu(submenuEl) {
      if (!submenuEl) return;
      const floating = document.getElementById('floatingMenu');
      if (floating) {
        const fRect = floating.getBoundingClientRect();
        submenuEl.style.left = `${fRect.left + fRect.width / 2}px`;
        submenuEl.style.top = `${fRect.bottom + 8}px`;
        submenuEl.style.transform = 'translateX(-50%)';
        return;
      }
      if (!page || !page.container) return;
      const wrap =
        page.container.querySelector('.page-zoom-wrap') ||
        page.container.querySelector('.canvas-wrapper') ||
        page.container;
      const rect = wrap.getBoundingClientRect();
      const header = document.querySelector('.header-bar');
      const top = header
        ? Math.max(12, header.getBoundingClientRect().bottom + 8)
        : Math.max(12, rect.top + 12);
      submenuEl.style.left = `${rect.left + rect.width / 2}px`;
      submenuEl.style.top = `${top}px`;
      submenuEl.style.transform = 'translateX(-50%)';
    }

    function removeGroupQuickMenu() {
      if (!groupQuickMenu) return;
      if (groupQuickMenu._posHandler) {
        window.removeEventListener('scroll', groupQuickMenu._posHandler, true);
        window.removeEventListener('resize', groupQuickMenu._posHandler);
      }
      groupQuickMenu.remove();
      groupQuickMenu = null;
    }

    function getSelectionViewportRect() {
      const selected = normalizeSelection(page.selectedNodes);
      if (!selected || selected.length === 0) return null;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      selected.forEach((n) => {
        if (!n || !n.getClientRect) return;
        const r = n.getClientRect({ relativeTo: page.layer });
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
      });

      if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

      const wrap =
        page.container.querySelector('.page-zoom-wrap') ||
        page.container.querySelector('.canvas-wrapper') ||
        page.container;
      const wrapRect = wrap.getBoundingClientRect();
      const scaleX = wrapRect.width / Math.max(1, page.stage.width());
      const scaleY = wrapRect.height / Math.max(1, page.stage.height());

      return {
        left: wrapRect.left + minX * scaleX,
        top: wrapRect.top + minY * scaleY,
        width: (maxX - minX) * scaleX,
        height: (maxY - minY) * scaleY
      };
    }

    function positionGroupQuickMenu(menuEl) {
      if (!menuEl) return;
      const sel = getSelectionViewportRect();
      if (!sel) return;
      const centerX = sel.left + sel.width / 2;
      const top = Math.max(12, sel.top - menuEl.offsetHeight - 10);
      menuEl.style.left = `${centerX}px`;
      menuEl.style.top = `${top}px`;
      menuEl.style.transform = 'translateX(-50%)';
    }

    function renderGroupQuickMenu() {
      const normalizedSelection = normalizeSelection(page.selectedNodes);
      const canGroup = normalizedSelection.length > 1;
      const canUngroup =
        normalizedSelection.length === 1 &&
        normalizedSelection[0] instanceof Konva.Group &&
        normalizedSelection[0].getAttr("isUserGroup");

      if (!canGroup && !canUngroup) {
        removeGroupQuickMenu();
        return;
      }

      removeGroupQuickMenu();

      const quick = document.createElement('div');
      quick.id = 'groupQuickMenu';
      quick.style.cssText = `
        position: fixed;
        z-index: 100001;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.98);
        border: 1px solid #d7dde8;
        box-shadow: 0 6px 20px rgba(15,23,42,0.18);
        backdrop-filter: blur(6px);
      `;
      quick.innerHTML = `
        <button class="group-quick-btn" data-action="${canUngroup ? "ungroup" : "group"}">
          ${canUngroup ? "Rozgrupuj" : "Grupuj"}
        </button>
      `;
      document.body.appendChild(quick);
      groupQuickMenu = quick;

      const posHandler = () => {
        if (!groupQuickMenu) return;
        positionGroupQuickMenu(groupQuickMenu);
      };
      groupQuickMenu._posHandler = posHandler;
      requestAnimationFrame(posHandler);
      setTimeout(posHandler, 20);
      window.addEventListener('scroll', posHandler, true);
      window.addEventListener('resize', posHandler);

      const quickBtn = quick.querySelector('.group-quick-btn');
      if (quickBtn) {
        quickBtn.onclick = (ev) => {
          ev.stopPropagation();
          if (canUngroup) ungroupSelectedNodes();
          else groupSelectedNodes();
          setTimeout(() => showFloatingButtons(), 0);
        };
      }
    }

    function showFloatingButtons() {
      // jeśli menu już istnieje – usuń je
      if (floatingButtons) {
          if (floatingButtons._posHandler) {
              window.removeEventListener('scroll', floatingButtons._posHandler, true);
              window.removeEventListener('resize', floatingButtons._posHandler);
          }
          floatingButtons.remove();
          floatingButtons = null;
      }
  
      const btnContainer = document.createElement('div');
      btnContainer.id = 'floatingMenu';
      btnContainer.style.cssText = `
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 99999;
          display: flex;
          gap: 10px;
          background: rgba(255,255,255,0.96);
          padding: 10px 14px;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.18);
          border: 1px solid #e6e6e6;
          pointer-events: auto;
          font-size: 14px;
          font-weight: 500;
          backdrop-filter: blur(6px);
      `;
  
  
      btnContainer.innerHTML = `
          <button class="fab-btn fab-copy" data-action="copy"><i class="fas fa-copy"></i>Kopiuj</button>
          <button class="fab-btn fab-stylecopy" data-action="stylecopy"><i class="fas fa-paint-brush"></i>Kopiuj styl</button>
          <button class="fab-btn fab-cut" data-action="cut"><i class="fas fa-cut"></i>Wytnij</button>
          <button class="fab-btn fab-delete" data-action="delete"><i class="fas fa-trash"></i>Usuń</button>
          <button class="fab-btn fab-front" data-action="front"><i class="fas fa-layer-group"></i>Na wierzch</button>
          <button class="fab-btn fab-back" data-action="back"><i class="fas fa-layer-group"></i>Na spód</button>
          <button class="fab-btn fab-removebg" data-action="removebg"><i class="fas fa-eraser"></i>Usuń tło</button>
          <button class="fab-btn fab-effects" data-action="effects" title="Efekty zdjęcia"><i class="fas fa-magic"></i>Efekty zdjęcia</button>
          <button class="fab-btn fab-barcolor" data-action="barcolor"><i class="fas fa-barcode"></i>Kolor kodu</button>

      `;
  
      document.body.appendChild(btnContainer);
      floatingButtons = btnContainer;

      renderGroupQuickMenu();

      // jeśli zaznaczono pojedynczy tekst — pokaż toolbar tekstu
      const singleText =
          (page.selectedNodes.length === 1 &&
          page.selectedNodes[0] instanceof Konva.Text &&
          !(page.selectedNodes[0].getParent && page.selectedNodes[0].getParent().getAttr("isPriceGroup")));
      if (singleText) {
          window.showTextToolbar?.(page.selectedNodes[0]);
          setTimeout(() => window.showTextToolbar?.(page.selectedNodes[0]), 0);
          window.hideTextPanel?.();
      } else {
          window.hideTextToolbar?.();
      }

      // pozycjonowanie względem aktualnej strony roboczej
      const posHandler = () => {
          if (!floatingButtons) return;
          positionFloatingMenu(floatingButtons);
          if (groupQuickMenu) positionGroupQuickMenu(groupQuickMenu);
          const submenuEl = document.getElementById('floatingSubmenu');
          if (submenuEl && submenuEl.style.display !== 'none') {
              positionSubmenuMenu(submenuEl);
          }
      };
      floatingButtons._posHandler = posHandler;
      requestAnimationFrame(posHandler);
      setTimeout(posHandler, 50);
      window.addEventListener('scroll', posHandler, true);
      window.addEventListener('resize', posHandler);
  
      // obsługa akcji
      btnContainer.querySelectorAll('.fab-btn').forEach(btn => {
          btn.onclick = (ev) => {
              ev.stopPropagation();
              const action = btn.dataset.action;
              page.selectedNodes = normalizeSelection(page.selectedNodes);

              if (action === 'group') {
                  groupSelectedNodes();
                  return;
              }
              if (action === 'ungroup') {
                  ungroupSelectedNodes();
                  return;
              }

const obj = page.selectedNodes[0];
if (!obj) return;
  
 if (action === 'copy') {

    const nodes = normalizeSelection(page.selectedNodes);

    window.globalClipboard = nodes.map(n => {
        const clone = n.clone({ draggable: true, listening: true });
        clone.getChildren?.().forEach(c => c.listening(true));
        return clone;
    });

    window.globalPasteMode = true;
    pages.forEach(p => p.stage.container().style.cursor = 'copy');
}

              if (action === 'stylecopy') {
    const source = normalizeSelection(page.selectedNodes)[0];
    if (!source) return;

    const style = extractNodeStyle(source);
    if (!style) {
        alert("Tego typu elementu nie można skopiować stylem.");
        return;
    }

    window.globalStyleClipboard = style;
    window.globalStylePasteMode = true;
    pages.forEach(p => p.stage.container().style.cursor = 'copy');
}

              if (action === 'cut') {
    if (page.selectedNodes.length > 0) {
        // 📌 zapisujemy WSZYSTKIE zaznaczone obiekty do schowka
        window.globalClipboard = page.selectedNodes.map(n => {
    const clone = n.clone({ listening: true, draggable: true });
    clone.getChildren?.().forEach(c => c.listening(true));
    return clone;
});

        window.globalPasteMode = true;

        // 📌 kasujemy wszystkie zaznaczone elementy na stronie
        page.selectedNodes.forEach(n => {
            clearCatalogSlotStateForNode(page, n);
            n.destroy();
        });
        page.selectedNodes = [];
    } else if (obj) {
        // fallback gdy przypadkiem jest tylko jeden obiekt
        window.globalClipboard = [obj.clone()];
        clearCatalogSlotStateForNode(page, obj);
        obj.destroy();
    }

    // 📌 czyścimy transformera — nic nie jest już zaznaczone
    page.transformer.nodes([]);
    layer.batchDraw();
    transformerLayer.batchDraw();
}

              if (action === 'delete') {
    if (page.selectedNodes.length > 0) {
        page.selectedNodes.forEach(n => {
            clearCatalogSlotStateForNode(page, n);
            n.destroy();
        });
        page.selectedNodes = [];
    } else {
        clearCatalogSlotStateForNode(page, obj);
        obj.destroy();
    }

    page.transformer.nodes([]);
    layer.batchDraw();
    transformerLayer.batchDraw();
}

              // ⭐ Pobieramy wszystkie elementy tła
const backgrounds = page.layer.find(n =>
    n.getAttr("isPageBg") === true ||
    n.getAttr("isPageColor") === true
);

// najwyższy indeks tła — poniżej NIE schodzimy!
let lowestAllowedZ = 0;
if (backgrounds.length) {
    lowestAllowedZ = Math.max(...backgrounds.map(b => b.getZIndex()));
}

// 🚀 Na wierzch — jak dawniej
if (action === 'front') {
    obj.moveToTop();
    page.transformer.nodes([obj]);
}

// 🚀 Na spód — ale zawsze NAD tłem strony!
if (action === 'back') {
    const bg = page.layer.findOne(n => n.getAttr("isPageBg") === true);
    const bgZ = bg ? bg.getZIndex() : 0;

    // 🔥 Obiekt NIE może zejść niżej niż tło
    let targetZ = bgZ + 1;

    // Jeśli to obraz, trzymaj go NAD boxem,
    // żeby box nie przejmował kliknięć/resize po "Na spód".
    if (obj instanceof Konva.Image && obj.getAttr && obj.getAttr("isProductImage")) {
        let box = null;
        const slot = obj.getAttr && obj.getAttr("slotIndex");
        if (Number.isFinite(slot)) {
            box = page.layer.findOne(n =>
                n.getAttr &&
                n.getAttr("isBox") &&
                n.getAttr("slotIndex") === slot
            );
        }
        // fallback: szukaj boxa po przecięciu (gdy slotIndex jest pusty)
        if (!box) {
            const objRect = obj.getClientRect({ relativeTo: page.layer });
            box = page.layer.find(n => {
                if (!n.getAttr || !n.getAttr("isBox")) return false;
                const bRect = n.getClientRect({ relativeTo: page.layer });
                return Konva.Util.haveIntersection(objRect, bRect);
            });
        }
        if (box) {
            targetZ = Math.max(targetZ, box.getZIndex() + 1);
        }
    }

    obj.setZIndex(targetZ);

    page.transformer.nodes([obj]);
    page.layer.batchDraw();
    page.transformerLayer.batchDraw();
}


page.layer.batchDraw();
page.transformerLayer.batchDraw();

  
              if (action === 'removebg') {
    if (!(obj instanceof Konva.Image))
        return alert("To nie jest obraz.");

    // ZAPISZ aktualne parametry obrazu
    const oldX = obj.x();
    const oldY = obj.y();
    const oldWidth = obj.width();
    const oldHeight = obj.height();
    const oldScaleX = obj.scaleX();
    const oldScaleY = obj.scaleY();
    const oldRotation = obj.rotation();
    const oldSlot = obj.getAttr("slotIndex");
    const oldOffsetX = obj.offsetX ? obj.offsetX() : 0;
    const oldOffsetY = obj.offsetY ? obj.offsetY() : 0;
    const oldAttrs = obj.getAttrs ? { ...obj.getAttrs() } : {};

    const originalUrl = obj.toDataURL();

    removeBackgroundAI(originalUrl, cleaned => {

        Konva.Image.fromURL(cleaned, newImg => {

            // 🔥 PRZYWRÓĆ IDENTYCZNE PARAMETRY
            newImg.x(oldX);
            newImg.y(oldY);
            newImg.width(oldWidth);
            newImg.height(oldHeight);
            newImg.scaleX(oldScaleX);
            newImg.scaleY(oldScaleY);
            newImg.rotation(oldRotation);
            if (newImg.offsetX) newImg.offsetX(oldOffsetX);
            if (newImg.offsetY) newImg.offsetY(oldOffsetY);

            newImg.draggable(true);
            newImg.listening(true);

            newImg.setAttrs({
                ...oldAttrs,
                x: oldX,
                y: oldY,
                width: oldWidth,
                height: oldHeight,
                scaleX: oldScaleX,
                scaleY: oldScaleY,
                rotation: oldRotation,
                isProductImage: true,
                slotIndex: oldSlot,
                originalSrc: cleaned,
                originalSrcBeforeRmbg: oldAttrs.originalSrc || originalUrl
            });

            obj.destroy();
            layer.add(newImg);
            newImg.moveToTop();
            setupProductImageDrag(newImg, layer);
            if (page && page.transformer && page.transformer.nodes) page.transformer.nodes([newImg]);
            if (Array.isArray(page.selectedNodes)) page.selectedNodes = [newImg];

            layer.batchDraw();
            page.transformerLayer.batchDraw();
        });
    });
}
if (action === 'barcolor') {
    const barcode = page.selectedNodes[0];
    if (!barcode || !barcode.getAttr("isBarcode"))
        return alert("Zaznacz kod kreskowy!");

    window.showSubmenu(`
        <button class="colorBtn" data-color="#000000" style="width:32px;height:32px;border-radius:6px;border:none;background:#000;"></button>
        <button class="colorBtn" data-color="#ffffff" style="width:32px;height:32px;border-radius:6px;border:1px solid #aaa;background:#fff;"></button>
        <button class="colorBtn" data-color="#FFD700" style="width:32px;height:32px;border-radius:6px;border:none;background:#FFD700;"></button>
        <input type="color" id="colorPicker" style="width:38px;height:32px;border:none;padding:0;margin-left:8px;">
        <button id="applyColorBtn"
            style="
                padding:8px 14px;
                border-radius:8px;
                border:none;
                background:#007cba;
                color:#fff;
                font-weight:600;
                cursor:pointer;
            ">
            Zastosuj
        </button>
    `);

    let previewColor = null;

    document.querySelectorAll(".colorBtn").forEach(btn => {
        btn.onclick = () => {
            previewColor = btn.dataset.color;
            window.recolorBarcode(barcode, previewColor, false);
        };
    });

    document.getElementById("colorPicker").oninput = (e) => {
        previewColor = e.target.value;
        window.recolorBarcode(barcode, previewColor, false);
    };

    document.getElementById("applyColorBtn").onclick = () => {
        if (!previewColor) return window.hideSubmenu();
        window.recolorBarcode(barcode, previewColor, true);
        window.hideSubmenu();
    };
}

              if (action === 'effects') {
    const img = page.selectedNodes[0];
    const isEligible =
        img instanceof Konva.Image &&
        !img.getAttr("isBarcode") &&
        !img.getAttr("isQRCode") &&
        !img.getAttr("isEAN") &&
        !img.getAttr("isTNZBadge") &&
        !img.getAttr("isCountryBadge") &&
        !img.getAttr("isOverlayElement") &&
        !img.getAttr("isBgBlur");

    if (!isEligible) return alert("Zaznacz zdjęcie, aby użyć efektów.");
    openImageEffectsMenu(img);
}

  
              layer.batchDraw();
          };
      });
  }
  
  function hideFloatingButtons() {
      removeGroupQuickMenu();
  }
  // Udostępniamy globalnie floating menu dla innych plików
window.showFloatingButtons = showFloatingButtons;
window.hideFloatingButtons = hideFloatingButtons;

    function detachCloneFromCatalogSlot(node) {
        if (!node || !node.setAttr) return;
        node.setAttr("slotIndex", null);
        if (node.getAttr && node.getAttr("isAutoSlotGroup")) {
            node.setAttr("isAutoSlotGroup", false);
        }
        if (node.getChildren) {
            node.getChildren().forEach(child => detachCloneFromCatalogSlot(child));
        }
    }


    // === GLOBALNE WKLEJANIE — WERSJA KOŃCOWA, DZIAŁAJĄCA ===
    stage.on('click.paste', (e) => {
        if (!window.globalPasteMode) return;
        const clip = window.globalClipboard;
        if (!Array.isArray(clip) || clip.length === 0) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const baseX = clip[0].x();
        const baseY = clip[0].y();
        const newNodes = [];

        clip.forEach(src => {
            const clone = src.clone({
                draggable: true,
                listening: true
            });
            detachCloneFromCatalogSlot(clone);
            clone.x(pointer.x + (src.x() - baseX));
            clone.y(pointer.y + (src.y() - baseY));
            clone.setAttrs({
                isProductText: src.getAttr("isProductText") || false,
                isName: src.getAttr("isName") || false,
                isIndex: src.getAttr("isIndex") || false,
                isPrice: src.getAttr("isPrice") || false,
                isBox: src.getAttr("isBox") || false,
                isBarcode: src.getAttr("isBarcode") || false,
                isProductImage: src.getAttr("isProductImage") || false,
                slotIndex: null
            });
            layer.add(clone);
            if (clone instanceof Konva.Image) {
                ensureImageFX(clone, layer);
                applyImageFX(clone);
            }
            rebindEditableTextForClone(clone, page);
            newNodes.push(clone);
        });

        layer.batchDraw();
        transformerLayer.batchDraw();
        page.selectedNodes = newNodes;
        page.transformer.nodes(newNodes);

        window.globalPasteMode = false;
        window.globalClipboard = null;
        pages.forEach(p => p.stage.container().style.cursor = 'default');
    });

    // === KOPIUJ STYL → KLIKNIJ DOCELOWY ELEMENT ===
    stage.on('click.stylecopy', (e) => {
        if (!window.globalStylePasteMode) return;
        const style = window.globalStyleClipboard;
        if (!style) return;

        let target = e.target;
        if (!target || target === stage) return;
        if (target.getAttr && target.getAttr("isPageBg")) return;

        if (
            target.getParent &&
            target.getParent() instanceof Konva.Group &&
            (
                target.getParent().getAttr("isPriceGroup") ||
                target.getParent().getAttr("isPreset") ||
                target.getParent().getAttr("isShape") ||
                target.getParent().getAttr("isUserGroup")
            )
        ) {
            target = target.getParent();
        }

        // Cena (priceGroup) zawsze jako cała grupa – nigdy pojedynczy tekst/circle.
        if (
            target.getParent &&
            target.getParent() instanceof Konva.Group &&
            target.getParent().getAttr &&
            target.getParent().getAttr("isPriceGroup")
        ) {
            target = target.getParent();
        }

        if (
            style.meta &&
            style.meta.sourceIsPriceGroup &&
            !(target.getAttr && target.getAttr("isPriceGroup"))
        ) {
            return;
        }

        // Jeśli kopiujemy styl BOXA, zawsze nakładaj na box docelowego slotu,
        // nawet gdy kliknięto tekst/obraz wewnątrz tego boxa.
        if (style.meta && style.meta.sourceIsBox) {
            if (!(target.getAttr && target.getAttr("isBox"))) {
                const slot = target.getAttr && target.getAttr("slotIndex");
                if (Number.isFinite(slot)) {
                    const boxTarget = page.layer.findOne(n =>
                        n.getAttr &&
                        n.getAttr("isBox") &&
                        n.getAttr("slotIndex") === slot
                    );
                    if (boxTarget) target = boxTarget;
                }
            }
        }

        // Jeśli kopiujemy styl BARCODE, nakładaj tylko na inny barcode.
        if (style.meta && style.meta.sourceIsBarcode) {
            if (!(target.getAttr && target.getAttr("isBarcode"))) {
                return;
            }
        }

        const ok = applyNodeStyle(target, style);
        if (ok) {
            layer.batchDraw();
            transformerLayer.batchDraw();
            window.dispatchEvent(new CustomEvent('canvasModified', { detail: stage }));
            window.globalStylePasteMode = false;
            window.globalStyleClipboard = null;
            pages.forEach(p => p.stage.container().style.cursor = 'default');
            e.cancelBubble = true;
        }
    });

    // === ESC – WYŁĄCZENIE PASTE MODE ===
    const escHandler = (e) => {
        if (e.key === 'Escape' && (window.globalPasteMode || window.globalStylePasteMode)) {
            window.globalPasteMode = false;
            window.globalClipboard = null;
            window.globalStylePasteMode = false;
            window.globalStyleClipboard = null;
            pages.forEach(p => p.stage.container().style.cursor = 'default');
            document.removeEventListener('keydown', escHandler);
        }
    };
    if (!window._escHandlerBound) {
    document.addEventListener('keydown', escHandler);
    window._escHandlerBound = true;
}

// ===============================================
// PRIORYTET NAJMNIEJSZEGO OBIEKTU POD KURSOREM
// ===============================================
stage.on("mousedown.pickSmallest", (e) => {
    // Ta strona staje się aktywna już na mousedown,
    // żeby selekcja działała stabilnie od pierwszego kliknięcia.
    document.activeStage = stage;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const page = pages.find(p => p.stage === stage);
    if (!page) return;

    const isSelectableTarget = (n) => {
        if (!n || !n.getAttr) return false;
        if (typeof n.isDestroyed === "function" && n.isDestroyed()) return false;
        if (typeof n.visible === "function" && !n.visible()) return false;
        if (typeof n.listening === "function" && !n.listening()) return false;
        if (n.getLayer && n.getLayer() !== page.layer) return false;
        if (n.getAttr("isBgBlur")) return false;
        if (n.getAttr("isPageBg")) return false;
        if (n.getAttr("selectable") === false) return false;
        if (n.name && (n.name() === "selectionOutline" || n.name() === "selectionRect")) return false;
        return true;
    };

    page._priorityClickTarget = null;
    const hits = stage.getAllIntersections(pos).filter(isSelectableTarget);
// 🔥 jeśli kliknęliśmy element ceny – zawsze bierz GROUP
const priceGroup = hits.find(n => n.getAttr && n.getAttr("isPriceGroup"));
if (priceGroup) {
    page._priorityClickTarget = priceGroup;
    return;
}


    if (hits.length === 0) {
        page._priorityClickTarget = null;
        return;
    }

    // sortowanie według rozmiaru bounding-box (najmniejszy pierwszy)
    hits.sort((a, b) => {
        const ra = a.getClientRect();
        const rb = b.getClientRect();
        const areaA = ra.width * ra.height;
        const areaB = rb.width * rb.height;
        return areaA - areaB;
    });

    // wybieramy najmniejszy element jako docelowy klik
    let pick = hits[0];
    if (
        pick &&
        pick.getParent &&
        pick.getParent() instanceof Konva.Group &&
        (
            pick.getParent().getAttr("isPreset") ||
            pick.getParent().getAttr("isShape") ||
            pick.getParent().getAttr("isUserGroup")
        )
    ) {
        pick = pick.getParent();
    }
    page._priorityClickTarget = pick;
});


    // === MULTI SELECT — POPRAWIONE SHIFT+CLICK (CANVA STYLE) ===
stage.on("click tap", (e) => {
    if (window.isEditingText) return;

    if (window.globalPasteMode) return;
    if (window.globalStylePasteMode) return;
    if (Date.now() < marqueeSuppressClickUntil) {
        marqueeSuppressClickUntil = 0;
        return;
    }

    document.activeStage = stage;

    const rawTarget = e.target;
    const isSelectableTarget = (n) => {
        if (!n || !n.getAttr) return false;
        if (typeof n.isDestroyed === "function" && n.isDestroyed()) return false;
        if (typeof n.visible === "function" && !n.visible()) return false;
        if (typeof n.listening === "function" && !n.listening()) return false;
        if (n.getLayer && n.getLayer() !== page.layer) return false;
        if (n.getAttr("isBgBlur")) return false;
        if (n.getAttr("isPageBg")) return false;
        if (n.getAttr("selectable") === false) return false;
        if (n.name && (n.name() === "selectionOutline" || n.name() === "selectionRect")) return false;
        return true;
    };
    let target = rawTarget;
    if (
        target &&
        target.getParent &&
        target.getParent() instanceof Konva.Group &&
        (
            target.getParent().getAttr("isPreset") ||
            target.getParent().getAttr("isShape") ||
            target.getParent().getAttr("isUserGroup")
        )
    ) {
        target = target.getParent();
    }

    const priorityTarget = page._priorityClickTarget;
    page._priorityClickTarget = null;
    if (!isSelectableTarget(target) && isSelectableTarget(priorityTarget)) {
        target = priorityTarget;
    }

    // Fallback: gdy mousedown nie ustawił celu (np. szybki tap/kolizja handlerów),
    // policz trafienia pod kursorem bezpośrednio na click.
    if (!isSelectableTarget(target)) {
        const pos = stage.getPointerPosition();
        if (pos) {
            const fallbackHits = stage.getAllIntersections(pos).filter(isSelectableTarget);
            if (fallbackHits.length) {
                const priceGroupHit = fallbackHits.find(n => n.getAttr && n.getAttr("isPriceGroup"));
                if (priceGroupHit) {
                    target = priceGroupHit;
                } else {
                    fallbackHits.sort((a, b) => {
                        const ra = a.getClientRect();
                        const rb = b.getClientRect();
                        return (ra.width * ra.height) - (rb.width * rb.height);
                    });
                    let fallbackPick = fallbackHits[0];
                    if (
                        fallbackPick &&
                        fallbackPick.getParent &&
                        fallbackPick.getParent() instanceof Konva.Group &&
                        (
                            fallbackPick.getParent().getAttr("isPreset") ||
                            fallbackPick.getParent().getAttr("isShape") ||
                            fallbackPick.getParent().getAttr("isUserGroup")
                        )
                    ) {
                        fallbackPick = fallbackPick.getParent();
                    }
                    target = fallbackPick;
                }
            }
        }
    }

    // 🔥 tło nie jest wybieralne
    if (target && target.getAttr && target.getAttr("isPageBg") === true) {
        page.selectedNodes = [];
        page.transformer.nodes([]);
        page.layer.find(".selectionOutline").forEach(n => n.destroy());
        hideFloatingButtons();
        disableCropMode(page);
        page.layer.batchDraw();
        page.transformerLayer.batchDraw();
        return;
    }

    // 🔥 sprawdź, czy obiekt jest wybieralny
    if (target && target.getAttr && target.getAttr("isBgBlur")) {
        return;
    }

    const isSelectable =
    isSelectableTarget(target) && (
    target instanceof Konva.Text ||
    target instanceof Konva.Image ||
    target instanceof Konva.Group ||   // 🔥 DODANE
    (target instanceof Konva.Rect && !target.getAttr("isPageBg")) ||
    (target.getAttr && target.getAttr("isShape") === true));


    if (!isSelectable) {
        // klik w pusty obszar — usuń zaznaczenie
        page.selectedNodes = [];
        page.transformer.nodes([]);
        page.layer.find(".selectionOutline").forEach(n => n.destroy());
        hideFloatingButtons();
        disableCropMode(page);
        page.layer.batchDraw();
        page.transformerLayer.batchDraw();
        return;
    }

    const wasSelected =
        page.selectedNodes.includes(rawTarget) ||
        (rawTarget && rawTarget.getParent && page.selectedNodes.includes(rawTarget.getParent()));

    const canInlineEdit =
        rawTarget instanceof Konva.Text &&
        !(rawTarget.getParent && rawTarget.getParent().getAttr("isPriceGroup"));

    // === SHIFT + CLICK → dodanie lub odjęcie z zaznaczenia ===
    if (e.evt.shiftKey) {
        if (page.selectedNodes.includes(target)) {
            page.selectedNodes = page.selectedNodes.filter(n => n !== target);
        } else {
            page.selectedNodes.push(target);
        }
        page.selectedNodes = normalizeSelection(page.selectedNodes);
    } else {
        // zwykły klik — pojedynczy wybór
        const autoTarget = isSelectableTarget(target) ? target : null;
        if (!autoTarget) {
            page.selectedNodes = [];
            page.transformer.nodes([]);
            page.layer.find(".selectionOutline").forEach(n => n.destroy());
            hideFloatingButtons();
            disableCropMode(page);
            page.layer.batchDraw();
            page.transformerLayer.batchDraw();
            return;
        }
        const normalized = normalizeSelection([autoTarget]);
        page.selectedNodes = normalized.length ? normalized : [autoTarget];

    }

    const shouldInlineEdit = canInlineEdit && wasSelected && !e.evt.shiftKey;

    if (shouldInlineEdit) {
        rawTarget.fire("dblclick");
        return;
    }

    // === zastosowanie zmiany do transformera + outline ===
    const singleImage = (page.selectedNodes.length === 1 && page.selectedNodes[0] instanceof Konva.Image);
    if (singleImage) {
        const img = page.selectedNodes[0];
        const cropEnabled = enableCropMode(page, img);
        if (!cropEnabled) {
            disableCropMode(page);
            page.transformer.nodes([img]);
        }
    } else {
        disableCropMode(page);
        page.transformer.nodes(page.selectedNodes);
    }

    // === Tekst: użyj floating toolbar zamiast bocznego panelu ===
    const singleText =
        (page.selectedNodes.length === 1 &&
        page.selectedNodes[0] instanceof Konva.Text &&
        !(page.selectedNodes[0].getParent && page.selectedNodes[0].getParent().getAttr("isPriceGroup")));
    const singleTextNode = singleText ? page.selectedNodes[0] : null;
    if (singleTextNode && typeof window.showTextToolbar === "function") {
        window.showTextToolbar(singleTextNode);
        window.hideTextPanel?.();
    } else {
        window.hideTextToolbar?.();
        window.hideTextPanel?.();
    }
    page.layer.find(".selectionOutline").forEach(n => n.destroy());
   

    if (page.selectedNodes.length > 0) {
        showFloatingButtons();
        if (singleTextNode && typeof window.showTextToolbar === "function") {
            requestAnimationFrame(() => window.showTextToolbar(singleTextNode));
        }
    } else {
        hideFloatingButtons();
    }

    // 🔧 lepsze uchwyty dla linii/strzałek (większy odstęp)
    if (page.selectedNodes.length === 1) {
        const n = page.selectedNodes[0];
        const type = n.getAttr && n.getAttr("shapeType");
        if (type === "line" || type === "arrow") {
            page.transformer.padding(12);
            page.transformer.anchorSize(16);
        } else {
            page.transformer.padding(4);
            page.transformer.anchorSize(12);
        }
    }

    page.layer.batchDraw();
    page.transformerLayer.batchDraw();
});



    // === TRANSFORMSTART – ZAPISUJEMY STAN ===
    stage.on('transformstart', () => {
   // 🔥 usuń stare obrysy i dodaj nowe zgodne z aktualnym rozmiarem
page.layer.find('.selectionOutline').forEach(n => n.destroy());



    page._oldTransformBox = page.transformer.getClientRect();
});
    
    // === EVENTY TRANSFORMACJI ===
    stage.on('dragstart dragend transformend', () => {
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('canvasModified', { detail: stage }));
        }, 50);
    });

    pages.push(page);
    drawPage(page);
    fixProductTextSlotIndex(page);

    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('canvasCreated', { detail: stage }));
    }, 100);

    applyZoomToPage(page, currentZoom);
    return page;
    // === ZAWSZE KOREKTUJEMY ROZMIAR WRAPPERA DO ROZMIARU STRONY ===
// 🔥 TO JEST JEDYNY WAŻNY FRAGMENT — on usuwa białe linie w PDF
const wrapperFixer = () => {
    const wrapper = page.container.querySelector('.canvas-wrapper');
    if (!wrapper) return;

    wrapper.style.width = `${W}px`;
    wrapper.style.height = `${H}px`;
    wrapper.style.overflow = "hidden";

    // Konva Stage też musi się odświeżyć
    page.stage.width(W);
    page.stage.height(H);
    page.stage.batchDraw();
};

// natychmiastowe poprawienie wymiarów
wrapperFixer();

// poprawianie przy zmianie stylu lub zoomu
setTimeout(wrapperFixer, 50);
setTimeout(wrapperFixer, 250);
setTimeout(wrapperFixer, 500);

}

// === USUWANIE STRONY – GLOBALNA FUNKCJA ===
window.deletePage = function(page) {
    const index = pages.indexOf(page);
    if (index === -1) return;

    page.stage.destroy();
    page.container.remove();
    pages.splice(index, 1);

    pages.forEach((p, i) => {
        p.number = i + 1;
        const h3 = p.container.querySelector('h3 span');
        if (h3) h3.textContent = `Strona ${i + 1}`;
    });
};

// 🔧 Globalna naprawa interakcji (gdyby coś się "zawiesiło")
window.repairPageInteractions = function() {
    pages.forEach(p => {
        if (!p || !p.stage || !p.layer || !p.transformerLayer) return;
        p.stage.listening(true);
        p.layer.listening(true);
        p.transformerLayer.listening(true);
        if (p.transformer && !p.transformer.getLayer()) {
            p.transformerLayer.add(p.transformer);
        }
        p.stage.container().style.pointerEvents = 'auto';
        p.stage.container().style.touchAction = 'none';
    });
};

// === RYSOWANIE STRONY ===
function drawPage(page) {
    const { layer, transformerLayer, products, settings } = page;
    const protectedSlots = page && page._customProtectedSlots instanceof Set
      ? page._customProtectedSlots
      : null;

    // Styl własny: rysuj tylko jeden slot (bez niszczenia warstwy) – mniejsza zależność od pełnego redraw
    const onlySlot = page._drawOnlySlot;
    const drawOnlyOneSlot = onlySlot != null && Number.isFinite(onlySlot);
    if (drawOnlyOneSlot) page._drawOnlySlot = null;

    if (!drawOnlyOneSlot) {
        // 🔥 usuwamy TYLKO elementy produktowe (bez TNZ)
        layer.find(node =>
            node.getAttr("slotIndex") !== undefined &&
            node.getAttr("isTNZBadge") !== true &&
            node.getAttr("isCountryBadge") !== true
        ).forEach(n => {
            if (n.getAttr("isBarcode")) {
                const si = n.getAttr("slotIndex");
                if (Number.isFinite(si) && page.barcodeObjects) {
                    page.barcodeObjects[si] = null;
                }
            }
            n.destroy();
        });
    }





    const showEan = document.getElementById('showEan')?.checked ?? true;
    const showCena = document.getElementById('showCena')?.checked ?? true;
    const frame3D = document.querySelector('input[name="frameStyle"]:checked')?.value === '3d';

    products.forEach((p, i) => {
        // Styl własny: rysuj tylko ten jeden slot (bez pełnego redraw)
        if (drawOnlyOneSlot && i !== onlySlot) return;
        // Styl własny: gdy trwa bezpieczny redraw po dodaniu nowego modułu,
        // nie renderujemy ponownie już istniejących, chronionych slotów.
        if (protectedSlots && protectedSlots.has(i)) return;
        // oryginalna pozycja
// oryginalna pozycja
const xRaw = ML + (i % COLS) * ((BW_dynamic) + GAP);

let y = MT + Math.floor(i / COLS) * (BH_dynamic + GAP);


// 🔥 PRZESUNIĘCIE WSZYSTKICH BOXÓW TYLKO DLA LAYOUT 8
let boxOffsetY = 20;
if (window.LAYOUT_MODE === "layout8") {
    boxOffsetY = -38;   // ustaw na -60, -80, -120 jeśli chcesz wyżej
}

// Szybki kreator – zastosuj globalne ustawienia
window.applyQuickSettings = function(opts = {}) {
    if (!Array.isArray(pages) || pages.length === 0) return;
    pages.forEach(p => {
        const imgStates = [];
        if (Array.isArray(p.slotObjects)) {
            p.slotObjects.forEach((img, idx) => {
                if (!img) return;
                if (typeof img.isDestroyed === "function" && img.isDestroyed()) {
                    p.slotObjects[idx] = null;
                    return;
                }
                imgStates[idx] = {
                    img,
                    x: img.x(),
                    y: img.y(),
                    scaleX: img.scaleX(),
                    scaleY: img.scaleY(),
                    rotation: img.rotation()
                };
                // usuń z warstwy, aby drawPage nie zniszczył obrazu
                if (img.getLayer && img.getLayer() === p.layer) {
                    img.remove();
                }
            });
        }
        if (opts.currency) p.settings.currency = opts.currency;
        if (opts.fontFamily) p.settings.fontFamily = opts.fontFamily;
        if (Number.isFinite(opts.nameSize)) p.settings.nameSize = opts.nameSize;
        if (Number.isFinite(opts.priceSize)) p.settings.priceSize = opts.priceSize;
        if (Number.isFinite(opts.indexSize)) p.settings.indexSize = opts.indexSize;
        if (opts.nameColor) p.settings.nameColor = opts.nameColor;
        if (opts.priceColor) p.settings.priceColor = opts.priceColor;
        if (opts.indexColor) p.settings.indexColor = opts.indexColor;
        if (Number.isFinite(opts.rankSize)) p.settings.rankSize = opts.rankSize;
        if (opts.rankColor) p.settings.rankColor = opts.rankColor;
        drawPage(p);
        if (imgStates.length > 0) {
            imgStates.forEach(state => {
                if (!state || !state.img) return;
                const img = state.img;
                if (typeof img.isDestroyed === "function" && img.isDestroyed()) return;
                if (img.getLayer && img.getLayer() !== p.layer) {
                    p.layer.add(img);
                }
                img.x(state.x);
                img.y(state.y);
                img.scaleX(state.scaleX);
                img.scaleY(state.scaleY);
                img.rotation(state.rotation || 0);
                setupProductImageDrag(img, p.layer);
            });
        }
        p.layer.batchDraw();
        p.transformerLayer.batchDraw();
    });
};

y += boxOffsetY;


// 🔥 Domyślne odstępy dla layoutu 6
let nameOffsetY = 31;
let imageOffsetY = 100;
let priceOffsetExtra = 120;
let indexOffsetY = -84;

// 🔥 Specjalne ustawienia dla layoutu 8 (mniejsze boksy)
// 🔥 Specjalne ustawienia dla layoutu 8 (mniejsze boksy)
if (window.LAYOUT_MODE === "layout8") {
    nameOffsetY = 16;        
    priceOffsetExtra = 70;    
    indexOffsetY = -80;       
    imageOffsetY = 80;        // ⭐ tu ustawiamy bazę dla zdjęć
}



// 🔥 PRZESUNIĘCIE WSZYSTKICH PUDEŁEK W LEWO / PRAWO
const LEFT_OFFSET = 0; // wyrównanie marginesów lewy/prawy
const x = xRaw + LEFT_OFFSET;


        // === PUDEŁKO ===
        // ===================================




      const isElegantStyle = window.CATALOG_STYLE === "styl_elegancki";
      const boxInteractive = !isElegantStyle;
      const box = new Konva.Rect({
          x, y,
          width: BW_dynamic,
          height: BH_dynamic,
          fill: isElegantStyle ? 'rgba(0,0,0,0)' : '#ffffff',
          stroke: isElegantStyle ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.06)',
          strokeWidth: isElegantStyle ? 0 : 1,
          cornerRadius: isElegantStyle ? 0 : 10,
          shadowColor: 'rgba(0,0,0,0.18)',
          shadowBlur: isElegantStyle ? 0 : 30,
          shadowOffset: { x: 0, y: isElegantStyle ? 0 : 12 },
          shadowOpacity: isElegantStyle ? 0 : 0.8,
          draggable: boxInteractive,
          listening: boxInteractive,
          visible: boxInteractive,
          selectable: boxInteractive,
          isHiddenByCatalogStyle: !boxInteractive,
          isBox: true,
          slotIndex: i
      });

      box.dragBoundFunc(pos => pos);
      if (page.boxScales[i]) {
          box.scaleX(page.boxScales[i].scaleX);
          box.scaleY(page.boxScales[i].scaleY);
      }
      layer.add(box);


        
// ================================
// TNZ BADGE — WERSJA POPRAWNA
// ================================
if (p.TNZ && p.TNZ.toString().trim().toLowerCase() === "x") {

    loadTNZImage((img) => {

        const badgeScale = (window.LAYOUT_MODE === "layout8" ? 0.085 : 0.11) * 2;


        // ================================
        // POZYCJA TNZ – OSOBNO DLA LAYOUTÓW
        // ================================
        let tnzOffsetX = -245;
        let tnzOffsetY = -15;

        // layout 6
        if (window.LAYOUT_MODE === "layout6") {
            tnzOffsetX = -320;   // lewo / prawo
            tnzOffsetY = 48;    // góra / dół
        }

        // layout 8
        if (window.LAYOUT_MODE === "layout8") {
            tnzOffsetX = -330;   // lewo / prawo
            tnzOffsetY = 28;    // góra / dół
        }

        const tnzBadge = new Konva.Image({
            image: img,

            x: x + BW_dynamic - img.width * badgeScale + tnzOffsetX,
            y: y + tnzOffsetY,

            scaleX: badgeScale,
            scaleY: badgeScale,

            draggable: true,
            listening: true,

            name: "tnzBadge",

            // 🔥 KLUCZOWE FLAGI
            isTNZBadge: true,
            isOverlayElement: true,
            slotIndex: i
        });

        layer.add(tnzBadge);
        tnzBadge.moveToTop();
        layer.batchDraw();
    });
}
// ================================
// COUNTRY BADGE — RUMUNIA
// ================================
if (
    p.KRAJPOCHODZENIA &&
    p.KRAJPOCHODZENIA.toString().trim().toLowerCase() === "rumunia"
) {

    loadCountryROImage((img) => {

        // ================================
// WIELKOŚĆ FLAGI – OSOBNO DLA LAYOUTÓW
// ================================
let countryScale = 0.10; // domyślnie layout 6

// layout 6 – TU ROZCIĄGASZ
if (window.LAYOUT_MODE === "layout6") {
    countryScale = 0.112;   // 🔥 ZWIĘKSZ TYLKO TO
}

// layout 8 – ZOSTAJE JAK JEST
if (window.LAYOUT_MODE === "layout8") {
    countryScale = 0.111;   // ❗ NIE RUSZAJ
}


        // ================================
        // POZYCJA FLAGI – OSOBNO DLA LAYOUTÓW
        // ================================
        let countryOffsetX = -60;
        let countryOffsetY = 25;

        // layout 6
        if (window.LAYOUT_MODE === "layout6") {
            countryOffsetX = 212;
            countryOffsetY = 107;
        }

        // layout 8
        if (window.LAYOUT_MODE === "layout8") {
            countryOffsetX = 212;
            countryOffsetY = 10;
        }

        const countryBadge = new Konva.Image({
            image: img,

            x: x + countryOffsetX,
            y: y + countryOffsetY,

            scaleX: countryScale,
            scaleY: countryScale,

            draggable: true,
            listening: true,

            name: "countryBadgeRO",

            // 🔥 KLUCZOWE FLAGI
            isCountryBadge: true,
            isOverlayElement: true,
            slotIndex: i
        });

        layer.add(countryBadge);
        countryBadge.moveToTop();
        layer.batchDraw();
    });
}
// ================================
// COUNTRY BADGE — UKRAINA
// ================================
if (
    p.KRAJPOCHODZENIA &&
    p.KRAJPOCHODZENIA.toString().trim().toLowerCase() === "ukraina"
) {

    loadCountryUAImage((img) => {

        // ================================
        // WIELKOŚĆ FLAGI – OSOBNO DLA LAYOUTÓW
        // ================================
        let countryScale = 0.10; // layout 6 – domyślnie

        if (window.LAYOUT_MODE === "layout6") {
            countryScale = 0.112;   // 🔥 większa tylko dla 6
        }

        if (window.LAYOUT_MODE === "layout8") {
            countryScale = 0.111;   // 🔒 NIE ZMIENIAMY
        }

        // ================================
        // POZYCJA FLAGI – OSOBNO DLA LAYOUTÓW
        // ================================
        let countryOffsetX = 212;
        let countryOffsetY = 107;

        if (window.LAYOUT_MODE === "layout8") {
            countryOffsetX = 212;
            countryOffsetY = 10;
        }

        const countryBadge = new Konva.Image({
            image: img,

            x: x + countryOffsetX,
            y: y + countryOffsetY,

            scaleX: countryScale,
            scaleY: countryScale,

            draggable: true,
            listening: true,

            name: "countryBadgeUA",

            // 🔥 KLUCZOWE FLAGI
            isCountryBadge: true,
            isOverlayElement: true,
            slotIndex: i
        });

        layer.add(countryBadge);
        countryBadge.moveToTop();
        layer.batchDraw();
    });
}

// ================================
// COUNTRY BADGE — LITWA
// ================================
if (
    p.KRAJPOCHODZENIA &&
    p.KRAJPOCHODZENIA.toString().trim().toLowerCase() === "litwa"
) {

    loadCountryLTImage((img) => {

        // ================================
        // WIELKOŚĆ FLAGI – OSOBNO DLA LAYOUTÓW
        // ================================
        let countryScale = 0.10; // layout 6

        if (window.LAYOUT_MODE === "layout6") {
            countryScale = 0.112;
        }

        if (window.LAYOUT_MODE === "layout8") {
            countryScale = 0.111;
        }

        // ================================
        // POZYCJA FLAGI – OSOBNO DLA LAYOUTÓW
        // ================================
        let countryOffsetX = 212;
        let countryOffsetY = 107;

        if (window.LAYOUT_MODE === "layout8") {
            countryOffsetX = 212;
            countryOffsetY = 10;
        }

        const countryBadge = new Konva.Image({
            image: img,

            x: x + countryOffsetX,
            y: y + countryOffsetY,

            scaleX: countryScale,
            scaleY: countryScale,

            draggable: true,
            listening: true,

            name: "countryBadgeLT",

            // 🔥 KLUCZOWE FLAGI
            isCountryBadge: true,
            isOverlayElement: true,
            slotIndex: i
        });

        layer.add(countryBadge);
        countryBadge.moveToTop();
        layer.batchDraw();
    });
}

// ================================
// COUNTRY BADGE — BUŁGARIA
// ================================
if (
    p.KRAJPOCHODZENIA &&
    p.KRAJPOCHODZENIA.toString().trim().toLowerCase() === "bulgaria"
) {

    loadCountryBGImage((img) => {

        // ================================
        // WIELKOŚĆ FLAGI – OSOBNO DLA LAYOUTÓW
        // ================================
        let countryScale = 0.10; // layout 6

        if (window.LAYOUT_MODE === "layout6") {
            countryScale = 0.112;
        }

        if (window.LAYOUT_MODE === "layout8") {
            countryScale = 0.111;
        }

        // ================================
        // POZYCJA FLAGI – OSOBNO DLA LAYOUTÓW
        // ================================
        let countryOffsetX = 212;
        let countryOffsetY = 107;

        if (window.LAYOUT_MODE === "layout8") {
            countryOffsetX = 212;
            countryOffsetY = 10;
        }

        const countryBadge = new Konva.Image({
            image: img,

            x: x + countryOffsetX,
            y: y + countryOffsetY,

            scaleX: countryScale,
            scaleY: countryScale,

            draggable: true,
            listening: true,

            name: "countryBadgeBG",

            // 🔥 KLUCZOWE FLAGI
            isCountryBadge: true,
            isOverlayElement: true,
            slotIndex: i
        });

        layer.add(countryBadge);
        countryBadge.moveToTop();
        layer.batchDraw();
    });
}

// ================================
// COUNTRY BADGE — POLSKA
// ================================
if (
    p.KRAJPOCHODZENIA &&
    p.KRAJPOCHODZENIA.toString().trim().toLowerCase() === "polska"
) {

    loadCountryPLImage((img) => {

        // ================================
        // WIELKOŚĆ FLAGI – OSOBNO DLA LAYOUTÓW
        // ================================
        let countryScale = 0.10; // layout 6

        if (window.LAYOUT_MODE === "layout6") {
            countryScale = 0.112;
        }

        if (window.LAYOUT_MODE === "layout8") {
            countryScale = 0.111;
        }

        // ================================
        // POZYCJA FLAGI – OSOBNO DLA LAYOUTÓW
        // ================================
        let countryOffsetX = 212;
        let countryOffsetY = 107;

        if (window.LAYOUT_MODE === "layout8") {
            countryOffsetX = 212;
            countryOffsetY = 10;
        }

        const countryBadge = new Konva.Image({
            image: img,

            x: x + countryOffsetX,
            y: y + countryOffsetY,

            scaleX: countryScale,
            scaleY: countryScale,

            draggable: true,
            listening: true,

            name: "countryBadgePL",

            // 🔥 KLUCZOWE FLAGI
            isCountryBadge: true,
            isOverlayElement: true,
            slotIndex: i
        });

        layer.add(countryBadge);
        countryBadge.moveToTop();
        layer.batchDraw();
    });
}



        // === NAZWA ===
        const name = p.NAZWA || 'Pusty';
        const maxWidth = BW - 20;
        const lines = splitTextIntoLines(name, maxWidth, settings.nameSize, settings.fontFamily);
        let nameTop = y + nameOffsetY;

        const fullName = p.NAZWA || 'Pusty';
const textObj = new Konva.Text({
    x: x + BW / 35,
    y: nameTop,
    text: fullName,
    fontSize: settings.nameSize,
    fill: settings.nameColor || settings.textColor,
    fontFamily: settings.fontFamily,
    align: 'center',
    width: BW_dynamic - 20,
    wrap: 'word',
    draggable: true,
    listening: true,
    isProductText: true,
    isName: true,
    slotIndex: i
});
textObj.dragBoundFunc(pos => pos);
layer.add(textObj);
enableEditableText(textObj, page);
textObj.moveToTop();
if (textObj.height() < 28) textObj.height(28);



        // === INDEKS ===
        const indexObj = new Konva.Text({
    x: x + BW / 1.70 + 6,
    y: y + BH + indexOffsetY + (window.LAYOUT_MODE === "layout6" ? -2 : (window.LAYOUT_MODE === "layout8" ? -2 : 0)),
    text: `Indeks: ${p.INDEKS || '-'}`,
    fontSize: settings.indexSize,
    fill: settings.indexColor || settings.textColor,
    fontFamily: settings.fontFamily,
    align: 'center',
    width: 100,         // <<< szerokość pozwala zmieścić cały tekst w 1 linii
    wrap: 'none',       // <<< ZAKAZ łamania linii — najważniejsze
    draggable: true,
    listening: true,
    isProductText: true,
    isIndex: true,
    slotIndex: i
});



        indexObj.dragBoundFunc(pos => pos);
        layer.add(indexObj);
        if (indexObj.height() < 26) indexObj.height(26);
        indexObj.moveToTop();
        enableEditableText(textObj, page);

      // === CENA (CANVA STYLE – GROUP) ===
if (showCena && p.CENA) {

    const currency = String(page.settings.currency || 'gbp').toLowerCase();

    // --- rozbij cenę ---
    // 🔒 NORMALIZACJA CENY – MAX 2 MIEJSCA PO PRZECINKU
let raw = String(p.CENA)
.replace(',', '.')
.replace(/[^0-9.]/g, '');

let value = parseFloat(raw);

if (isNaN(value)) value = 0;

// zawsze max 2 miejsca po przecinku
let fixed = value.toFixed(2);

let [main, decimal] = fixed.split('.');


    const packUnit = (p.JEDNOSTKA || 'SZT.').toUpperCase();

let unitLabel = 'SZT.';
if (packUnit === 'KG') unitLabel = 'KG';

let unit = `£ / ${unitLabel}`;
if (currency === 'euro' || currency === 'eur' || currency === '€') unit = `€ / ${unitLabel}`;
if (currency === 'pln' || currency === 'zł' || currency === 'zl') unit = `zł / ${unitLabel}`;


    // --- pozycja Y liczona od BOXA ---
    // Podnieś całą cenę proporcjonalnie
    const PRICE_Y_SHIFT_LAYOUT6 = -78;
    const PRICE_Y_SHIFT_LAYOUT8 = -20;
    let priceY;
    if (window.LAYOUT_MODE === "layout6") {
        priceY = y + BH_dynamic - 130 + PRICE_Y_SHIFT_LAYOUT6;
    }
    if (window.LAYOUT_MODE === "layout8") {
        priceY = y + BH_dynamic - 135 + PRICE_Y_SHIFT_LAYOUT8;
    }

    // Kolory ceny ze stylu własnego (koło + tekst) – żeby w katalogu było widać ustawiony kolor
    const priceBgColor = (p.PRICE_BG_COLOR != null && String(p.PRICE_BG_COLOR).trim() !== '') ? String(p.PRICE_BG_COLOR).trim() : '#d71920';
    const priceTextColor = (p.PRICE_TEXT_COLOR != null && String(p.PRICE_TEXT_COLOR).trim() !== '') ? String(p.PRICE_TEXT_COLOR).trim() : '#ffffff';
    const priceTextScale = Number.isFinite(p.PRICE_TEXT_SCALE) && p.PRICE_TEXT_SCALE > 0 ? p.PRICE_TEXT_SCALE : 1;

    // === GROUPA CENY (JEDEN OBIEKT!) ===
    const priceGroup = new Konva.Group({
        x: x + BW_dynamic - 150,
        y: priceY,
        draggable: true,
        listening: true,

        isProductText: true,
        isPrice: true,
        isPriceGroup: true,
        slotIndex: i,

        name: "priceGroup"
    });
    priceGroup.setAttr("priceBgColor", priceBgColor);
    priceGroup.setAttr("priceTextColor", priceTextColor);
    priceGroup.setAttr("priceTextScale", priceTextScale);

    const basePriceSize = Math.round(settings.priceSize * 1.9 * priceTextScale);
    // === GŁÓWNA CENA ===
    const priceMain = new Konva.Text({
        text: main,
        fontSize: basePriceSize,
        fontFamily: settings.fontFamily,
        fill: priceTextColor,
        fontStyle: 'bold'
    });

    // === GROSZE ===
    const priceDecimal = new Konva.Text({
        text: decimal,
        fontSize: Math.round(settings.priceSize * 0.55 * priceTextScale),
        fontFamily: settings.fontFamily,
        fill: priceTextColor,
        x: priceMain.width() + 4,
        y: priceMain.height() * 0.10

    });

    // === WALUTA / SZT ===
    const priceUnit = new Konva.Text({
  text: unit,

  fontSize: Math.round(settings.priceSize * 0.35 * priceTextScale),
  fontFamily: settings.fontFamily,
  fill: priceTextColor,
  x: priceMain.width() + 4,
  y: priceDecimal.height() * 1.5,
  name: 'priceUnit'   // 🔥 TO JEST KLUCZ
});


    // === SKŁADANIE GRUPY ===
    priceGroup.add(priceMain, priceDecimal, priceUnit);
    layer.add(priceGroup);
    priceGroup.moveToTop();

    // ✅ Edycja ceny po dwukliku na grupie ceny
    priceGroup.on("dblclick dbltap", () => {
        const current = `${priceMain.text()}.${priceDecimal.text()}`;
        const raw = prompt("Podaj nową cenę (np. 1,49):", current.replace(".", ","));
        if (raw == null) return;

        const parsed = parseFloat(String(raw).replace(",", ".").replace(/[^0-9.]/g, ""));
        if (!Number.isFinite(parsed)) return;

        const [newMain, newDecimal] = parsed.toFixed(2).split(".");
        priceMain.text(newMain);
        priceDecimal.text(newDecimal);

        const gap = 4;
        priceDecimal.x(priceMain.width() + gap);
        priceDecimal.y(priceMain.height() * 0.10);
        priceUnit.x(priceMain.width() + gap);
        priceUnit.y(priceDecimal.height() * 1.5);

        // Jeśli aktywny styl elegancki, przelicz czerwone koło i centrowanie 1:1 po zmianie ceny
        if (priceGroup.getAttr("isElegantPriceStyled") && typeof window.applyCatalogStyleVisual === "function") {
            window.applyCatalogStyleVisual(window.CATALOG_STYLE || "styl_elegancki");
        } else {
            layer.batchDraw();
            page.transformerLayer?.batchDraw?.();
        }
    });

    // 🔥 KLUCZ: transformer MA ŁAPAĆ TYLKO GROUP
    
}



        // === ZDJĘCIE ===
const familyImageUrls = Array.isArray(p.FAMILY_IMAGE_URLS)
    ? p.FAMILY_IMAGE_URLS.map(v => String(v || "").trim()).filter(Boolean)
    : [];
const customImageLayouts = Array.isArray(p.CUSTOM_IMAGE_LAYOUTS) ? p.CUSTOM_IMAGE_LAYOUTS : [];
const normalizeLayoutItem = (item) => {
    if (!item || typeof item !== "object") return null;
    const x = Number(item.x);
    const y = Number(item.y);
    const w = Number(item.w);
    const h = Number(item.h);
    if (![x, y, w, h].every(Number.isFinite)) return null;
    return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        w: Math.max(0, Math.min(1, w)),
        h: Math.max(0, Math.min(1, h))
    };
};

if (familyImageUrls.length > 1) {
    const imgTop = y + imageOffsetY + (lines.length * settings.nameSize * 1.2);
    let imageExtraY = 0;
    if (window.LAYOUT_MODE === "layout8") imageExtraY = -160;

    let boxX = x + 20;
    let boxY = imgTop + imageExtraY;
    let boxW = (BW * 0.45 - 20);
    let boxH = (BH * 0.6);

    if (window.LAYOUT_MODE === "layout8") {
        boxW = BW_dynamic * 0.48;
        boxH = BH_dynamic * 0.52;
        boxX = x + 12;
        boxY = imgTop + imageExtraY;
    }

    const count = Math.min(4, familyImageUrls.length);
    for (let fi = 0; fi < count; fi++) {
        const srcUrl = familyImageUrls[fi];
        if (!srcUrl) continue;
        Konva.Image.fromURL(srcUrl, (img) => {
            if (!img || (typeof img.isDestroyed === "function" && img.isDestroyed())) return;

            let frameX = boxX;
            let frameY = boxY;
            let frameW = boxW;
            let frameH = boxH;

            // Domyślny układ rodziny: pionowo, jedno pod drugim.
            const gap = Math.max(2, Math.round(boxH * 0.02));
            const stackCount = Math.max(1, count);
            frameW = boxW * 0.74;
            frameH = Math.max(1, (boxH - gap * (stackCount - 1)) / stackCount);
            frameX = boxX;
            frameY = boxY + fi * (frameH + gap);

            // Ręczny układ z `styl-wlasny.js` (jeśli zdefiniowany dla produktu).
            const manualLayout = normalizeLayoutItem(customImageLayouts[fi]);
            if (manualLayout) {
                frameX = boxX + boxW * manualLayout.x;
                frameY = boxY + boxH * manualLayout.y;
                frameW = boxW * manualLayout.w;
                frameH = boxH * manualLayout.h;
            }

            const scale = frameW / Math.max(1, img.width());
            const imgH = img.height() * scale;

            img.x(frameX);
            img.y(frameY + (frameH - imgH) / 2);
            img.scaleX(scale);
            img.scaleY(scale);
            img.draggable(true);
            img.dragBoundFunc(pos => pos);
            img.listening(true);
            img.setAttrs({
                width: img.width(),
                height: img.height(),
                isProductImage: true,
                slotIndex: i,
                familyImageIndex: fi
            });
            layer.add(img);
            setupProductImageDrag(img, layer);
            addImageShadow(layer, img);
            const priceGroupTop = layer.findOne((n) => n && n.getAttr && n.getAttr("isPriceGroup") && n.getAttr("slotIndex") === i);
            if (priceGroupTop && priceGroupTop.moveToTop) priceGroupTop.moveToTop();
            layer.batchDraw();
            transformerLayer?.batchDraw?.();
        });
    }
} else if (page.slotObjects[i]) {
    const img = page.slotObjects[i];

    // 🔥 DODATKOWE PRZESUNIĘCIE ZDJĘCIA TYLKO DLA LAYOUT 8
    let imageExtraY = 0;
    if (window.LAYOUT_MODE === "layout8"){
        imageExtraY = -160;   // 🔼 podniesienie zdjęcia (zmień na -20, -60 itd.)
    }

    let scale = Math.min(
        (BW * 0.45 - 20) / img.width(),
        (BH * 0.6) / img.height(),
        1
    );

    const imgTop =
        y + imageOffsetY + (lines.length * settings.nameSize * 1.2);

    let imgX = x + 20;
    let imgY = imgTop + imageExtraY;   // 🔥 KLUCZOWA ZMIANA

    // ✅ Wyrównanie i stała „ramka” dla layout 8 (równe pozycje i skale)
    if (window.LAYOUT_MODE === "layout8") {
        const boxW = BW_dynamic * 0.48;
        const boxH = BH_dynamic * 0.52;
        scale = Math.min(boxW / img.width(), boxH / img.height(), 1);
        imgX = x + 12 + (boxW - img.width() * scale) / 2;
        imgY = imgTop + imageExtraY + (boxH - img.height() * scale) / 2;
    }

    const manualSingle = normalizeLayoutItem(customImageLayouts[0]);
    if (manualSingle) {
        let boxX = x + 20;
        let boxY = imgTop + imageExtraY;
        let boxW = (BW * 0.45 - 20);
        let boxH = (BH * 0.6);
        if (window.LAYOUT_MODE === "layout8") {
            boxW = BW_dynamic * 0.48;
            boxH = BH_dynamic * 0.52;
            boxX = x + 12;
            boxY = imgTop + imageExtraY;
        }
        const frameX = boxX + boxW * manualSingle.x;
        const frameY = boxY + boxH * manualSingle.y;
        const frameW = boxW * manualSingle.w;
        const frameH = boxH * manualSingle.h;
        scale = frameW / Math.max(1, img.width());
        const imgH = img.height() * scale;
        imgX = frameX;
        imgY = frameY + (frameH - imgH) / 2;
    }

    img.x(imgX);
    img.y(imgY);

    img.scaleX(scale);
    img.scaleY(scale);
    img.draggable(true);
    img.dragBoundFunc(pos => pos);

    layer.add(img);

    img.listening(true);
    img.setAttrs({
        width: img.width(),
        height: img.height(),
        isProductImage: true,
        slotIndex: i
    });
    // 🔥 CANVA STYLE SHADOW
setupProductImageDrag(img, layer);
addImageShadow(layer, img);

} else if (familyImageUrls.length === 1) {
    const imgTop = y + imageOffsetY + (lines.length * settings.nameSize * 1.2);
    let imageExtraY = 0;
    if (window.LAYOUT_MODE === "layout8") imageExtraY = -160;
    const srcUrl = familyImageUrls[0];
    if (srcUrl) {
        Konva.Image.fromURL(srcUrl, (img) => {
            if (!img || (typeof img.isDestroyed === "function" && img.isDestroyed())) return;
            let scale = Math.min(
                (BW * 0.45 - 20) / img.width(),
                (BH * 0.6) / img.height(),
                1
            );
            let imgX = x + 20;
            let imgY = imgTop + imageExtraY;
            if (window.LAYOUT_MODE === "layout8") {
                const boxW = BW_dynamic * 0.48;
                const boxH = BH_dynamic * 0.52;
                scale = Math.min(boxW / img.width(), boxH / img.height(), 1);
                imgX = x + 12 + (boxW - img.width() * scale) / 2;
                imgY = imgTop + imageExtraY + (boxH - img.height() * scale) / 2;
            }
            const manualSingle = normalizeLayoutItem(customImageLayouts[0]);
            if (manualSingle) {
                let boxX = x + 20;
                let boxY = imgTop + imageExtraY;
                let boxW = (BW * 0.45 - 20);
                let boxH = (BH * 0.6);
                if (window.LAYOUT_MODE === "layout8") {
                    boxW = BW_dynamic * 0.48;
                    boxH = BH_dynamic * 0.52;
                    boxX = x + 12;
                    boxY = imgTop + imageExtraY;
                }
                const frameX = boxX + boxW * manualSingle.x;
                const frameY = boxY + boxH * manualSingle.y;
                const frameW = boxW * manualSingle.w;
                const frameH = boxH * manualSingle.h;
                scale = frameW / Math.max(1, img.width());
                const imgH = img.height() * scale;
                imgX = frameX;
                imgY = frameY + (frameH - imgH) / 2;
            }

            img.x(imgX);
            img.y(imgY);
            img.scaleX(scale);
            img.scaleY(scale);
            img.draggable(true);
            img.dragBoundFunc(pos => pos);
            img.listening(true);
            img.setAttrs({
                width: img.width(),
                height: img.height(),
                isProductImage: true,
                slotIndex: i
            });
            layer.add(img);
            setupProductImageDrag(img, layer);
            addImageShadow(layer, img);
            const priceGroupTop = layer.findOne((n) => n && n.getAttr && n.getAttr("isPriceGroup") && n.getAttr("slotIndex") === i);
            if (priceGroupTop && priceGroupTop.moveToTop) priceGroupTop.moveToTop();
            layer.batchDraw();
            transformerLayer?.batchDraw?.();
        });
    }
}


        // === KOD KRESKOWY ===
        if (showEan && p['KOD EAN'] && !page.barcodeObjects[i]) {

    // ⭐⭐⭐ NORMALIZACJA KODU EAN ⭐⭐⭐
    const cleanEAN = normalizeEAN(p['KOD EAN']);  

    window.generateBarcode(cleanEAN, data => {

    if (!data) return;
    Konva.Image.fromURL(data, img => {

        // 🔥 KOPIA ORYGINALNEGO PNG — unikalna dla KAŻDEGO kodu
        const originalCopy = data.slice();      
        img.setAttr("barcodeOriginalSrc", originalCopy);

        const bw = 140;
        const bh = 40;
        const bx = x + (BW_dynamic - bw) / 1 - 35;
        const by = y + BH - bh - 20;

        const scaleFactor = 0.65;
        img.scaleX(scaleFactor);
        img.scaleY(scaleFactor);
        img.x(bx);
        img.y(by);

        img.draggable(true);
        img.dragBoundFunc(pos => pos);

        img.setAttrs({
            isBarcode: true,
            slotIndex: i,
            width: img.width(),
            height: img.height()
        });

        layer.add(img);
        page.barcodeObjects[i] = img;
        page.barcodePositions[i] = { x: bx, y: by };

        layer.batchDraw();
        transformerLayer.batchDraw();
    });
});

        }
    });

    // === BANER ===
    if (page.settings.bannerUrl) {
        const oldBanner = layer.getChildren().find(o => o.getAttr('name') === 'banner');
        if (oldBanner) oldBanner.destroy();

        Konva.Image.fromURL(page.settings.bannerUrl, img => {
            const scale = Math.min(W / img.width(), 113 / img.height());
            img.scaleX(scale);
            img.scaleY(scale);
            img.x(0);
            img.y(0);
            img.setAttr('name', 'banner');
            img.draggable(true);
            img.dragBoundFunc(pos => pos);
            layer.add(img);
            img.listening(true);
            img.setAttrs({
                width: img.width(),
                height: img.height()
            });
            img.moveToBottom();
            layer.batchDraw();
            transformerLayer.batchDraw();
        });
    } else {
        layer.batchDraw();
        transformerLayer.batchDraw();
    }
}

// === DODAJ STYL DLA KONVAJS-CONTENT ===
const konvaStyle = document.createElement('style');
konvaStyle.textContent = `
    .canvas-wrapper, .page-container { position: relative !important; }
    .konvajs-content { position: relative !important; }
`;
document.head.appendChild(konvaStyle);
// === STYL DLA NOWEGO MENU STRONY (PAGE TOOLBAR) ===
const pageToolbarStyle = document.createElement('style');
pageToolbarStyle.textContent = `
.page-toolbar {
    width: ${W}px;
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #5a6673;
    font-family: Arial;
}

.page-title {
    font-size: 18px;
    font-weight: 600;
    margin-left: 10px;
}

.page-tools {
    display: flex;
    gap: 8px;
}

.page-btn {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    border: 1px solid #ddd;
    background: #f3f3f3;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
}

.page-btn:hover {
    background: #e2e2e2;
}
`;
document.head.appendChild(pageToolbarStyle);
const tooltipStyle = document.createElement("style");
tooltipStyle.textContent = `
.page-btn {
    position: relative;
}

.page-btn:hover::after {
    content: attr(data-tip);
    position: absolute;
    top: -40px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: #fff;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 1;
    z-index: 999999;
}

.page-btn::after {
    opacity: 0;
    transition: opacity 0.2s ease;
}
`;
document.head.appendChild(tooltipStyle);



// === RESZTA FUNKCJI ===
function splitTextIntoLines(text, maxWidth, fontSize, fontFamily) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    const testCanvas = document.createElement('canvas');
    const ctx = testCanvas.getContext('2d');
    ctx.font = `${fontSize}px ${fontFamily}`;

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = ctx.measureText(testLine).width;
        if (width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
            if (lines.length >= 4) break;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);

    if (lines.length === 0 && ctx.measureText(text).width > maxWidth) {
        let cut = '';
        for (const char of text) {
            if (ctx.measureText(cut + char).width > maxWidth) break;
            cut += char;
        }
        lines.push(cut + '...');
    }
    return lines.slice(0, 4);
}

function generateBarcode(ean, cb) {
    const key = ean.trim().replace(/\s+/g, '');
    if (window.barcodeCache && window.barcodeCache[key]) return cb(window.barcodeCache[key]);

    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    try {
        JsBarcode(c, key, {
            format: 'EAN13',
            width: 2.2,
            height: 50,
            displayValue: true,
            fontSize: 14,
            margin: 5,
            marginLeft: 10,
            marginRight: 10,
            marginTop: 10,
            marginBottom: 10,
            flat: false,
            background: 'transparent',
            lineColor: '#000'
        });

        const imageData = ctx.getImageData(0, 0, c.width, c.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 240 && data[i+1] > 240 && data[i+2] > 240) {
                data[i + 3] = 0;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        const url = c.toDataURL('image/png');

        if (!window.barcodeCache) window.barcodeCache = {};
        window.barcodeCache[key] = url;
        cb(url);
    } catch (e) {
        console.error('Błąd generowania kodu kreskowego:', e);
        cb(null);
    }
}
window.recolorBarcode = function(konvaImage, color, finalApply = false) {

    let originalSrc = konvaImage.getAttr("barcodeOriginalSrc");
    if (!originalSrc) {
        // Fallback dla kodów po wczytaniu projektu/starszych danych:
        // budujemy bazę z aktualnego obrazu, aby recolor działał zawsze.
        const currentImg = konvaImage.image && konvaImage.image();
        if (currentImg) {
            try {
                const w = currentImg.naturalWidth || currentImg.width || Math.max(1, Math.round(konvaImage.width() || 1));
                const h = currentImg.naturalHeight || currentImg.height || Math.max(1, Math.round(konvaImage.height() || 1));
                const baseCanvas = document.createElement("canvas");
                baseCanvas.width = w;
                baseCanvas.height = h;
                const baseCtx = baseCanvas.getContext("2d");
                baseCtx.drawImage(currentImg, 0, 0, w, h);
                originalSrc = baseCanvas.toDataURL("image/png");
                konvaImage.setAttr("barcodeOriginalSrc", originalSrc);
            } catch (err) {
                console.error("Brak oryginalnego src dla kodu i nie udało się zbudować fallback:", err);
                return;
            }
        } else {
            console.error("Brak oryginalnego src dla kodu!");
            return;
        }
    }

    const img = new Image();
    img.src = originalSrc;

    img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        const rNew = parseInt(color.substring(1, 3), 16);
        const gNew = parseInt(color.substring(3, 5), 16);
        const bNew = parseInt(color.substring(5, 7), 16);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            if (r < 160 && g < 160 && b < 160) {
                data[i] = rNew;
                data[i+1] = gNew;
                data[i+2] = bNew;
            }
        }

        ctx.putImageData(imgData, 0, 0);
        const finalSrc = canvas.toDataURL("image/png");

        // 🔥 najważniejsze — tworzę NOWY obraz, NIE nadpisuję starego
        const recolored = new Image();
        recolored.onload = () => {
            konvaImage.image(recolored);   // bez nakładania bitmap
            // Zawsze zapamiętujemy aktualny kolor kodu, aby "Kopiuj styl"
            // działało także po zmianie koloru bez dodatkowego zatwierdzania.
            konvaImage.setAttr("barcodeColor", color);
            konvaImage.getLayer().batchDraw();
        };
        recolored.src = finalSrc;
    };
};

function openImageEffectsMenu(img) {
    ensureImageFX(img);
    const fx = getImageFxState(img);

    window.showSubmenu(`
        <div class="imgfx-panel">
            <div class="imgfx-section">
                <div class="imgfx-title">Podstawy</div>
                <div class="imgfx-row">
                    <label>Przezroczystość</label>
                    <input id="fxOpacity" type="range" min="0" max="100" value="${Math.round(fx.opacity * 100)}">
                    <span id="fxOpacityVal">${Math.round(fx.opacity * 100)}%</span>
                </div>
                <div class="imgfx-row">
                    <label>Cień</label>
                    <input id="fxShadowOn" type="checkbox" ${fx.shadowEnabled ? "checked" : ""}>
                    <input id="fxShadowColor" type="color" value="${normalizeHexColor(fx.shadowColor)}">
                </div>
                <div class="imgfx-row">
                    <label>Rozmycie cienia</label>
                    <input id="fxShadowBlur" type="range" min="0" max="60" value="${fx.shadowBlur}">
                </div>
                <div class="imgfx-row">
                    <label>Przesunięcie cienia</label>
                    <div class="imgfx-split">
                        <input id="fxShadowOffX" type="range" min="-40" max="40" value="${fx.shadowOffsetX}">
                        <input id="fxShadowOffY" type="range" min="-40" max="40" value="${fx.shadowOffsetY}">
                    </div>
                </div>
                <div class="imgfx-row">
                    <label>Intensywność cienia</label>
                    <input id="fxShadowOpacity" type="range" min="0" max="100" value="${Math.round(fx.shadowOpacity * 100)}">
                </div>
            </div>

            <div class="imgfx-section">
                <div class="imgfx-title">Korekta obrazu</div>
                <div class="imgfx-row">
                    <label>Jasność</label>
                    <input id="fxBrightness" type="range" min="-100" max="100" value="${fx.brightness}">
                </div>
                <div class="imgfx-row">
                    <label>Kontrast</label>
                    <input id="fxContrast" type="range" min="-100" max="100" value="${fx.contrast}">
                </div>
                <div class="imgfx-row">
                    <label>Nasycenie</label>
                    <input id="fxSaturation" type="range" min="-100" max="100" value="${fx.saturation}">
                </div>
                <div class="imgfx-row">
                    <label>Temperatura</label>
                    <input id="fxTemperature" type="range" min="-100" max="100" value="${fx.temperature}">
                </div>
            </div>

            <div class="imgfx-section">
                <div class="imgfx-title">Kolor / styl</div>
                <div class="imgfx-chips">
                    <button id="fxGrayscale" class="imgfx-chip ${fx.grayscale ? "is-active" : ""}">B&W</button>
                    <button id="fxSepia" class="imgfx-chip ${fx.sepia ? "is-active" : ""}">Sepia</button>
                </div>
            </div>

            <div class="imgfx-section">
                <div class="imgfx-title">Obrys / ramka</div>
                <div class="imgfx-row">
                    <label>Kolor obrysu</label>
                    <input id="fxStrokeColor" type="color" value="${normalizeHexColor(fx.strokeColor)}">
                </div>
                <div class="imgfx-row">
                    <label>Grubość obrysu</label>
                    <input id="fxStrokeWidth" type="range" min="0" max="20" value="${fx.strokeWidth}">
                </div>
            </div>

            <div class="imgfx-section">
                <div class="imgfx-title">Rozmycie tła (focus)</div>
                <div class="imgfx-row">
                    <label>Siła rozmycia</label>
                    <input id="fxBgBlur" type="range" min="0" max="40" value="${fx.bgBlur}">
                </div>
            </div>
            <div class="imgfx-section">
                <div class="imgfx-title">Reset</div>
                <div class="imgfx-row">
                    <label>Przywróć</label>
                    <button id="fxResetBtn" class="imgfx-chip">Domyślne</button>
                </div>
                <div class="imgfx-row">
                    <label>Na wszystkie</label>
                    <button id="fxApplyAllBtn" class="imgfx-chip">Zastosuj</button>
                </div>
            </div>
        </div>
    `, { width: "900px", className: "imgfx-submenu" });

    const onNum = (id, cb) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.oninput = (e) => cb(parseFloat(e.target.value));
    };
    const onColor = (id, cb) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.oninput = (e) => cb(e.target.value);
    };

    onNum("fxOpacity", (v) => {
        document.getElementById("fxOpacityVal").textContent = `${Math.round(v)}%`;
        img.setAttr("fxOpacity", v / 100);
        applyImageFX(img);
    });

    const shadowOn = document.getElementById("fxShadowOn");
    if (shadowOn) {
        shadowOn.onchange = (e) => {
            img.setAttr("fxShadowEnabled", e.target.checked);
            if (e.target.checked) {
                const blur = Number.isFinite(img.getAttr("fxShadowBlur")) ? img.getAttr("fxShadowBlur") : 0;
                if (blur <= 0) img.setAttr("fxShadowBlur", 22);
                const op = Number.isFinite(img.getAttr("fxShadowOpacity")) ? img.getAttr("fxShadowOpacity") : 0;
                if (op <= 0) img.setAttr("fxShadowOpacity", 0.5);
                const offX = Number.isFinite(img.getAttr("fxShadowOffsetX")) ? img.getAttr("fxShadowOffsetX") : 6;
                const offY = Number.isFinite(img.getAttr("fxShadowOffsetY")) ? img.getAttr("fxShadowOffsetY") : 8;
                img.setAttr("fxShadowOffsetX", offX);
                img.setAttr("fxShadowOffsetY", offY);
                img.setAttr("fxShadowColor", img.getAttr("fxShadowColor") || "#000000");
            }
            applyImageFX(img);
        };
    }
    onColor("fxShadowColor", (v) => {
        img.setAttr("fxShadowEnabled", true);
        if (shadowOn) shadowOn.checked = true;
        img.setAttr("fxShadowColor", v);
        applyImageFX(img);
    });
    onNum("fxShadowBlur", (v) => {
        img.setAttr("fxShadowEnabled", true);
        if (shadowOn) shadowOn.checked = true;
        img.setAttr("fxShadowBlur", v);
        applyImageFX(img);
    });
    onNum("fxShadowOffX", (v) => {
        img.setAttr("fxShadowEnabled", true);
        if (shadowOn) shadowOn.checked = true;
        img.setAttr("fxShadowOffsetX", v);
        applyImageFX(img);
    });
    onNum("fxShadowOffY", (v) => {
        img.setAttr("fxShadowEnabled", true);
        if (shadowOn) shadowOn.checked = true;
        img.setAttr("fxShadowOffsetY", v);
        applyImageFX(img);
    });
    onNum("fxShadowOpacity", (v) => {
        img.setAttr("fxShadowEnabled", true);
        if (shadowOn) shadowOn.checked = true;
        img.setAttr("fxShadowOpacity", v / 100);
        applyImageFX(img);
    });

    onNum("fxBrightness", (v) => { img.setAttr("fxBrightness", v); applyImageFX(img); });
    onNum("fxContrast", (v) => { img.setAttr("fxContrast", v); applyImageFX(img); });
    onNum("fxSaturation", (v) => { img.setAttr("fxSaturation", v); applyImageFX(img); });
    onNum("fxTemperature", (v) => { img.setAttr("fxTemperature", v); applyImageFX(img); });

    const bwBtn = document.getElementById("fxGrayscale");
    if (bwBtn) {
        bwBtn.onclick = () => {
            const next = !img.getAttr("fxGrayscale");
            img.setAttr("fxGrayscale", next);
            bwBtn.classList.toggle("is-active", next);
            applyImageFX(img);
        };
    }
    const sepiaBtn = document.getElementById("fxSepia");
    if (sepiaBtn) {
        sepiaBtn.onclick = () => {
            const next = !img.getAttr("fxSepia");
            img.setAttr("fxSepia", next);
            sepiaBtn.classList.toggle("is-active", next);
            applyImageFX(img);
        };
    }

    onColor("fxStrokeColor", (v) => { img.setAttr("fxStrokeColor", v); applyImageFX(img); });
    onNum("fxStrokeWidth", (v) => { img.setAttr("fxStrokeWidth", v); applyImageFX(img); });

    onNum("fxBgBlur", (v) => { img.setAttr("fxBgBlur", v); applyImageFX(img); });

    const resetBtn = document.getElementById("fxResetBtn");
    if (resetBtn) {
        resetBtn.onclick = () => {
            img.setAttrs({
                fxOpacity: 1,
                fxShadowEnabled: false,
                fxShadowColor: "#000000",
                fxShadowBlur: 0,
                fxShadowOffsetX: 0,
                fxShadowOffsetY: 0,
                fxShadowOpacity: 0.35,
                fxBrightness: 0,
                fxContrast: 0,
                fxSaturation: 0,
                fxTemperature: 0,
                fxGrayscale: false,
                fxSepia: false,
                fxStrokeColor: "#000000",
                fxStrokeWidth: 0,
                fxBgBlur: 0
            });
            // UI sync (twardo na żywo)
            const ids = [
                ["fxOpacity", 100],
                ["fxShadowOn", false],
                ["fxShadowColor", "#000000"],
                ["fxShadowBlur", 0],
                ["fxShadowOffX", 0],
                ["fxShadowOffY", 0],
                ["fxShadowOpacity", 35],
                ["fxBrightness", 0],
                ["fxContrast", 0],
                ["fxSaturation", 0],
                ["fxTemperature", 0],
                ["fxStrokeColor", "#000000"],
                ["fxStrokeWidth", 0],
                ["fxBgBlur", 0]
            ];
            ids.forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (!el) return;
                if (el.type === "checkbox") el.checked = !!val;
                else el.value = String(val);
            });
            const bwBtn = document.getElementById("fxGrayscale");
            if (bwBtn) bwBtn.classList.remove("is-active");
            const sepiaBtn = document.getElementById("fxSepia");
            if (sepiaBtn) sepiaBtn.classList.remove("is-active");
            const opVal = document.getElementById("fxOpacityVal");
            if (opVal) opVal.textContent = "100%";
            applyImageFX(img);
        };
    }

    const applyAllBtn = document.getElementById("fxApplyAllBtn");
    if (applyAllBtn) {
        applyAllBtn.onclick = () => {
            const fx = getImageFxState(img);
            const isValidImage = (node) => {
                if (!(node instanceof Konva.Image)) return false;
                if (node.getAttr("isBgBlur")) return false;
                if (node.getAttr("isBarcode")) return false;
                if (node.getAttr("isTNZBadge")) return false;
                if (node.getAttr("isCountryBadge")) return false;
                if (node.getAttr("isOverlayElement")) return false;
                return true;
            };

            pages.forEach(p => {
                p.layer.find(n => isValidImage(n)).forEach(target => {
                    target.setAttrs({
                        fxOpacity: fx.opacity,
                        fxShadowEnabled: fx.shadowEnabled,
                        fxShadowColor: fx.shadowColor,
                        fxShadowBlur: fx.shadowBlur,
                        fxShadowOffsetX: fx.shadowOffsetX,
                        fxShadowOffsetY: fx.shadowOffsetY,
                        fxShadowOpacity: fx.shadowOpacity,
                        fxBrightness: fx.brightness,
                        fxContrast: fx.contrast,
                        fxSaturation: fx.saturation,
                        fxTemperature: fx.temperature,
                        fxGrayscale: fx.grayscale,
                        fxSepia: fx.sepia,
                        fxStrokeColor: fx.strokeColor,
                        fxStrokeWidth: fx.strokeWidth,
                        fxBgBlur: fx.bgBlur
                    });
                    applyImageFX(target);
                });
            });
        };
    }
}


// === SUBMENU POD FLOATING MENU ===
const submenu = document.createElement("div");
submenu.id = "floatingSubmenu";
submenu.style.cssText = `
    position: fixed;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    background: #fff;
    padding: 12px 18px;
    border-radius: 16px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.25);
    border: 1px solid #ccc;
    z-index: 99998;
    display: none;
    gap: 12px;
    align-items: center;
`;
document.body.appendChild(submenu);

window.showSubmenu = (html, opts = {}) => {
    const floating = document.getElementById("floatingMenu");
    const submenuWidth = opts.width || (floating ? floating.offsetWidth + "px" : "auto");

    submenu.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center;width:${submenuWidth};justify-content:center;">
            ${html}
        </div>
    `;
    submenu.className = opts.className || "";
    submenu.style.maxWidth = opts.maxWidth || "92vw";
    submenu.style.display = "flex";
    // pozycjonowanie względem aktualnej strony/menupaska
    if (floating) {
        const fRect = floating.getBoundingClientRect();
        submenu.style.left = `${fRect.left + fRect.width / 2}px`;
        submenu.style.top = `${fRect.bottom + 8}px`;
        submenu.style.transform = 'translateX(-50%)';
    } else {
        const active = window.pages?.find(p => p.stage === document.activeStage);
        const wrap =
            active?.container?.querySelector('.page-zoom-wrap') ||
            active?.container?.querySelector('.canvas-wrapper');
        if (wrap) {
            const rect = wrap.getBoundingClientRect();
            submenu.style.left = `${rect.left + rect.width / 2}px`;
            submenu.style.top = `${Math.max(12, rect.top + 12)}px`;
            submenu.style.transform = 'translateX(-50%)';
        }
    }
};

window.hideSubmenu = () => {
    submenu.style.display = "none";
    submenu.className = "";
};

// zamknij submenu klikając poza nim
document.addEventListener("click", (e) => {
    if (e.target && e.target.type === "color") return;
    if (!e.target.closest("#floatingMenu") &&
        !e.target.closest("#floatingSubmenu")) {
        if (window._activeTextToolbarNode) {
            return;
        }
        if (typeof window._shapeToolsHasSelection === "function" && window._shapeToolsHasSelection()) {
            return;
        }
        window.hideSubmenu();
    }
});



window.importImagesFromFiles = function(filesOverride) {
    const input = document.getElementById('imageInput');
    const files = filesOverride || input?.files;
    if (!files || files.length === 0) return alert('Wybierz zdjęcia!');
    if (!pages || pages.length === 0) {
        return alert('Najpierw zaimportuj Excel!');
    }

    const map = new Map();
    pages.forEach((page, pi) => {
        if (page.isCover) return;
        if (!page.products) return;
        page.products.forEach((p, si) => {
            if (!p.INDEKS) return;
            const key = p.INDEKS.toLowerCase().trim();
            if (!map.has(key)) map.set(key, []);
            map.get(key).push({ pageIndex: pi, slotIndex: si });
        });
    });

    const matched = [];
    Array.from(files).forEach(file => {
        const name = file.name.toLowerCase().replace(/\.[^/.]+$/, '').replace(/[^0-9a-z]/g, '');
        for (const [indeks, positions] of map) {
            const clean = indeks.replace(/[^0-9a-z]/g, '');
            if (name.includes(clean) || clean.includes(name)) {
                matched.push({ file, positions, indeksKey: indeks });
                break;
            }
        }
    });

    if (matched.length === 0) return alert('Brak dopasowań');

    let styleRefreshRequested = false;
    const refreshCatalogStyleAfterImages = () => {
        if (styleRefreshRequested) return;
        styleRefreshRequested = true;
        setTimeout(() => {
            styleRefreshRequested = false;
            if (
                window.CATALOG_STYLE === "styl_elegancki" &&
                typeof window.applyCatalogStyleVisual === "function"
            ) {
                window.applyCatalogStyleVisual(window.CATALOG_STYLE);
            }
        }, 0);
    };

    matched.forEach(({ file, positions, indeksKey }) => {
      const reader = new FileReader();
      reader.onload = e => {
          const imgData = e.target.result;
          if (indeksKey) {
              window.productImageCache[indeksKey] = imgData;
          }
  
          Konva.Image.fromURL(imgData, img => {
  
              positions.forEach(({ pageIndex, slotIndex }) => {
                  const page = pages[pageIndex];
  
                  if (page.slotObjects[slotIndex]) {
                      page.slotObjects[slotIndex].destroy();
                  }
  
                  let scale = Math.min(
                      (BW * 0.45 - 20) / img.width(),
                      (BH * 0.6) / img.height(),
                      1
                  );
  
                  let x = ML + (slotIndex % COLS) * (BW + GAP) + 20;
let y = MT + Math.floor(slotIndex / COLS) * (BH + GAP) + 100;

// 🔥 przesunięcie zdjęć tylko w layout8
if (window.LAYOUT_MODE === "layout8") {
    y -= 80;   // podnieś zdjęcie wyżej
    x += 5;    // opcjonalnie wyrównanie w poziomie

    // ✅ stała ramka, równe pozycje i skala
    const boxW = BW_dynamic * 0.48;
    const boxH = BH_dynamic * 0.52;
    scale = Math.min(boxW / img.width(), boxH / img.height(), 1);
    x = x + 12 + (boxW - img.width() * scale) / 2;
    y = y + (boxH - img.height() * scale) / 2;
}

  
                  const clone = img.clone();
                  clone.x(x);
                  clone.y(y);
                  clone.scaleX(scale);
                  clone.scaleY(scale);
                  clone.draggable(true);
                  clone.dragBoundFunc(pos => pos);
  
                  page.layer.add(clone);
                  clone.listening(true);
  
                  clone.setAttrs({
                      width: clone.width(),
                      height: clone.height(),
                      isProductImage: true,
                      slotIndex: slotIndex,
                      originalSrc: imgData
                  });
  // 🔥 CANVA STYLE SHADOW DLA PNG
setupProductImageDrag(clone, page.layer);
addImageShadow(page.layer, clone);
                  clone.moveToTop();

              
                  page.slotObjects[slotIndex] = clone;
  
                  page.layer.batchDraw();
                  page.transformerLayer.batchDraw();
              });
              refreshCatalogStyleAfterImages();
          });
      };
      reader.readAsDataURL(file);
  });
  
          

    if (!filesOverride && input) input.value = '';
    if (typeof window.quickStatusUpdate === "function") {
        window.quickStatusUpdate("images", matched.length > 0);
    }
    if (matched.length > 0) {
        const quickImagesBtn = document.getElementById('quickImagesBtn');
        if (quickImagesBtn) {
            quickImagesBtn.classList.remove('error');
            quickImagesBtn.classList.add('done');
        }
    }
    if (typeof window.showAppToast === "function") {
        window.showAppToast(`Zaimportowano ${matched.length} zdjęć`, matched.length > 0 ? "success" : "error");
    } else {
        alert(`Zaimportowano ${matched.length} zdjęć`);
    }
};

window.applyCachedProductImages = function() {
    if (!window.productImageCache) return;
    if (!Array.isArray(pages) || pages.length === 0) return;
    if (!window.allProducts || !window.allProducts.length) return;

    const map = new Map();
    pages.forEach((page, pi) => {
        if (page.isCover) return;
        if (!page.products) return;
        page.products.forEach((p, si) => {
            if (!p.INDEKS) return;
            const key = p.INDEKS.toLowerCase().trim();
            if (!map.has(key)) map.set(key, []);
            map.get(key).push({ pageIndex: pi, slotIndex: si });
        });
    });

    let styleRefreshRequested = false;
    const refreshCatalogStyleAfterImages = () => {
        if (styleRefreshRequested) return;
        styleRefreshRequested = true;
        setTimeout(() => {
            styleRefreshRequested = false;
            if (
                window.CATALOG_STYLE === "styl_elegancki" &&
                typeof window.applyCatalogStyleVisual === "function"
            ) {
                window.applyCatalogStyleVisual(window.CATALOG_STYLE);
            }
        }, 0);
    };

    Object.keys(window.productImageCache).forEach((indeksKey) => {
        const imgData = window.productImageCache[indeksKey];
        const positions = map.get(indeksKey);
        if (!imgData || !positions || positions.length === 0) return;

        Konva.Image.fromURL(imgData, img => {
            positions.forEach(({ pageIndex, slotIndex }) => {
                const page = pages[pageIndex];
                if (!page) return;

                if (page.slotObjects[slotIndex]) {
                    page.slotObjects[slotIndex].destroy();
                }

                const scale = Math.min(
                    (BW * 0.45 - 20) / img.width(),
                    (BH * 0.6) / img.height(),
                    1
                );

                let x = ML + (slotIndex % COLS) * (BW + GAP) + 20;
                let y = MT + Math.floor(slotIndex / COLS) * (BH + GAP) + 100;

                if (window.LAYOUT_MODE === "layout8") {
                    y -= 80;
                    x += 5;
                }

                const clone = img.clone();
                clone.x(x);
                clone.y(y);
                clone.scaleX(scale);
                clone.scaleY(scale);
                clone.draggable(true);
                clone.dragBoundFunc(pos => pos);

                page.layer.add(clone);
                clone.listening(true);

                clone.setAttrs({
                    width: clone.width(),
                    height: clone.height(),
                    isProductImage: true,
                    slotIndex: slotIndex,
                    originalSrc: imgData
                });

                setupProductImageDrag(clone, page.layer);
                addImageShadow(page.layer, clone);
                clone.moveToTop();

                page.slotObjects[slotIndex] = clone;
                page.layer.batchDraw();
                page.transformerLayer.batchDraw();
            });
            refreshCatalogStyleAfterImages();
        });
    });
};

// Auto-import po wybraniu plików (bez klikania przycisku)
const imageInputAuto = document.getElementById('imageInput');
if (imageInputAuto) {
    imageInputAuto.addEventListener('change', () => {
        window.importImagesFromFiles();
    });
}
async function removeBackgroundAI(imgData, cb, options = {}) {
    const src = String(imgData || "").trim();
    if (!src) {
        const err = new Error("Brak danych obrazu do usunięcia tła.");
        if (typeof cb === "function") cb("");
        throw err;
    }

    const cacheKey = `${RMBG_PIPELINE_VERSION}|${src}`;
    const cached = getRmbgCache(cacheKey);
    if (cached) {
        if (typeof cb === "function") {
            try { cb(cached); } catch (_e) {}
        }
        return cached;
    }

    if (rmbgInflight.has(cacheKey)) {
        const inflightPromise = rmbgInflight.get(cacheKey);
        const out = await inflightPromise;
        if (typeof cb === "function") {
            try { cb(out); } catch (_e) {}
        }
        return out;
    }

    const taskPromise = enqueueRmbgTask({
        imgData: src,
        options
    }).then((out) => {
        setRmbgCache(cacheKey, out);
        return out;
    }).finally(() => {
        rmbgInflight.delete(cacheKey);
    });

    rmbgInflight.set(cacheKey, taskPromise);

    try {
        const output = await taskPromise;
        if (typeof cb === "function") {
            try { cb(output); } catch (_e) {}
        }
        if (typeof window.showAppToast === "function") {
            window.showAppToast("Usunięto tło zdjęcia.", "success");
        }
        return output;
    } catch (err) {
        if (typeof window.showAppToast === "function") {
            window.showAppToast(`Błąd usuwania tła: ${String(err?.message || err)}`, "error");
        }
        throw err;
    }
}




window.generatePDF = async function(pageSelection) {
    if (!pages.length) return alert('Brak stron');

    const pdf = new jsPDF({
        orientation: 'p',
        unit: 'px',
        format: [W, H]
    });

    let exportPages = pages;
    if (Array.isArray(pageSelection) && pageSelection.length > 0) {
        const byNumber = new Map(pages.map(p => [p.number, p]));
        exportPages = pageSelection
            .map(n => byNumber.get(Number(n)))
            .filter(Boolean);
        if (exportPages.length === 0) {
            alert('Zakres stron jest pusty.');
            return;
        }
    }

    for (let i = 0; i < exportPages.length; i++) {
        const page = exportPages[i];

        // 🔹 1. Ukryj transformer na tej stronie na czas eksportu
        if (page.transformer) {
            page.transformer.visible(false);
        }
        if (page.transformerLayer) {
            page.transformerLayer.hide();
            page.transformerLayer.batchDraw();
        }

        // 🔹 2. Ukryj siatkę (jeśli jest) na czas eksportu
        const overlay = document.getElementById(`g${page.number}`);
        if (overlay) overlay.style.display = 'none';

        // 🔹 3. Render sceny do obrazka (JUŻ BEZ UCHWYTÓW)
        const data = page.stage.toDataURL({
    mimeType: "image/jpeg",
    quality: 1.0,    // bardzo dobra jakość
    pixelRatio: 3   // bardzo ostry PDF
});

        // 🔹 4. Dodaj stronę do PDF
        if (i > 0) pdf.addPage();
        pdf.addImage(data, 'PNG', 0, 0, W, H);

        // 🔹 5. Przywróć siatkę
        if (overlay) overlay.style.display = '';

        // 🔹 6. Przywróć transformer po eksporcie
        if (page.transformer) {
            page.transformer.visible(true);
        }
        if (page.transformerLayer) {
            page.transformerLayer.show();
            page.transformerLayer.batchDraw();
        }
    }

    pdf.save('katalog.pdf');
};


window.generatePDFBlob = async function() {
    if (!pages.length) throw new Error();

    const pdf = new jsPDF({
        orientation: 'p',
        unit: 'px',
        format: [W, H]
    });


    for (let i = 0; i < pages.length; i++) {

    // --- USUNIĘCIE overlay PRZED renderem PDF ---
    const overlay = document.getElementById(`g${pages[i].number}`);
    let overlayParent = null;

    if (overlay) {
        overlayParent = overlay.parentNode;
        overlay.remove();  // 🔥 to usuwa białą linię na 100%
    }

    // --- RENDER STRONY ---
    // JPEG zamiast PNG + mniejszy pixelRatio
const data = pages[i].stage.toDataURL({
    mimeType: "image/jpeg",
    quality: 0.82,   // 🔥 lepsza jakość
    pixelRatio: 1.35 // 🔥 ostro, ale nadal lekko
});



    if (i > 0) pdf.addPage();
    pdf.addImage(data, 'PNG', 0, 0, W, H);

    // --- PRZYWRÓCENIE overlay PO renderze ---
    if (overlay && overlayParent) {
        overlayParent.appendChild(overlay);
    }
}

return pdf.output('blob');

};

window.clearAll = function() {
    pages.forEach(p => {
        p.stage?.destroy();
        p.container?.remove();
    });
    pages = [];
    document.getElementById('pagesContainer').innerHTML = '';

    window.ExcelImporterReady = false;

    window.ExcelImporter = null;

    const pdfButton = document.getElementById('pdfButton');
    if (pdfButton) pdfButton.disabled = true;

    const slider = document.getElementById('zoomSlider');
    if (slider) slider.remove();
    const footer = document.getElementById('appFooterBar');
    if (footer) footer.remove();

    const menu = document.getElementById('floatingMenu');
    if (menu) menu.remove();

    if (typeof window.setProjectTitle === "function") {
        window.setProjectTitle("Katalog produktów");
    }
    if (typeof window.resetProjectHistory === "function") {
        window.resetProjectHistory(null);
    }
};

const floatingBtnStyle = document.createElement('style');
floatingBtnStyle.textContent = `
    .fab-btn {
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 600;
        border: 1px solid #e6eaf2;
        border-radius: 999px;
        cursor: pointer;
        color: #0f172a;
        background: #ffffff;
        min-width: 84px;
        transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
        letter-spacing: 0.1px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 1px 0 rgba(15,23,42,0.04);
    }
    .fab-btn i { font-size: 13px; opacity: 0.85; }
    .fab-copy { border-color:#e6eaf2; color:#1f2937; }
    .fab-stylecopy { border-color:#e6eaf2; color:#1f2937; }
    .fab-cut { border-color:#e6eaf2; color:#1f2937; }
    .fab-delete { border-color:#fde2e2; color:#b91c1c; }
    .fab-front { border-color:#e6eaf2; color:#1f2937; }
    .fab-back { border-color:#e6eaf2; color:#1f2937; }
    .fab-forward { border-color:#e6eaf2; color:#1f2937; }
    .fab-backward { border-color:#e6eaf2; color:#1f2937; }
    .fab-removebg { border-color:#e6eaf2; color:#1f2937; }
    .fab-effects { border-color:#e6eaf2; color:#1f2937; }
    .fab-barcolor { border-color:#e6eaf2; color:#1f2937; }
    .fab-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 22px rgba(15,23,42,0.12);
        border-color:#cbd5e1;
        background:#f8fafc;
    }
    #groupQuickMenu .group-quick-btn {
        border: 1px solid #d1d5db;
        background: #ffffff;
        color: #111827;
        border-radius: 999px;
        padding: 7px 14px;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        letter-spacing: 0.2px;
    }
    #groupQuickMenu .group-quick-btn:hover {
        background: #f8fafc;
        border-color: #9ca3af;
    }
`;
document.head.appendChild(floatingBtnStyle);
const imgFxStyle = document.createElement('style');
imgFxStyle.textContent = `
    .imgfx-submenu {
        padding: 10px 12px;
    }
    .imgfx-panel {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        min-width: 860px;
        max-width: 940px;
        max-height: 32vh;
        overflow: auto;
        font-family: Arial, sans-serif;
    }
    .imgfx-section {
        padding: 8px 10px;
        border: 1px solid #eef2f7;
        border-radius: 12px;
        background: #f8fafc;
    }
    .imgfx-title {
        font-size: 12px;
        font-weight: 700;
        color: #64748b;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
    }
    .imgfx-row {
        display: grid;
        grid-template-columns: 120px 1fr auto;
        align-items: center;
        gap: 10px;
        padding: 4px 0;
        font-size: 12px;
        color: #334155;
    }
    .imgfx-row input[type="range"] {
        width: 100%;
        accent-color: #2563eb;
    }
    .imgfx-row input[type="color"] {
        width: 32px;
        height: 24px;
        border: none;
        background: transparent;
        padding: 0;
        cursor: pointer;
    }
    .imgfx-split {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        width: 100%;
    }
    .imgfx-chips {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }
    .imgfx-chip {
        padding: 6px 12px;
        border-radius: 999px;
        border: 1px solid #e5e7eb;
        background: #ffffff;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        color: #111827;
    }
    .imgfx-chip.is-active {
        border-color: #2563eb;
        background: #eaf2ff;
        color: #1d4ed8;
    }
`;
document.head.appendChild(imgFxStyle);
// =====================================================
// PDF CANVA – OBIEKTOWY (EDYTOWALNY)
// =====================================================
window.generateCanvaPDF = async function (pageNumbers) {

    if (!pages.length) {
        alert("Brak stron");
        return;
    }

    const pdf = new jsPDF({
        orientation: "p",
        unit: "px",
        format: [W, H]
    });

    for (let pi = 0; pi < pages.length; pi++) {
        const page = pages[pi];

        if (pi > 0) pdf.addPage();

        // === TŁO STRONY ===
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, W, H, "F");

        // === ITERACJA PO OBIEKTACH KONVA ===
        page.layer.getChildren().forEach(node => {

            // =====================
            // BOX
            // =====================
           // wyraźny box jak w Canvie
pdf.setDrawColor(180);          // ciemniejsza ramka
pdf.setLineWidth(2);            // grubsza linia
pdf.setFillColor(250, 250, 250); // lekko szare tło

pdf.roundedRect(
  x,
  y,
  w,
  h,
  14,
  14,
  "FD"
);


            // =====================
            // TEKST (NAZWA, INDEKS)
            // =====================
            if (node instanceof Konva.Text && node.getAttr("isProductText")) {

                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(node.fontSize());
                pdf.setTextColor(0);

                pdf.text(
                    node.text(),
                    node.x(),
                    node.y() + node.fontSize()
                );
            }

            // === CENA – GROUP (KONIECZNIE TU!) ===
if (node instanceof Konva.Group && node.getAttr("isPriceGroup")) {

  node.getChildren().forEach(t => {
    if (!(t instanceof Konva.Text)) return;

    pdf.setFont(
      "helvetica",
      t.fontStyle() === "bold" ? "bold" : "normal"
    );
    pdf.setFontSize(t.fontSize());
    pdf.setTextColor(0);

    pdf.text(
      t.text(),
      node.x() + t.x(),
      node.y() + t.y() + t.fontSize()
    );
  });
}


            // =====================
            // OBRAZY (produkt, flagi, TNZ)
            // =====================
            if (node instanceof Konva.Image) {
                const img = node.image();
                if (!img) return;

                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0);

                    const dataURL = canvas.toDataURL("image/png");

                    pdf.addImage(
                        dataURL,
                        "PNG",
                        node.x(),
                        node.y(),
                        node.width() * node.scaleX(),
                        node.height() * node.scaleY()
                    );
                } catch (e) {
                    console.warn("Nie udało się dodać obrazu", e);
                }
            }
        });
    }

    pdf.save("katalog_canva_editable.pdf");
};


// === UNDO/REDO — CAŁY PROJEKT (LOKALNIE) ===
(function() {
    const LIMIT = 30;
    const history = {
        undo: [],
        redo: [],
        current: null,
        isApplying: false,
        debounceTimer: null
    };
    window.projectHistory = history;

    function updateButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) undoBtn.disabled = history.undo.length === 0;
        if (redoBtn) redoBtn.disabled = history.redo.length === 0;
    }

    function snapshotProject() {
        if (typeof window.collectProjectData !== "function") return null;
        return window.collectProjectData();
    }

    function pushState(state) {
        if (!state || history.isApplying) return;
        if (history.current) history.undo.push(history.current);
        history.current = state;
        history.redo = [];
        if (history.undo.length > LIMIT) history.undo.shift();
        updateButtons();
    }

    function applyState(state) {
        if (!state || typeof window.loadProjectFromData !== "function") return;
        history.isApplying = true;
        window.loadProjectFromData(state, { silent: true });
        history.isApplying = false;
        updateButtons();
    }

    function undo() {
        if (history.undo.length === 0) return;
        history.redo.push(history.current);
        history.current = history.undo.pop();
        applyState(history.current);
    }

    function redo() {
        if (history.redo.length === 0) return;
        history.undo.push(history.current);
        history.current = history.redo.pop();
        applyState(history.current);
    }

    function scheduleSnapshot() {
        if (history.isApplying) return;
        if (history.debounceTimer) clearTimeout(history.debounceTimer);
        history.debounceTimer = setTimeout(() => {
            const state = snapshotProject();
            if (state) pushState(state);
        }, 300);
    }

    window.resetProjectHistory = (state) => {
        history.undo = [];
        history.redo = [];
        history.current = state || snapshotProject();
        updateButtons();
    };

    window.undoProject = undo;
    window.redoProject = redo;

    // Zapis stanu przy zmianach
    window.addEventListener('canvasModified', () => {
        scheduleSnapshot();
    });

    // Inicjalny snapshot (po starcie)
    window.addEventListener('load', () => {
        setTimeout(() => {
            if (!history.current) {
                const state = snapshotProject();
                if (state) pushState(state);
            }
        }, 0);
    });
})();

window.ExcelImporterReady = false;
// === GLOBALNE ODZNACZANIE POZA KONTENEREM ROBOCZYM ===
document.addEventListener('click', (e) => {
  if (e.target && e.target.type === "color") return;
  const clickedInsidePage = e.target.closest('.page-container');
  const clickedInsideMenus =
    e.target.closest('#floatingMenu') ||
    e.target.closest('#floatingSubmenu') ||
    e.target.closest('#shapePanel');

  if (!clickedInsidePage && !clickedInsideMenus) {
    pages.forEach(page => {
      page.selectedNodes = [];
      page.transformer.nodes([]);

      // 🔥 USUNIĘCIE WSZYSTKICH DASH-OUTLINE
      page.layer.find('.selectionOutline').forEach(n => n.destroy());
      page.layer.batchDraw();

      page.transformerLayer.batchDraw();
    });

    const menu = document.getElementById('floatingMenu');
    if (menu) menu.remove();
    window.hideTextToolbar?.();
    window.hideTextPanel?.();
  }
});

// === GLOBALNE UNDO/REDO Z GUI + SKRÓTY KLAWISZOWE ===
document.addEventListener('keydown', (e) => {
    if (window.isEditingText) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (typeof window.undoProject === "function") window.undoProject();
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (typeof window.redoProject === "function") window.redoProject();
    }
});

document.getElementById('undoBtn')?.addEventListener('click', () => {
    if (typeof window.undoProject === "function") window.undoProject();
});

document.getElementById('redoBtn')?.addEventListener('click', () => {
    if (typeof window.redoProject === "function") window.redoProject();
});

// === PRZESUWANIE ZAZNACZEŃ STRZAŁKAMI (CANVA STYLE) ===
document.addEventListener('keydown', (e) => {
    if (window.isEditingText) return;
    if (window.globalPasteMode) return;

    const tag = (document.activeElement && document.activeElement.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(e.key)) return;

    const page = pages.find(p => p.stage === document.activeStage) || pages[0];
    if (!page || !page.selectedNodes || page.selectedNodes.length === 0) return;

    e.preventDefault();

    const step = e.shiftKey ? 10 : 1;
    let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    if (e.key === 'ArrowRight') dx = step;
    if (e.key === 'ArrowUp') dy = -step;
    if (e.key === 'ArrowDown') dy = step;

    page.selectedNodes.forEach(node => {
        node.x(node.x() + dx);
        node.y(node.y() + dy);
    });

    page.layer.batchDraw();
    page.transformerLayer.batchDraw();
    window.dispatchEvent(new CustomEvent('canvasModified', { detail: page.stage }));
});

// Gdy modyfikujemy cokolwiek na stronie → oznacz ją jako aktywną
window.addEventListener('canvasModified', (e) => {
    document.activeStage = e.detail;
    window.projectDirty = true;
});

// ===============================================
// SKRÓTY KLAWISZOWE (CTRL+C / CTRL+V / CTRL+X / DEL)
// ===============================================
function getActivePage() {
    const stage = document.activeStage;
    if (!stage) return pages[0] || null;
    return pages.find(p => p.stage === stage) || pages[0] || null;
}

function pasteClipboardToPage(page, pointer) {
    const detachCloneFromCatalogSlot = (node) => {
        if (!node || !node.setAttr) return;
        node.setAttr("slotIndex", null);
        if (node.getAttr && node.getAttr("isAutoSlotGroup")) {
            node.setAttr("isAutoSlotGroup", false);
        }
        if (node.getChildren) node.getChildren().forEach(detachCloneFromCatalogSlot);
    };

    const clip = window.globalClipboard;
    if (!Array.isArray(clip) || clip.length === 0) return;

    const baseX = clip[0].x();
    const baseY = clip[0].y();
    const newNodes = [];

    clip.forEach(src => {
        const clone = src.clone({
            draggable: true,
            listening: true
        });
        detachCloneFromCatalogSlot(clone);
        clone.x(pointer.x + (src.x() - baseX));
        clone.y(pointer.y + (src.y() - baseY));
        clone.setAttrs({
            isProductText: src.getAttr("isProductText") || false,
            isName: src.getAttr("isName") || false,
            isIndex: src.getAttr("isIndex") || false,
            isPrice: src.getAttr("isPrice") || false,
            isBox: src.getAttr("isBox") || false,
            isBarcode: src.getAttr("isBarcode") || false,
            isProductImage: src.getAttr("isProductImage") || false,
            slotIndex: null
        });
        page.layer.add(clone);
        rebindEditableTextForClone(clone, page);
        newNodes.push(clone);
    });

    page.layer.batchDraw();
    page.transformerLayer.batchDraw();
    page.selectedNodes = newNodes;
    page.transformer.nodes(newNodes);
}

document.addEventListener('keydown', (e) => {
    if (window.isEditingText) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || document.activeElement?.isContentEditable) return;

    const page = getActivePage();
    if (!page) return;

    const key = e.key.toLowerCase();
    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl && key === 'c') {
        e.preventDefault();
        const nodes = normalizeSelection(page.selectedNodes);
        if (!nodes.length) return;
        window.globalClipboard = nodes.map(n => {
            const clone = n.clone({ draggable: true, listening: true });
            clone.getChildren?.().forEach(c => c.listening(true));
            return clone;
        });
        window.globalPasteMode = false;
        return;
    }

    if (isCtrl && key === 'x') {
        e.preventDefault();
        const nodes = normalizeSelection(page.selectedNodes);
        if (!nodes.length) return;
        window.globalClipboard = nodes.map(n => {
            const clone = n.clone({ draggable: true, listening: true });
            clone.getChildren?.().forEach(c => c.listening(true));
            return clone;
        });
        nodes.forEach(n => n.destroy());
        page.selectedNodes = [];
        page.transformer.nodes([]);
        page.layer.batchDraw();
        page.transformerLayer.batchDraw();
        window.globalPasteMode = false;
        return;
    }

    if (isCtrl && key === 'v') {
        e.preventDefault();
        if (!window.globalClipboard || window.globalClipboard.length === 0) return;
        const stage = page.stage;
        const pointer = stage.getPointerPosition() || { x: stage.width() / 2, y: stage.height() / 2 };
        pasteClipboardToPage(page, pointer);
        return;
    }

    if (isCtrl && key === 'g' && !e.shiftKey) {
        e.preventDefault();
        page.groupSelectedNodes?.();
        return;
    }

    if (isCtrl && key === 'g' && e.shiftKey) {
        e.preventDefault();
        page.ungroupSelectedNodes?.();
        return;
    }

    if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        const nodes = normalizeSelection(page.selectedNodes);
        if (!nodes.length) return;
        nodes.forEach(n => {
            clearCatalogSlotStateForNode(page, n);
            n.destroy();
        });
        page.selectedNodes = [];
        page.transformer.nodes([]);
        page.layer.batchDraw();
        page.transformerLayer.batchDraw();
        window.projectDirty = true;
    }
});
window.movePage = function(page, direction) {
    const index = pages.indexOf(page);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= pages.length) return;

    // Zamiana w tablicy
    const tmp = pages[newIndex];
    pages[newIndex] = page;
    pages[index] = tmp;

    // Zamiana w DOM
    const container = document.getElementById('pagesContainer');
    if (direction < 0) {
        container.insertBefore(page.container, tmp.container);
    } else {
        container.insertBefore(tmp.container, page.container);
    }

    // ⭐ Aktualizacja numerów NA NOWYM TOOLBARZE
    pages.forEach((p, i) => {
        p.number = i + 1;

        const title = p.container.querySelector('.page-title');
        if (title) title.textContent = `Page ${i + 1}`;
    });

    console.log(`Strona przesunięta na pozycję ${newIndex + 1}`);
};

function applyCursorEvents(page) {
    const nodes = page.stage.find('Rect, Text, Image');
    nodes.forEach(node => {
        if (!node.draggable()) return;

        node.on('mouseover', () => {
            page.stage.container().style.cursor = 'grab';
        });

        node.on('mouseout', () => {
            page.stage.container().style.cursor = 'default';
        });
    });
}


// Automatycznie przy tworzeniu każdej strony:
window.addEventListener('canvasCreated', (e) => {
    const page = pages.find(p => p.stage === e.detail);
    setTimeout(() => applyCursorEvents(page), 200);
});
function enableEditableText(node, page) {
    const layer = page.layer;
    const tr = page.transformer;

    // Zapamiętaj oryginalne wartości
    node.originalFontSize = node.fontSize();
    node.originalWidth = node.width();
    node.originalHeight = node.height();

    // Etykieta rotacji
    const rotationUI = createRotationLabel(layer);

    // Pokazuj kąt przy rotacji
    node.on("transform", () => {
        const angle = Math.round(node.rotation());
        rotationUI.text.text(angle + "°");
        const abs = node.absolutePosition();
        rotationUI.label.position({
            x: abs.x + node.width() / 2,
            y: abs.y - 40
        });
        rotationUI.label.visible(true);
        rotationUI.label.opacity(1);
        layer.batchDraw();
    });

    node.on("transformend", () => {
        const label = rotationUI?.label;
        if (!label || (label.isDestroyed && label.isDestroyed()) || !label.getLayer || !label.getLayer()) {
            return;
        }

        label.to({
            opacity: 0,
            duration: 0.25,
            onFinish: () => {
                if (!label.isDestroyed || !label.isDestroyed()) {
                    label.visible(false);
                }
            }
        });
    });

    // GŁÓWNA LOGIKA SKALOWANIA – IDENTYCZNA Z DEMO
    node.on("transform", () => {
        const oldPos = node.absolutePosition();

        let newW = node.width() * node.scaleX();
        let newH = node.height() * node.scaleY();

        node.setAttrs({
            width: newW,
            height: newH,
            scaleX: 1,
            scaleY: 1
        });

        // 1. Najpierw próbuj POWIĘKSZYĆ
        let enlarged = false;
        while (true) {
            const prev = node.fontSize();
            node.fontSize(prev + 1);

            const h = node.textArr.length * node.textHeight;
            if (h > newH) {
                node.fontSize(prev);
                break;
            }
            if (hasBrokenWords(getTokensInString(node.text()), node.textArr)) {
                node.fontSize(prev);
                break;
            }
            enlarged = true;
        }

        // 2. Jeśli nie powiększyło – shrink
        if (!enlarged) {
            shrinkText(node, 8);
        }

        node.absolutePosition(oldPos);
        layer.batchDraw();
    });

    // Kliknij ponownie zaznaczony tekst → edycja w miejscu (Canva‑style)
    const startInlineEdit = () => {
        if (window.isEditingText) return;
        window.hideTextToolbar?.();
        window.hideTextPanel?.();
        window.isEditingText = true;
        tr.hide();
        node.hide();
        layer.draw();

        const pos = node.absolutePosition();
        const rect = page.stage.container().getBoundingClientRect();
        const absX = rect.left + pos.x + window.scrollX;
        const absY = rect.top + pos.y + window.scrollY;

        const textarea = document.createElement("textarea");
        document.body.appendChild(textarea);

        textarea.value = node.text();
        Object.assign(textarea.style, {
            position: "absolute",
            left: absX + "px",
            top: absY + "px",
            width: node.width() + "px",
            minHeight: node.height() + "px",
            fontSize: node.fontSize() + "px",
            fontFamily: node.fontFamily(),
            lineHeight: node.lineHeight(),
            textAlign: node.align(),
            color: node.fill(),
            padding: "2px",
            border: "2px solid #0066ff",
            background: "white",
            resize: "none",
            zIndex: 99999,
            outline: "none",
            overflow: "hidden"
        });

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        textarea.style.height = textarea.scrollHeight + "px";

        const finish = () => {
            node.text(textarea.value || "-");
            shrinkText(node, 8);
            node.show();
            tr.show();
            tr.forceUpdate();
            layer.draw();
            textarea.remove();
            window.isEditingText = false;
            window.removeEventListener("click", close);
        };

        const close = (e) => {
            if (e.target !== textarea) finish();
        };

        textarea.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                finish();
            }
            if (e.key === "Escape") finish();
        });

        textarea.addEventListener("input", () => {
            node.text(textarea.value);
            const newSize = shrinkText(node, 8);
            textarea.style.fontSize = newSize + "px";
            textarea.style.height = "auto";
            textarea.style.height = textarea.scrollHeight + "px";
        });

        setTimeout(() => window.addEventListener("click", close), 0);
    };

    // 🟢 Jedno kliknięcie → pokaż floating toolbar tekstu
    node.on("click", (e) => {
        if (window.isEditingText) return;
        if (node.getParent && node.getParent().getAttr && node.getParent().getAttr("isPriceGroup")) return;
        window.showTextToolbar?.(node);
        window.hideTextPanel?.();
    });

    node.on("click tap", (e) => {
        if (window.isEditingText) return;
        if (e && e.evt && e.evt.shiftKey) return;
        if (node.isDragging && node.isDragging()) return;

        const isSelected =
            page.selectedNodes &&
            page.selectedNodes.length === 1 &&
            page.selectedNodes[0] === node;

        if (isSelected) startInlineEdit();
    });

    // DBLCLICK nadal wspierany
    node.on("dblclick dbltap", startInlineEdit);
}

// 🔧 Naprawa klonów tekstu: usuń stare handlery i podepnij nowe dla klona
function rebindEditableTextForClone(node, page) {
    if (!node || !page) return;

    const rebind = (t) => {
        if (!(t instanceof Konva.Text)) return;
        const parent = t.getParent && t.getParent();
        if (parent && parent.getAttr && parent.getAttr("isPriceGroup")) return;

        t.off("dblclick dbltap transform transformend");
        enableEditableText(t, page);
    };

    if (node instanceof Konva.Text) {
        rebind(node);
        return;
    }

    if (node instanceof Konva.Group && node.find) {
        node.find("Text").forEach(rebind);
    }
}

// === FALLBACK: Dodaj tekst / zdjęcie z sidebaru (gdy moduł nie zadziała) ===
let addTextFallback = false;
let addImageFallback = false;

function getActivePageForAdd() {
    if (!Array.isArray(pages) || pages.length === 0) return null;
    return pages.find(p => p.stage === document.activeStage) || pages[0];
}

function disableAddTextFallback() {
    if (!Array.isArray(pages)) return;
    pages.forEach(page => {
        const c = page.stage.container();
        c.style.cursor = 'default';
        if (page._fallbackTextHandler) {
            page.stage.off('mousedown.fallbackText', page._fallbackTextHandler);
            page._fallbackTextHandler = null;
        }
    });
}

function disableAddImageFallback() {
    if (!Array.isArray(pages)) return;
    pages.forEach(page => {
        const c = page.stage.container();
        c.style.cursor = 'default';
        if (page._fallbackImageHandler) {
            page.stage.off('mousedown.fallbackImage', page._fallbackImageHandler);
            page._fallbackImageHandler = null;
        }
    });
}

function enableAddTextModeFallback() {
    if (addTextFallback || addImageFallback) return;
    addTextFallback = true;
    pages.forEach(page => {
        const c = page.stage.container();
        c.style.cursor = 'text';
        const handler = (e) => {
            if (!addTextFallback || e.evt.button !== 0) return;
            const pos = page.stage.getPointerPosition();
            if (pos) {
                const text = new Konva.Text({
                    text: "Kliknij, aby edytować",
                    x: pos.x - 110,
                    y: pos.y - 20,
                    width: 220,
                    fontSize: 18,
                    fill: "#000000",
                    fontFamily: "Arial",
                    align: "center",
                    draggable: true
                });
                page.layer.add(text);
                page.layer.batchDraw();
                enableEditableText(text, page);
            }
            addTextFallback = false;
            disableAddTextFallback();
        };
        page.stage.on('mousedown.fallbackText', handler);
        page._fallbackTextHandler = handler;
    });
}

function enableAddImageModeFallback() {
    if (addTextFallback || addImageFallback) return;
    addImageFallback = true;
    pages.forEach(page => {
        const c = page.stage.container();
        c.style.cursor = 'crosshair';
        const handler = (e) => {
            if (!addImageFallback || e.evt.button !== 0) return;
            const pos = page.stage.getPointerPosition();
            if (!pos) return;
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (ev) => {
                const file = ev.target.files && ev.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (re) => {
                    Konva.Image.fromURL(re.target.result, (img) => {
                        img.x(pos.x);
                        img.y(pos.y);
                        img.draggable(true);
                        img.listening(true);
                        page.layer.add(img);
                        setupProductImageDrag(img, page.layer);
                        page.layer.batchDraw();
                    });
                };
                reader.readAsDataURL(file);
            };
            input.click();
            addImageFallback = false;
            disableAddImageFallback();
        };
        page.stage.on('mousedown.fallbackImage', handler);
        page._fallbackImageHandler = handler;
    });
}

// Bind fallback click handlers (if moduł sidebar nie działa)
document.addEventListener('DOMContentLoaded', () => {
    const textBtn = document.getElementById('sidebarAddText');
    const imgBtn = document.getElementById('sidebarAddImage');
    if (textBtn) {
        textBtn.addEventListener('click', () => {
            if (window.__sidebarModuleBound) return;
            enableAddTextModeFallback();
        });
    }
    if (imgBtn) {
        imgBtn.addEventListener('click', () => {
            if (window.__sidebarModuleBound) return;
            enableAddImageModeFallback();
        });
    }
});
// =====================================================================
// PANEL EDYCJI STRONY – WSPÓLNY DLA WSZYSTKICH STRON
// =====================================================================

window.openPageEdit = function(page) {

    // Usuń stary panel, jeśli jest
    let old = document.getElementById("pageEditPanel");
    if (old) old.remove();

    // Tworzymy panel
    const panel = document.createElement("div");
    panel.id = "pageEditPanel";

    panel.style.cssText = `
        position: fixed;
        top: 100px;
        right: 40px;
        width: 260px;
        background: #fff;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.25);
        z-index: 999999;
        font-family: Arial;
    `;

    panel.innerHTML = `
        <h3 style="margin:0 0 10px 0;">Ustawienia strony</h3>

        <label>Kolor tła:</label>
        <input type="color" id="bgColorPicker"
               value="${page.settings.pageBgColor || '#ffffff'}"
               style="width:100%;height:40px;margin:8px 0;">

        <label>Baner (URL):</label>
        <input type="text" id="bannerUrlInput"
               value="${page.settings.bannerUrl || ''}"
               placeholder="https://..."
               style="width:100%;padding:6px;margin:8px 0;">

        <button id="applyPageEdit"
                style="width:100%;padding:10px;background:#007cba;color:#fff;border:none;border-radius:8px;margin-top:12px;">
            Zastosuj
        </button>

        <button id="closePageEdit"
                style="width:100%;padding:10px;background:#777;color:#fff;border:none;border-radius:8px;margin-top:8px;">
            Zamknij
        </button>
    `;

    document.body.appendChild(panel);

    // ====== Zastosuj ======
    document.getElementById("applyPageEdit").onclick = () => {
        const bgColor = document.getElementById("bgColorPicker").value;
        const bannerUrl = document.getElementById("bannerUrlInput").value.trim();

        // Tło
        const bg = page.layer.findOne(n => n.getAttr("isPageBg"));
        if (bg) bg.fill(bgColor);

        page.settings.pageBgColor = bgColor;

        // Baner
        page.settings.bannerUrl = bannerUrl || null;

        // Przerysuj stronę
        drawPage(page);
    };

    // ====== Zamknij ======
    document.getElementById("closePageEdit").onclick = () => {
        panel.remove();
    };
};
// === GLOBALNE TWORZENIE NOWEJ, PUSTEJ STRONY ===
window.createNewPage = function() {

    const newIndex = pages.length + 1;

    // Pusta lista produktów → strona bez produktów
    const emptyProducts = [];

    // Tworzymy stronę z indeksem i pustymi produktami
    const page = createPage(newIndex, emptyProducts);

    return page;
};

window.applyCatalogStyle = function(styleName) {
    window.CATALOG_STYLE = styleName || "default";
    if (typeof window.applyCatalogStyleVisual === "function") {
        window.applyCatalogStyleVisual(window.CATALOG_STYLE);
        return;
    }
    if (Array.isArray(window.pages)) {
        window.pages.forEach(p => drawPage(p));
    }
};

window.redrawCatalogPageForCustomStyle = function(page) {
    if (!page || !page.layer || !page.stage) return;
    // Bezpieczna inicjalizacja wymiarów siatki (działa także bez wcześniejszego importu Excel).
    if (!Number.isFinite(BW) || BW <= 0 || !Number.isFinite(BH) || BH <= 0 || !Number.isFinite(BW_dynamic) || BW_dynamic <= 0 || !Number.isFinite(BH_dynamic) || BH_dynamic <= 0) {
        let scaleBox = 1;
        if ((window.LAYOUT_MODE || "layout6") === "layout8") {
            COLS = layout8Defaults.COLS;
            ROWS = layout8Defaults.ROWS;
            GAP = layout8Defaults.GAP;
            MT = layout8Defaults.MT;
            scaleBox = layout8Defaults.scaleBox;
        } else {
            COLS = layout6Defaults.COLS;
            ROWS = layout6Defaults.ROWS;
            GAP = layout6Defaults.GAP;
            MT = layout6Defaults.MT;
            scaleBox = layout6Defaults.scaleBox;
        }
        BW = (W - ML * 2 - GAP * (COLS - 1)) / COLS;
        BH = (H - MT - MB - GAP * (ROWS - 1)) / ROWS;
        BW_dynamic = BW * scaleBox;
        BH_dynamic = BH * scaleBox;
    }
    drawPage(page);
    page.layer.batchDraw();
    page.transformerLayer?.batchDraw?.();
};

console.log("importdanych.js – PEŁNY KOD ZAŁADOWANY – wszystko działa idealnie!");//DZIALA
// =====================================================
window.setCatalogLayout = function (layout) {

    if (!layout) return;

    console.log("🔁 ZMIANA LAYOUTU NA:", layout);

    // =========================
    // 1. ZAPIS GLOBALNY
    // =========================
    window.LAYOUT_MODE = layout;

    let scaleBox = 1;

    // =========================
    // 2. USTAWIENIA GRIDU
    // =========================
    if (layout === "layout6") {
        COLS = layout6Defaults.COLS;
        ROWS = layout6Defaults.ROWS;
        GAP  = layout6Defaults.GAP;
        MT   = layout6Defaults.MT;
        scaleBox = layout6Defaults.scaleBox;
    }

    if (layout === "layout8") {
        COLS = layout8Defaults.COLS;
        ROWS = layout8Defaults.ROWS;
        GAP  = layout8Defaults.GAP;
        MT   = layout8Defaults.MT;
        scaleBox = layout8Defaults.scaleBox;
    }

    // =========================
    // 3. PRZELICZ BOX
    // =========================
    BW = (W - ML * 2 - GAP * (COLS - 1)) / COLS;
    BH = (H - MT - MB - GAP * (ROWS - 1)) / ROWS;

    BW_dynamic = BW * scaleBox;
    BH_dynamic = BH * scaleBox;

    // =========================
    // 4. PRZEBUDUJ STRONY
    // =========================
    if (!window.allProducts || !allProducts.length) {
        console.warn("⚠️ Brak produktów – nie przebudowuję");
        return;
    }

    pages.forEach(p => {
        p.stage.destroy();
        p.container.remove();
    });

    pages.length = 0;
    document.getElementById("pagesContainer").innerHTML = "";

    buildPagesFromProducts(allProducts);
    setTimeout(() => {
        if (typeof window.applyCachedProductImages === "function") {
            window.applyCachedProductImages();
        }
    }, 50);
    if (typeof window.resetProjectHistory === "function") {
        window.resetProjectHistory(null);
    }
// ================================
// OVERLAY „AI PROCESSING…”
// ================================
const aiOverlay = document.createElement("div");
aiOverlay.id = "aiProcessingOverlay";
aiOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999999;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
`;

aiOverlay.innerHTML = `
  <div style="
      background:#fff;
      padding:28px 36px;
      border-radius:18px;
      box-shadow:0 20px 60px rgba(0,0,0,.35);
      display:flex;
      align-items:center;
      gap:18px;
      font-family:Arial;
  ">
      <div class="aiSpinner"></div>
      <div style="font-size:16px;font-weight:600;color:#333;">
          Usuwanie tła…<br>
          <span style="font-size:13px;font-weight:400;color:#666;">
              AI analizuje obraz
          </span>
      </div>
  </div>
`;

document.body.appendChild(aiOverlay);

// spinner (CSS)
const spinnerStyle = document.createElement("style");
spinnerStyle.textContent = `
.aiSpinner {
    width:34px;
    height:34px;
    border:4px solid #e0e0e0;
    border-top:4px solid #8e44ad;
    border-radius:50%;
    animation: aiSpin 1s linear infinite;
}
@keyframes aiSpin {
    to { transform: rotate(360deg); }
}
`;
document.head.appendChild(spinnerStyle);

function showAIOverlay() {
    aiOverlay.style.pointerEvents = "auto";
    aiOverlay.style.opacity = "1";
}

function hideAIOverlay() {
    aiOverlay.style.opacity = "0";
    setTimeout(() => {
        aiOverlay.style.pointerEvents = "none";
    }, 250);
}

    console.log("✅ Layout ZASTOSOWANY:", layout);
};
// =====================================================
// PDF CANVA – OBIEKTOWY (EDYTOWALNY W CANVA)
// =====================================================
window.generateCanvaPDF = async function (pageNumbers) {

  if (!window.pages || !window.pages.length) {
    alert("Brak stron do eksportu");
    return;
  }

  const pageSet = Array.isArray(pageNumbers) && pageNumbers.length
    ? new Set(pageNumbers.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n)))
    : null;

  const pagesToExport = pageSet
    ? pages.filter(p => pageSet.has(p.number))
    : pages;

  if (!pagesToExport.length) {
    alert("Brak stron do eksportu");
    return;
  }

  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: [W, H]
  });

  for (let pi = 0; pi < pagesToExport.length; pi++) {
    const page = pagesToExport[pi];
    if (pi > 0) pdf.addPage();

    // białe tło
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, W, H, "F");

    const parsePdfColor = (raw) => {
      const txt = String(raw || "").trim();
      if (!txt) return [0, 0, 0];
      const hex = txt.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (hex) {
        let h = hex[1];
        if (h.length === 3) h = h.split("").map(ch => ch + ch).join("");
        return [
          parseInt(h.slice(0, 2), 16),
          parseInt(h.slice(2, 4), 16),
          parseInt(h.slice(4, 6), 16)
        ];
      }
      const rgb = txt.match(/rgba?\(([^)]+)\)/i);
      if (rgb) {
        const parts = rgb[1].split(",").map(v => parseFloat(v.trim()));
        return [
          Math.max(0, Math.min(255, Math.round(parts[0] || 0))),
          Math.max(0, Math.min(255, Math.round(parts[1] || 0))),
          Math.max(0, Math.min(255, Math.round(parts[2] || 0)))
        ];
      }
      return [0, 0, 0];
    };

    const drawTextNodeToPdf = (textNode, opts = {}) => {
      if (!(textNode instanceof Konva.Text)) return;
      if (textNode.getAttr && textNode.getAttr("isPriceHitArea")) return;
      if (typeof textNode.visible === "function" && !textNode.visible()) return;
      const abs = textNode.getAbsolutePosition ? textNode.getAbsolutePosition() : { x: textNode.x(), y: textNode.y() };
      const absScale = textNode.getAbsoluteScale ? textNode.getAbsoluteScale() : { x: textNode.scaleX?.() || 1, y: textNode.scaleY?.() || 1 };
      const fontSize = Math.max(1, (textNode.fontSize() || 12) * (Number(absScale.y) || 1));
      const maxWidth = Math.max(1, (textNode.width() || 300) * (Number(absScale.x) || 1));
      const [r, g, b] = parsePdfColor(textNode.fill?.() || "#000");
      const style = String(textNode.fontStyle?.() || "").toLowerCase();
      let pdfStyle = "normal";
      if (style.includes("bold") && style.includes("italic")) pdfStyle = "bolditalic";
      else if (style.includes("bold")) pdfStyle = "bold";
      else if (style.includes("italic")) pdfStyle = "italic";

      pdf.setFont("helvetica", pdfStyle);
      pdf.setFontSize(fontSize);
      pdf.setTextColor(r, g, b);
      pdf.setLineHeightFactor(Number(textNode.lineHeight?.() || 1.2));

      const textValue = String(textNode.text?.() || "");
      const lines = opts.noWrap ? [textValue] : pdf.splitTextToSize(textValue, maxWidth);
      const x = Number(abs.x || 0) + Number(opts.xOffset || 0);
      const y = Number(abs.y || 0) + Number(opts.yOffset || 0);
      pdf.text(lines, x, y + (opts.baselineTop ? 0 : fontSize), opts.baselineTop ? { baseline: "top" } : undefined);
    };

    const drawImageNodeToPdf = async (imgNode) => {
      if (!(imgNode instanceof Konva.Image) || !imgNode.image()) return;
      if (imgNode.getAttr && imgNode.getAttr("isPriceHitArea")) return;
      if (typeof imgNode.visible === "function" && !imgNode.visible()) return;

      const abs = imgNode.getAbsolutePosition ? imgNode.getAbsolutePosition() : { x: imgNode.x(), y: imgNode.y() };
      const absScale = imgNode.getAbsoluteScale ? imgNode.getAbsoluteScale() : { x: imgNode.scaleX?.() || 1, y: imgNode.scaleY?.() || 1 };
      const w = (imgNode.width() || 0) * (Number(absScale.x) || 1);
      const h = (imgNode.height() || 0) * (Number(absScale.y) || 1);
      if (!(w > 0 && h > 0)) return;

      const isOverlay =
        imgNode.getAttr("isOverlayElement") ||
        imgNode.getAttr("isTNZBadge") ||
        imgNode.getAttr("isCountryBadge") ||
        imgNode.getAttr("isBarcode");

      const exportScale = 2.2;
      const pngUrl = imgNode.toDataURL({
        pixelRatio: exportScale,
        mimeType: "image/png"
      });

      if (isOverlay) {
        pdf.addImage(pngUrl, "PNG", abs.x, abs.y, w, h);
        return;
      }

      const imgEl = new Image();
      imgEl.src = pngUrl;
      await new Promise((res, rej) => {
        imgEl.onload = res;
        imgEl.onerror = rej;
      });

      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * exportScale));
      c.height = Math.max(1, Math.round(h * exportScale));
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(imgEl, 0, 0, c.width, c.height);
      const jpegUrl = c.toDataURL("image/jpeg", 0.88);
      pdf.addImage(jpegUrl, "JPEG", abs.x, abs.y, w, h);
    };

    const drawNodeRecursive = async (node) => {
      if (!node || !node.getAttr) return;
      if (typeof node.visible === "function" && !node.visible()) return;
      if (node.name && (node.name() === "selectionOutline" || node.name() === "selectionRect")) return;
      if (node.getAttr("isBgBlur") || node.getAttr("isFxHelper") || node.getAttr("isPriceHitArea")) return;
      if (node.getAttr("isPageBg")) return;

      // === BOX (CANVA STYLE – FAKE SHADOW + SOFT BORDER) ===
      if (node.getAttr && node.getAttr("isBox")) {
        const hiddenByStyle =
          node.getAttr("isHiddenByCatalogStyle") === true ||
          window.CATALOG_STYLE === "styl_elegancki" ||
          (typeof node.visible === "function" && node.visible() === false);
        if (hiddenByStyle) return;

        const abs = node.getAbsolutePosition ? node.getAbsolutePosition() : { x: node.x(), y: node.y() };
        const absScale = node.getAbsoluteScale ? node.getAbsoluteScale() : { x: node.scaleX?.() || 1, y: node.scaleY?.() || 1 };
        const x = abs.x;
        const y = abs.y;
        const w = (node.width() || 0) * (Number(absScale.x) || 1);
        const h = (node.height() || 0) * (Number(absScale.y) || 1);
        const r = 14;

        // 1️⃣ CIEŃ (FAKE SHADOW)
        pdf.setFillColor(0, 0, 0);
        pdf.setLineWidth(0);
        pdf.setGState(new pdf.GState({ opacity: 0.12 }));

        pdf.roundedRect(
          x,
          y + 8,
          w,
          h,
          r,
          r,
          "F"
        );

        pdf.setGState(new pdf.GState({ opacity: 1 }));

        // 2️⃣ BOX GŁÓWNY – DELIKATNA RAMKA
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(210, 210, 210);
        pdf.setLineWidth(1.2);

        pdf.roundedRect(
          x,
          y,
          w,
          h,
          r,
          r,
          "FD"
        );
      }

      // === TEKST ===
      if (node instanceof Konva.Text) {
        if (node.getParent && node.getParent() && node.getParent().getAttr && node.getParent().getAttr("isPriceGroup")) {
          return;
        }
        drawTextNodeToPdf(node);
        return;
      }

      // === CENA (GROUP) – POPRAWIONE 1:1 ===
      if (node instanceof Konva.Group && node.getAttr("isPriceGroup")) {
        node.getChildren().forEach(t => {
          if (!(t instanceof Konva.Text)) return;

          const abs = t.getAbsolutePosition ? t.getAbsolutePosition() : { x: t.x(), y: t.y() };
          const absScale = t.getAbsoluteScale ? t.getAbsoluteScale() : { x: t.scaleX?.() || 1, y: t.scaleY?.() || 1 };
          let xOffset = 0;
          let yOffset = 0;

          const text = t.text();
          const size = (t.fontSize() || 12) * (Number(absScale.y) || 1);

          // 🔹 GROSZE "45" – tylko w LEWO
          if (/^\\d+$/.test(text) && size < 30) {
            xOffset = -8;
            yOffset = 1;
          }

          // 🔹 WALUTA / SZT. – jak wcześniej + delikatnie w górę
          if (text.includes("€") || text.includes("/")) {
            xOffset = -12;
            yOffset = -3;
          }

          drawTextNodeToPdf(t, {
            noWrap: true,
            baselineTop: true,
            xOffset,
            yOffset
          });
        });
        return;
      }

      // CODEX_CANVA_IMAGE_EXPORT
      // === OBRAZ (crop 1:1 + wysoka jakość) ===
      if (node instanceof Konva.Image && node.image()) {
        await drawImageNodeToPdf(node);
        return;
      }

      if (node instanceof Konva.Group && node.getChildren) {
        const children = node.getChildren();
        for (const child of children) {
          await drawNodeRecursive(child);
        }
      }
    };

    const nodes = page.layer.getChildren();
    for (const node of nodes) {
      await drawNodeRecursive(node);
    }
  }

  pdf.save("katalog_canva_editable.pdf");
};
