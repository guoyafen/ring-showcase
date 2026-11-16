/* Ring Showcase: adapted from the approved ON DUTY loupe edition. */
const C = window.SHOWCASE_CONFIG;
const LOOKS = C.looks;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.HD_MASKS = C.masks || {};

const N = LOOKS.length;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (n, m) => ((n % m) + m) % m;
const yuan = v => v == null ? '非卖品' : esc(C.currency) + v.toLocaleString('en-US');

// 与 CSS 一致的 cubic-bezier(0.22, 1, 0.36, 1)
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t;
  const dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break; t -= e / d; }
    return sy(clamp(t, 0, 1));
  };
}
const EASE = bezier(0.22, 1, 0.36, 1);
const EASE_IO = bezier(0.65, 0, 0.35, 1);

function tween(dur, fn, ease = EASE) {
  return new Promise(res => {
    const t0 = performance.now();
    const step = now => {
      const p = clamp((now - t0) / dur, 0, 1);
      fn(ease(p), p);
      if (p < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}

/* ---------- 状态 ---------- */
const app = $('#app'), stage = $('#stage');
const S = {
  mode: 'ring',          // ring | grid | detail
  back: 'ring',          // detail 关闭后回到哪
  rot: 0, focus: -1,
  unlocked: {},
  bag: 0, added: {},     // added['01-i0'] = true
  portrait: false,
  W: 0, H: 0, G: {},
  rotAnim: 0,
  demo: null,
};

/* ---------- 构建人物 ---------- */
const figs = LOOKS.map((L, i) => {
  const f = document.createElement('div');
  f.className = 'fig' + (L.hidden ? ' locked' : '');
  f.dataset.i = i;
  const bob = document.createElement('div');
  bob.className = 'bob';
  bob.style.animationDelay = (-i * 0.53) + 's';
  bob.innerHTML = `<img src="${esc(L.img)}" alt="${esc(L.en)} ${esc(L.cn)}" draggable="false">
    <span class="qmark">?</span><span class="hidden-tag">HIDDEN · 隐藏款</span>
    <div class="hotspots">${L.hs.map((h, k) => {
      const it = refItem(L, h.ref);
      return `<div class="hs${h.x > .55 ? ' flip' : ''}" style="left:${h.x * 100}%;top:${h.y * 100}%" data-k="${k}">
        <span class="hs-dot"></span><span class="hs-label">${esc(it.name)}<b>${yuan(it.price)}</b></span></div>`;
    }).join('')}</div>`;
  f.appendChild(bob);
  stage.appendChild(f);
  return f;
});
function refItem(L, ref) { return ref[0] === 'p' ? L.props[+ref.slice(1)] : L.items[+ref.slice(1)]; }

const glabels = LOOKS.map((L, i) => {
  const el = document.createElement('div');
  el.className = 'glabel';
  $('#gridLabels').appendChild(el);
  return el;
});
function isLocked(i) { return LOOKS[i].hidden && !S.unlocked[LOOKS[i].id]; }
function labelHTML(i) {
  const L = LOOKS[i];
  return isLocked(i) ? `${esc(L.id)}. ??? <span class="cn">隐藏款</span>` : `${esc(L.id)}. ${esc(L.en)} <span class="cn">${esc(L.cn)}</span>`;
}
function refreshLabels() { glabels.forEach((el, i) => el.innerHTML = labelHTML(i)); }

/* ---------- 尺寸 / 布局 ---------- */
function layout() {
  const iw = innerWidth, ih = innerHeight;
  const r = S.portrait ? 3 / 4 : 16 / 9;
  let W, H;
  if (S.portrait) { H = ih; W = H * r; if (W > iw) { W = iw; H = W / r; } }
  else { W = iw; H = ih; }            // 16:9 模式直接铺满窗口（按 16:9 录屏即可）
  W = Math.round(W); H = Math.round(H);
  Object.assign(app.style, { width: W + 'px', height: H + 'px', left: Math.round((iw - W) / 2) + 'px', top: Math.round((ih - H) / 2) + 'px' });
  app.classList.toggle('portrait', S.portrait);
  document.body.classList.toggle('portrait', S.portrait);
  S.W = W; S.H = H;
  const u = Math.min(W, H) / 100; // 1cqmin
  const G = S.G;
  G.u = u;
  if (S.portrait) {
    G.baseH = H * 0.66; G.cy = H * 0.47; G.R = W * 0.37; G.step = W * 0.30; G.lift = H * 0.05;
  } else {
    G.baseH = H * 0.70; G.cy = H * 0.47; G.R = Math.min(W * 0.36, H * 0.78); G.step = W * 0.17; G.lift = H * 0.075;
  }
  G.baseW = G.baseH * C.imageAspect;
  figs.forEach(f => { f.style.width = G.baseW + 'px'; f.style.height = G.baseH + 'px'; f.style.setProperty('--h', G.baseH + 'px'); });
  applyPoses();
}

function ringPose(i) {
  const G = S.G;
  let o = mod(i - S.rot + N / 2, N) - N / 2;              // -4.5 … 4.5
  const a = o * 2 * Math.PI / N;
  const d = Math.cos(a), t = (d + 1) / 2;
  const s = 0.36 + 0.64 * Math.pow(t, 1.9);
  let op = 0.12 + 0.88 * t * t;
  op *= clamp((d + 0.78) / 0.6, 0, 1);
  if (S.portrait) op *= clamp((1.75 - Math.abs(o)) / 0.6, 0, 1);  // 竖屏：外圈直接淡掉，避免压到两侧按钮
  const blur = Math.pow(1 - t, 0.85) * G.u * 1.1;
  return { x: S.W / 2 + Math.sin(a) * G.R, y: G.cy - (1 - t) * G.lift, s, op, blur, z: Math.round(t * 100) };
}

function gridCells() {
  const G = S.G, u = G.u;
  const top = (S.portrait ? 14 : 11) * u, bottom = (S.portrait ? 4 : 3.5) * u;
  const labelH = 3.4 * u;
  const cols = Math.min(C.gridColumns, N), rows = Math.ceil(N / cols);
  const cellH = (S.H - top - bottom) / rows;
  let figH = cellH - labelH;
  let colGap;
  if (S.portrait) {
    const availW = S.W - 12 * u;
    colGap = availW / cols;
    figH = Math.min(figH, colGap / C.imageAspect * 1.08);
  } else {
    colGap = Math.min(figH * 1.12, (S.W - 14 * u) / cols);
    figH = Math.min(figH, colGap / C.imageAspect);
  }
  return LOOKS.map((_, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const cy = top + cellH * r + figH / 2;
    return { x: S.W / 2 + (c - (cols - 1) / 2) * colGap, y: cy, s: figH * 1.06 / G.baseH, figH, labelY: cy + figH * 0.5 + 0.2 * u };
  });
}

function detailPose() {
  const G = S.G;
  if (S.portrait) return { x: S.W * 0.25, y: S.H * 0.54, s: (S.H * 0.74) / G.baseH, op: 1, blur: 0, z: 200 };
  return { x: S.W * 0.33, y: S.H * 0.535, s: (S.H * 0.86) / G.baseH, op: 1, blur: 0, z: 200 };
}

function setPose(f, p) {
  const G = S.G;
  f.style.transform = `translate3d(${p.x - G.baseW / 2}px, ${p.y - G.baseH / 2}px, 0) scale(${p.s})`;
  f.style.opacity = p.op;
  f.style.filter = p.blur > 0.05 ? `blur(${p.blur.toFixed(2)}px)` : 'none';
  f.style.zIndex = p.z;
  f.style.pointerEvents = p.op > 0.25 ? '' : 'none';
  f._pose = p;
}

function applyPoses() {
  const cells = gridCells();
  figs.forEach((f, i) => {
    let p;
    if (S.mode === 'ring') p = ringPose(i);
    else if (S.mode === 'grid') p = { x: cells[i].x, y: cells[i].y, s: cells[i].s, op: 1, blur: 0, z: 10 };
    else {
      if (i === S.focus) p = detailPose();
      else {
        const base = S.back === 'grid' ? { x: cells[i].x, y: cells[i].y, s: cells[i].s, blur: 0, z: 10 } : ringPose(i);
        p = { ...base, op: 0, blur: 8 * S.G.u / 10 };
      }
    }
    setPose(f, p);
  });
  glabels.forEach((el, i) => {
    el.style.left = cells[i].x + 'px';
    el.style.top = cells[i].labelY + 'px';
    el.classList.toggle('hide', S.mode === 'detail');
  });
}

function animateFigs(ms = 760) {
  figs.forEach(f => f.classList.add('anim'));
  clearTimeout(animateFigs.t);
  animateFigs.t = setTimeout(() => figs.forEach(f => f.classList.remove('anim')), ms);
}

/* ---------- HUD ---------- */
let hudIdx = -1;
function current() { return mod(Math.round(S.rot), N); }
function updateHUD(force) {
  const i = current();
  if (i === hudIdx && !force) return;
  hudIdx = i;
  const L = LOOKS[i], locked = isLocked(i);
  $('#hudIdx').textContent = L.id;
  $('#hudEn').textContent = locked ? '???' : L.en;
  $('#hudCn').textContent = locked ? '隐藏款' : L.cn;
  $('#hudChips').innerHTML = locked
    ? `<span class="pill chip">点 + 拆开隐藏款</span><span class="pill chip">¥ ???</span>`
    : L.items.map(it => `<span class="pill chip">${esc(it.short)}<b>${yuan(it.price)}</b></span>`).join('') +
      L.props.filter(p => p.price != null).map(p => `<span class="pill chip prop">${esc(p.name)}<b>${yuan(p.price)}</b></span>`).join('');
  for (const el of [$('.hud-name'), $('.hud-index'), $('#hudChips')]) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }
}

/* ---------- 环形旋转 ---------- */
let rotTarget = 0;
function renderRing() { if (S.mode === 'ring') { figs.forEach((f, i) => setPose(f, ringPose(i))); updateHUD(); } }
function animateRot(to, dur = 650) {
  rotTarget = to;
  const from = S.rot, id = ++S.rotAnim;
  return tween(dur, e => { if (id !== S.rotAnim) return; S.rot = lerp(from, to, e); renderRing(); });
}
function goTo(i, dur) {
  const cur = Math.round(S.rot);
  let d = mod(i - cur + N / 2, N) - N / 2;
  return animateRot(cur + Math.round(d), dur ?? 500 + Math.abs(d) * 90);
}

/* ---------- 模式切换 ---------- */
function setMode(m) {
  S.mode = m;
  app.classList.remove('mode-ring', 'mode-grid', 'mode-detail');
  app.classList.add('mode-' + m);
  $$('[data-view]').forEach(b => b.classList.toggle('is-on', b.dataset.view === (m === 'detail' ? S.back : m)));
}
function showView(v) {
  if (S.mode === 'detail') closeDetail(v);
  if (S.mode === v) return;
  S.rotAnim++; S.rot = Math.round(S.rot);
  setMode(v);
  animateFigs();
  applyPoses();
  updateHUD(true);
}

/* ---------- 小票 ---------- */
function receiptHTML(i) {
  const L = LOOKS[i];
  const rows = L.items.map((it, k) => row(L, 'i' + k, String(k + 1).padStart(2, '0'), it, it.cat)).join('');
  const props = L.props.map((p, k) => row(L, 'p' + k, '★', p, 'PROP · 道具', true)).join('');
  const sub = L.items.reduce((a, b) => a + b.price, 0) + L.props.reduce((a, b) => a + (b.price || 0), 0);
  const disc = Math.round(sub * C.discountRate);
  const done = S.added[L.id + '-fit'];
  return `
    <div class="r-brand">${esc(C.brand)}<sup>${esc(C.brandMark)}</sup></div>
    <div class="r-season">${esc(C.receiptSeason)}</div>
    <div class="r-look">LOOK ${esc(L.id)} — ${esc(L.en)} <span class="cn">${esc(L.cn)}</span>${L.hidden ? ' <span class="cn">· 隐藏款</span>' : ''}</div>
    <p class="r-tag">${esc(L.tag)}</p>
    <hr class="r-hr">
    <div class="r-head"><span>NO.</span><span>ITEM</span><span>PRICE</span><span></span></div>
    ${rows}${props}
    <hr class="r-hr">
    <div class="r-sum"><span>SUBTOTAL</span><span>${yuan(sub)}</span></div>
    <div class="r-sum disc"><span class="cn">整套购买 -${Math.round(C.discountRate * 100)}%</span><span>-${yuan(disc)}</span></div>
    <hr class="r-hr">
    <div class="r-total"><span>TOTAL</span><b>${yuan(sub - disc)}</b></div>
    <button class="r-cta${done ? ' done' : ''}" data-fit="${esc(L.id)}">${esc(done ? C.addedFitLabel : C.addFitLabel)}</button>
    <div class="r-thanks">${esc(C.thanks)}</div>`;
  function row(L, key, no, it, cat, isProp) {
    const k = L.id + '-' + key, on = S.added[k];
    const btn = it.price == null ? '<span></span>' : `<button class="pill r-add${on ? ' done' : ''}" data-k="${k}">${on ? '✓' : 'ADD'}</button>`;
    return `<div class="r-row${isProp ? ' prop' : ''}"><span class="r-no">${no}</span>
      <span class="r-name">${esc(it.name)}<small>${esc(cat)}</small></span><span class="r-price">${yuan(it.price)}</span>${btn}</div>`;
  }
}
$('#paper').addEventListener('click', e => {
  const add = e.target.closest('.r-add');
  if (add && !add.classList.contains('done')) {
    S.added[add.dataset.k] = true; add.classList.add('done'); add.textContent = '✓'; addToBag(1);
  }
  const cta = e.target.closest('.r-cta');
  if (cta) addWholeFit(cta);
});
function addWholeFit(cta = $('.r-cta')) {
  if (!cta || cta.classList.contains('done')) return;
  cta.classList.add('pressed');
  setTimeout(() => cta.classList.remove('pressed'), 200);
  S.added[cta.dataset.fit + '-fit'] = true;
  cta.classList.add('done'); cta.textContent = C.addedFitLabel;
  addToBag(1, '整套已加入购物袋');
}
function addToBag(n, msg = '已加入购物袋') {
  S.bag += n;
  $('#bagCount').textContent = S.bag;
  const b = $('#bagBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  toast(`${msg} · ${C.bagLabel} (${S.bag})`);
}
function toast(t) {
  const el = $('#toast'); el.textContent = t; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 1600);
}
function openReceipt() { $('#receipt').classList.add('open'); $('#receipt').setAttribute('aria-hidden', 'false'); }
function closeReceipt() { $('#receipt').classList.remove('open'); $('#receipt').setAttribute('aria-hidden', 'true'); }

/* ---------- 放大镜 ---------- */
const loupe = $('#loupe'), loupeImg = $('.loupe-img', loupe), loupeTag = $('.loupe-tag', loupe);
const ZOOM = { k: 2.5, min: 1.5, max: 4 };
const LP = { on: false, x: 0, y: 0, raf: 0 };   // x / y 为 client 坐标
const hdCache = {};
function preloadHD(i) {
  const L = LOOKS[i];
  if (L.hd && !hdCache[L.id]) { const im = new Image(); im.src = L.hd; hdCache[L.id] = im; }
}
// 可选的 48×72 alpha 遮罩；HTTP 下自动从透明 PNG 构建。
function onFigure(L, u, v) {
  const m = window.HD_MASKS && window.HD_MASKS[L.id];
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
  if (!m) return true;
  return m[Math.floor(v * 72) * 48 + Math.floor(u * 48)] === '1';
}
function drawLoupe() {
  const L = LOOKS[S.focus];
  if (S.mode !== 'detail' || !L || !L.hd) return hideLoupe();
  const r = $('img', figs[S.focus]).getBoundingClientRect(), a = app.getBoundingClientRect();
  const u = (LP.x - r.left) / r.width, v = (LP.y - r.top) / r.height;
  if (!onFigure(L, u, v)) { loupe.classList.remove('on'); app.classList.remove('zooming'); return; }
  const d = loupe.offsetWidth, bw = r.width * ZOOM.k, bh = r.height * ZOOM.k;
  loupeImg.style.backgroundImage = `url("${L.hd}")`;
  loupeImg.style.backgroundSize = `${bw}px ${bh}px`;
  loupeImg.style.backgroundPosition = `${d / 2 - u * bw}px ${d / 2 - v * bh}px`;
  loupe.style.transform = `translate(${LP.x - a.left - d / 2}px, ${LP.y - a.top - d / 2}px)`;
  loupeTag.textContent = '×' + ZOOM.k.toFixed(1);
  loupe.classList.add('on'); app.classList.add('zooming');
}
function showLoupeAt(cx, cy) {
  LP.x = cx; LP.y = cy; LP.on = true;
  if (!LP.raf) {
    const loop = () => { if (!LP.on) { LP.raf = 0; return; } drawLoupe(); LP.raf = requestAnimationFrame(loop); };
    LP.raf = requestAnimationFrame(loop);   // 人物有呼吸漂浮，逐帧跟随，放大内容不会错位
  }
}
function hideLoupe() { LP.on = false; loupe.classList.remove('on'); app.classList.remove('zooming'); }

/* ---------- 打开 / 关闭 ---------- */
let busy = false;
async function openLook(i, opt = {}) {
  if (busy || S.mode === 'detail') return;
  if (isLocked(i)) { await unbox(i); }
  busy = true;
  S.back = S.mode; S.focus = i;
  $('#paper').innerHTML = receiptHTML(i);
  $('#paper').scrollTop = 0;
  figs.forEach((f, k) => f.classList.toggle('focus', k === i));
  preloadHD(i);
  app.classList.toggle('has-hd', !!LOOKS[i].hd);
  setMode('detail');
  animateFigs(800);
  applyPoses();
  hideDrag();
  const delay = opt.receiptDelay === undefined ? 260 : opt.receiptDelay;
  if (delay !== null) setTimeout(() => { if (S.mode === 'detail' && S.focus === i) openReceipt(); }, delay);
  setTimeout(() => busy = false, 450);
}
function closeDetail(to) {
  if (S.mode !== 'detail') return;
  hideLoupe();
  closeReceipt();
  $$('.hs.show').forEach(h => h.classList.remove('show'));
  const back = to || S.back;
  setMode(back);
  animateFigs(800);
  applyPoses();
  setTimeout(() => { if (S.mode !== 'detail') figs.forEach(f => f.classList.remove('focus')); }, 300);
  updateHUD(true);
}

/* ---------- 隐藏款拆盒 ---------- */
async function unbox(i) {
  busy = true;
  const f = figs[i];
  f.classList.add('shake');
  await sleepRaw(620);
  const r = f.getBoundingClientRect(), a = app.getBoundingClientRect();
  const fl = $('#flash');
  fl.style.setProperty('--fx', ((r.left + r.width / 2 - a.left) / S.W * 100) + '%');
  fl.style.setProperty('--fy', ((r.top + r.height * 0.42 - a.top) / S.H * 100) + '%');
  fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  await sleepRaw(150);
  S.unlocked[LOOKS[i].id] = true;
  f.classList.remove('locked');
  refreshLabels(); updateHUD(true);
  await sleepRaw(140);
  f.classList.remove('shake');
  toast('隐藏款解锁 · ' + LOOKS[i].en + ' ' + LOOKS[i].cn);
  await sleepRaw(420);
  busy = false;
}
function relock() {
  S.unlocked = {};
  LOOKS.forEach((L, i) => L.hidden && figs[i].classList.add('locked'));
  refreshLabels(); updateHUD(true);
}
const sleepRaw = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 指针：拖拽 / 点击 ---------- */
const dragEl = $('#dragCursor');
function placeDrag(x, y) { dragEl.style.left = x + 'px'; dragEl.style.top = y + 'px'; }
function hideDrag() { dragEl.classList.remove('on', 'press'); }
let ptr = null;
function local(e) { const a = app.getBoundingClientRect(); return { x: e.clientX - a.left, y: e.clientY - a.top }; }

function hitFig(x, y) {
  let best = null, bz = -1;
  figs.forEach((f, i) => {
    const p = f._pose; if (!p || p.op < 0.3) return;
    const w = S.G.baseW * p.s, h = S.G.baseH * p.s;
    if (Math.abs(x - p.x) < w * 0.3 && Math.abs(y - p.y) < h * 0.47 && p.z > bz) { best = i; bz = p.z; }
  });
  return best;
}

stage.addEventListener('pointerdown', e => {
  if (S.demo) return;
  const { x, y } = local(e);
  ptr = { x0: x, y0: y, rot0: S.rot, moved: false, last: [{ x, t: performance.now() }] };
  if (S.mode === 'ring') { S.rotAnim++; stage.setPointerCapture(e.pointerId); dragEl.classList.add('press'); }
});
stage.addEventListener('pointermove', e => {
  const { x, y } = local(e);
  if (S.mode === 'ring' && !S.demo) { placeDrag(x, y); dragEl.classList.add('on'); }
  if (S.mode === 'detail' && !S.demo) {
    if (e.target.closest('.hs')) hideLoupe();      // 悬停热区时让位给价格标签
    else showLoupeAt(e.clientX, e.clientY);
  }
  if (!ptr || S.mode !== 'ring') return;
  const dx = x - ptr.x0;
  if (Math.abs(dx) > 5) { ptr.moved = true; app.classList.add('dragging'); }
  if (ptr.moved) {
    S.rot = ptr.rot0 - dx / S.G.step;
    renderRing();
    ptr.last.push({ x, t: performance.now() }); if (ptr.last.length > 6) ptr.last.shift();
  }
});
stage.addEventListener('pointerleave', () => { if (!ptr) hideDrag(); if (!S.demo) hideLoupe(); });
window.addEventListener('pointerup', e => {
  if (!ptr) return;
  const p = ptr; ptr = null;
  app.classList.remove('dragging'); dragEl.classList.remove('press');
  if (S.mode === 'ring' && p.moved) {
    const a = p.last[0], b = p.last[p.last.length - 1];
    const v = (b.t - a.t) > 0 ? -(b.x - a.x) / (b.t - a.t) / S.G.step : 0;   // items / ms
    animateRot(Math.round(S.rot + clamp(v * 220, -2, 2)), 700);
    return;
  }
  if (p.moved) return;
  const { x, y } = local(e);
  if (S.mode === 'detail') {
    if (e.target.closest('.hs')) return;
    if (hitFig(x, y) === S.focus) return;
    closeDetail(); return;
  }
  const i = hitFig(x, y);
  if (i == null) return;
  if (S.mode === 'ring') {
    if (i === current()) openLook(i); else goTo(i);
  } else if (S.mode === 'grid') openLook(i);
});

let wheelAcc = 0, wheelT = 0;
stage.addEventListener('wheel', e => {
  e.preventDefault();
  if (S.mode === 'detail' && LP.on) {               // 详情视图：滚轮调放大倍率
    ZOOM.k = clamp(ZOOM.k - Math.sign(e.deltaY) * 0.25, ZOOM.min, ZOOM.max);
    return;
  }
  if (S.mode !== 'ring' || S.demo) return;
  wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  const now = performance.now();
  if (Math.abs(wheelAcc) > 40 && now - wheelT > 160) {
    wheelT = now;
    const base = S.rotAnim && Math.abs(rotTarget - S.rot) < 3 ? rotTarget : Math.round(S.rot);
    animateRot(Math.round(base) + Math.sign(wheelAcc), 650);
    wheelAcc = 0;
  }
}, { passive: false });

/* ---------- 按钮 ---------- */
$$('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
$('#plusBtn').addEventListener('click', () => openLook(current()));
$('#closeBtn').addEventListener('click', () => closeDetail());
$('#bagBtn').addEventListener('click', () => toast(`${C.bagLabel} (${S.bag}) · DEMO ONLY`));

/* ---------- 键盘 ---------- */
window.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'Escape') { if (S.demo) stopDemo(); else closeDetail(); return; }
  if (k === 'd' || k === 'D') { runDemo(); return; }
  if (k === 'h' || k === 'H') { document.documentElement.classList.toggle('no-cursor'); return; }
  if (k === 'v' || k === 'V') { S.portrait = !S.portrait; animateFigs(800); layout(); return; }
  if (S.demo) return;
  if (k === 'g' || k === 'G') { showView(S.mode === 'grid' || S.back === 'grid' && S.mode === 'detail' ? 'ring' : 'grid'); return; }
  if (S.mode === 'ring') {
    if (k === 'ArrowRight') animateRot(Math.round(rotTarget === S.rot ? S.rot : rotTarget) + 1);
    if (k === 'ArrowLeft') animateRot(Math.round(rotTarget === S.rot ? S.rot : rotTarget) - 1);
    if (k === 'Enter' || k === ' ') openLook(current());
  }
});
window.addEventListener('resize', () => { layout(); });

/* =========================================================
   演示模式（D 键）：约 12 秒
   ========================================================= */
const arrow = $('#demoArrow');
const A = { x: 0, y: 0 };
function putArrow(x, y) { A.x = x; A.y = y; arrow.style.transform = `translate(${x}px, ${y}px)`; }
async function moveArrow(x, y, dur, tok, onStep) {
  const x0 = A.x, y0 = A.y;
  await tween(dur, e => { if (tok.dead) return; putArrow(lerp(x0, x, e), lerp(y0, y, e)); onStep && onStep(e); }, EASE_IO);
  check(tok);
}
async function click(tok) {
  arrow.classList.add('click'); await wait(140, tok); arrow.classList.remove('click');
}
function check(tok) { if (tok.dead) throw new Error('demo-stopped'); }
async function wait(ms, tok) { await sleepRaw(ms); check(tok); }
function elCenter(el) {
  const r = el.getBoundingClientRect(), a = app.getBoundingClientRect();
  return { x: r.left + r.width / 2 - a.left, y: r.top + r.height / 2 - a.top };
}

function stopDemo() {
  if (!S.demo) return;
  S.demo.dead = true; S.demo = null;
  arrow.classList.remove('on', 'click'); hideDrag(); hideLoupe();
  $$('.hs.show').forEach(h => h.classList.remove('show'));
  app.classList.remove('demo');
}

async function runDemo() {
  stopDemo();
  const tok = { dead: false }; S.demo = tok;
  try {
    // 复位
    closeReceipt(); $$('.hs.show').forEach(h => h.classList.remove('show'));
    S.added = {}; S.bag = 0; $('#bagCount').textContent = '0';
    relock();
    S.rotAnim++; S.rot = 0; rotTarget = 0; busy = false;
    figs.forEach(f => f.classList.remove('focus'));
    if (S.mode !== 'ring') { setMode('ring'); animateFigs(); applyPoses(); } else renderRing();
    updateHUD(true);
    hideDrag();
    const W = S.W, H = S.H;
    putArrow(W * 0.74, H * 0.80);
    arrow.classList.add('on');

    // 1) 环形视图停留 1.5 秒（箭头缓慢漂向舞台）
    await moveArrow(W * 0.64, H * 0.55, 1400, tok);
    await wait(100, tok);

    // 2) 拖拽转到 05 社牛
    placeDrag(A.x, A.y); dragEl.classList.add('on', 'press');
    const feature = C.demoFeatureIndex;
    const startRot = S.rot, target = feature;
    S.rotAnim++;
    await moveArrow(W * 0.30, H * 0.53, 1250, tok, e => {
      placeDrag(A.x, A.y);
      S.rot = lerp(startRot, target, e); renderRing();
    });
    S.rot = target; rotTarget = target; renderRing();
    dragEl.classList.remove('press');
    await wait(150, tok);
    hideDrag();

    // 3) 点开 05
    await moveArrow(W * 0.5, H * 0.50, 420, tok);
    await click(tok);
    await openLook(feature, { receiptDelay: null });
    await wait(650, tok);

    // 4) 依次亮出热区标签
    const hs = $$('.hs', figs[feature]);
    for (const h of hs) {
      const c = elCenter($('.hs-dot', h));
      await moveArrow(c.x - 2, c.y - 2, 330, tok);
      h.classList.add('show');
      await wait(380, tok);
    }

    // 4.5) 有高清图时，用放大镜扫过面料
    if (LOOKS[feature].hd) {
      $$('.hs.show').forEach(h => h.classList.remove('show'));
      const r = $('img', figs[feature]).getBoundingClientRect(), a = app.getBoundingClientRect();
      const pt = (u, v) => ({ x: r.left - a.left + u * r.width, y: r.top - a.top + v * r.height });
      let q = pt(0.42, 0.40);
      await moveArrow(q.x, q.y, 360, tok);
      const follow = () => showLoupeAt(A.x + a.left, A.y + a.top);
      follow();
      q = pt(0.55, 0.62);
      await moveArrow(q.x, q.y, 1100, tok, follow);
      await wait(350, tok);
      hideLoupe();
    }

    // 5) 小票滑入，停 2.5 秒
    openReceipt();
    await moveArrow(W * (S.portrait ? 0.7 : 0.78), H * 0.42, 900, tok);
    await wait(2100, tok);

    // 6) ADD WHOLE FIT
    const cta = $('.r-cta');
    let c = elCenter(cta);
    await moveArrow(c.x + W * 0.04, c.y + 4, 420, tok);
    await click(tok);
    addWholeFit(cta);
    await wait(380, tok);

    // 7) 关闭
    c = elCenter($('#closeBtn'));
    await moveArrow(c.x, c.y + 2, 380, tok);
    await click(tok);
    closeDetail();
    await wait(380, tok);

    // 8) 切到网格
    c = elCenter($('[data-view="grid"]'));
    await moveArrow(c.x + 2, c.y, 420, tok);
    await click(tok);
    showView('grid');
    await wait(720, tok);

    // 9) 点开 09 拆盒，停在她的清单上
    const secret = LOOKS.findIndex(L => L.hidden);
    const last = secret >= 0 ? secret : N - 1;
    const p = figs[last]._pose;
    await moveArrow(p.x + 4, p.y, 480, tok);
    await click(tok);
    await openLook(last);
    await wait(900, tok);
    stopDemo();
  } catch (err) {
    if (err.message !== 'demo-stopped') console.error(err);
    if (S.demo === tok) stopDemo();
  }
}

/* ---------- 配置与透明轮廓遮罩 ---------- */
function applyConfig() {
  document.title = C.pageTitle;
  const text = (selector, value) => $(selector).textContent = value;
  text('.brand', C.brand); const mark = document.createElement('sup'); mark.textContent = C.brandMark; $('.brand').append(mark);
  text('.brand-sub', C.subtitle); text('.tb-time', C.statusTime); text('.tb-loc', C.statusText);
  text('.battery-pct', C.battery); text('.side-right .ghost', C.season);
  text('#sideCount', String(N).padStart(2, '0') + ' LOOKS');
  text('#hudTotal', String(N).padStart(2, '0')); text('.shop-label', C.shopLabel);
  text('#bagLabel', C.bagLabel); $('#plusBtn').setAttribute('aria-label', C.shopLabel);
  for (const [key, css] of [['background','--bg'],['ink','--ink'],['muted','--mute']]) document.documentElement.style.setProperty(css, C.theme[key]);
  document.documentElement.style.setProperty('--line', C.theme.ink);
  figs.forEach((f, i) => {
    if (window.HD_MASKS[LOOKS[i].id]) return;
    const im = $('img', f);
    const build = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 72;
        const ctx = canvas.getContext('2d', {willReadFrequently:true}); ctx.drawImage(im, 0, 0, 48, 72);
        const pixels = ctx.getImageData(0, 0, 48, 72).data; let mask = '', transparent = false;
        for (let p=3;p<pixels.length;p+=4) { mask += pixels[p] > 24 ? '1' : '0'; if(pixels[p] < 24) transparent=true; }
        if (transparent) window.HD_MASKS[LOOKS[i].id] = mask;
      } catch (_) { /* file:// canvas may be restricted; the gallery still works. */ }
    };
    if (im.complete && im.naturalWidth) build(); else im.addEventListener('load', build, {once:true});
  });
}
applyConfig();
/* ---------- 启动 ---------- */
refreshLabels();
layout();
updateHUD(true);
window.__SHOWCASE = { S, LOOKS, openLook, closeDetail, showView, runDemo, goTo, layout };
