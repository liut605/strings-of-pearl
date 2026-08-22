/** Sample a closed filled stem into a top-to-bottom centerline, and collect pearl ellipses. */

function parseStops(svg, fill) {
  const fallback = { inner: "#2a2410", outer: "#1a1608" };
  if (!fill) return fallback;
  if (!fill.startsWith("url(")) return { inner: fill, outer: fill };
  const id = fill.slice(fill.indexOf("#") + 1, fill.indexOf(")"));
  const grad = svg.querySelector(`#${CSS.escape(id)}`);
  if (!grad) return fallback;
  const stops = [...grad.querySelectorAll("stop")];
  if (!stops.length) return fallback;
  const inner = stops[0].getAttribute("stop-color") || fallback.inner;
  const outer = stops[stops.length - 1].getAttribute("stop-color") || fallback.outer;
  return { inner, outer };
}

/** Map a point from an element's local space into the root SVG viewBox. */
function accumulatedTranslate(el, svg) {
  let x = 0;
  let y = 0;
  for (let n = el; n && n !== svg; n = n.parentElement) {
    const tr = n.getAttribute?.("transform") || "";
    const m = /translate\(\s*([-\d.eE]+)(?:[,\s]+|\s+)([-\d.eE]+)/.exec(tr);
    if (m) {
      x += parseFloat(m[1]);
      y += parseFloat(m[2]);
    }
  }
  return { x, y };
}

function toSvgUser(el, x, y, svg) {
  const t = accumulatedTranslate(el, svg);
  return { x: x + t.x, y: y + t.y };
}

function samplePath(pathEl, svg, steps = 240) {
  const len = pathEl.getTotalLength();
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const p = pathEl.getPointAtLength((i / steps) * len);
    pts.push(toSvgUser(pathEl, p.x, p.y, svg));
  }
  return pts;
}

function centerlineFromLoop(points, bins = 52) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const span = Math.max(1e-3, maxY - minY);
  const buckets = Array.from({ length: bins }, () => []);
  for (const p of points) {
    const i = Math.min(bins - 1, Math.floor(((p.y - minY) / span) * bins));
    buckets[i].push(p);
  }
  const line = [];
  for (const bucket of buckets) {
    if (!bucket.length) continue;
    let x = 0;
    let y = 0;
    for (const p of bucket) {
      x += p.x;
      y += p.y;
    }
    line.push({ x: x / bucket.length, y: y / bucket.length });
  }
  return line;
}

function resample(points, count) {
  if (points.length < 2) return points.slice();
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(
      lengths[i - 1] +
        Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    );
  }
  const total = lengths[lengths.length - 1] || 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = (i / (count - 1)) * total;
    let j = 1;
    while (j < lengths.length && lengths[j] < d) j++;
    const a = points[j - 1];
    const b = points[Math.min(j, points.length - 1)];
    const span = lengths[j] - lengths[j - 1] || 1;
    const t = (d - lengths[j - 1]) / span;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function closestOnPolyline(px, py, line) {
  let bestD = Infinity;
  let best = { x: line[0].x, y: line[0].y, t: 0, tx: 0, ty: 1 };
  let traveled = 0;
  const segs = [];
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i].x;
    const ay = line[i].y;
    const bx = line[i + 1].x;
    const by = line[i + 1].y;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    segs.push({ ax, ay, dx, dy, len, start: traveled });
    traveled += len;
  }
  const total = traveled || 1;
  for (const s of segs) {
    const t = Math.max(0, Math.min(1, ((px - s.ax) * s.dx + (py - s.ay) * s.dy) / (s.len * s.len)));
    const x = s.ax + s.dx * t;
    const y = s.ay + s.dy * t;
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bestD) {
      bestD = d;
      const inv = 1 / s.len;
      best = { x, y, t: (s.start + t * s.len) / total, tx: s.dx * inv, ty: s.dy * inv };
    }
  }
  return best;
}

function isStemPath(el) {
  return /^vine-/i.test(el.getAttribute("id") || "");
}

function collectPearlElements(root) {
  const out = [];
  const seen = new Set();
  const add = (el) => {
    if (!el || seen.has(el) || el.closest("mask")) return;
    seen.add(el);
    out.push(el);
  };

  for (const g of root.querySelectorAll('g[id*="pearl"]')) {
    add(
      g.querySelector(
        ':scope > ellipse, :scope > circle, :scope > path[id^="Ellipse"], :scope > path'
      )
    );
  }
  for (const el of root.querySelectorAll("ellipse, circle, path")) {
    if (el.closest('g[id*="pearl"]')) continue;
    if (isStemPath(el)) continue;
    const id = el.getAttribute("id") || "";
    const tag = el.tagName.toLowerCase();
    const looksPearl =
      tag === "ellipse" ||
      tag === "circle" ||
      /^Ellipse/i.test(id) ||
      /pearl/i.test(id);
    if (looksPearl) add(el);
  }
  return out;
}

function pearlGeometry(el, svg) {
  const tag = el.tagName.toLowerCase();
  let cx;
  let cy;
  let rx;
  let ry;
  if (tag === "circle") {
    cx = parseFloat(el.getAttribute("cx"));
    cy = parseFloat(el.getAttribute("cy"));
    rx = ry = parseFloat(el.getAttribute("r"));
  } else if (tag === "ellipse") {
    cx = parseFloat(el.getAttribute("cx"));
    cy = parseFloat(el.getAttribute("cy"));
    rx = parseFloat(el.getAttribute("rx"));
    ry = parseFloat(el.getAttribute("ry"));
  } else {
    try {
      const b = el.getBBox();
      cx = b.x + b.width / 2;
      cy = b.y + b.height / 2;
      rx = b.width / 2;
      ry = b.height / 2;
    } catch {
      return null;
    }
  }
  if (![cx, cy, rx, ry].every(Number.isFinite)) return null;
  const center = toSvgUser(el, cx, cy, svg);
  const east = toSvgUser(el, cx + rx, cy, svg);
  const south = toSvgUser(el, cx, cy + ry, svg);
  const fill = parseStops(svg, el.getAttribute("fill"));
  const rim = el.getAttribute("stroke") || fill.outer;
  return {
    cx: center.x,
    cy: center.y,
    rx: Math.hypot(east.x - center.x, east.y - center.y),
    ry: Math.hypot(south.x - center.x, south.y - center.y),
    fill,
    rim,
  };
}

function buildVine(id, stemPath, pearlEls, svg) {
  if (!stemPath || !stemPath.getTotalLength()) return null;
  const loop = samplePath(stemPath, svg, 280);
  const rawLine = centerlineFromLoop(loop, 56);
  if (rawLine.length < 2) return null;
  const height = rawLine[rawLine.length - 1].y - rawLine[0].y;
  const count = Math.max(3, Math.min(72, Math.round(Math.abs(height) / 10) + 1));
  const centerline = resample(rawLine, count);

  let stemWidth = 2.2;
  const midY = (rawLine[0].y + rawLine[rawLine.length - 1].y) / 2;
  const near = loop.filter((p) => Math.abs(p.y - midY) < 4).map((p) => p.x);
  if (near.length >= 2) {
    stemWidth = Math.max(1.2, Math.min(4, Math.max(...near) - Math.min(...near)));
  }

  const pearls = [];
  for (const el of pearlEls) {
    const geo = pearlGeometry(el, svg);
    if (!geo) continue;
    const hit = closestOnPolyline(geo.cx, geo.cy, centerline);
    const nx = -hit.ty;
    const ny = hit.tx;
    const dx = geo.cx - hit.x;
    const dy = geo.cy - hit.y;
    pearls.push({
      rx: geo.rx,
      ry: geo.ry,
      fill: geo.fill,
      rim: geo.rim,
      t: hit.t,
      along: dx * hit.tx + dy * hit.ty,
      side: dx * nx + dy * ny,
    });
  }
  pearls.sort((a, b) => a.t - b.t);

  const stemFill =
    parseStops(svg, stemPath.getAttribute("fill")).outer || "#12180C";
  return { id, centerline, pearls, stemWidth, stemFill };
}

/** Parse the full vines sheet: each vine-* group, plus loose stem-only paths. Names are ignored for order/color. */
export async function parseVinesSheet(url) {
  const text = await fetch(url).then((r) => r.text());
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;

  const holder = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  holder.setAttribute("aria-hidden", "true");
  const vb = svg.getAttribute("viewBox") || "0 0 1376 755";
  holder.setAttribute("viewBox", vb);
  holder.style.cssText =
    "position:absolute;left:-9999px;top:0;width:1376px;height:755px;opacity:0;pointer-events:none";
  const imported = document.importNode(svg, true);
  holder.appendChild(imported);
  document.body.appendChild(holder);

  const root = imported.querySelector("#vines") || imported;
  const vines = [];

  for (const g of root.querySelectorAll(':scope > g[id*="vine-"]')) {
    const stem =
      [...g.querySelectorAll("path")].find((p) => isStemPath(p)) ||
      g.querySelector("path");
    const vine = buildVine(g.getAttribute("id"), stem, collectPearlElements(g), imported);
    if (vine) vines.push(vine);
  }

  for (const path of root.querySelectorAll(':scope > path[id^="vine-"]')) {
    const vine = buildVine(path.getAttribute("id"), path, [], imported);
    if (vine) vines.push(vine);
  }

  holder.remove();
  return vines;
}

export async function parseVineSvg(url) {
  const all = await parseVinesSheet(url);
  return all[0] || { centerline: [], pearls: [], stemWidth: 2, stemFill: "#12180C" };
}
