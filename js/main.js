import { Input } from "./input.js";
import { parseVinesSheet } from "./parse-vine.js";
import { Vine } from "./vine.js";
import { smoothstep } from "./vec2.js";

const dpr = Math.min(window.devicePixelRatio || 1, 2);
const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");

const layout = await fetch("assets/layout.json").then((r) => r.json());
const windowFrame = layout.background;

const backgroundFrames = (windowFrame.frames || [windowFrame.src]).map(loadImage);
const planter = loadImage(layout.planter.src);

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = reject;
  });
}

const [planterImg, parsedVines, ...bgFrames] = await Promise.all([
  planter,
  parseVinesSheet(layout.vinesSheet.src),
  ...backgroundFrames,
]);

const BREEZE = [0, 1, 2, 3, 4, 3, 2, 1];
const FRAME_MS = windowFrame.frameMs || 1000;

const planterBox = layout.planter;
const vineOrigin = { x: layout.vinesSheet.x, y: layout.vinesSheet.y };
const vines = parsedVines
  .filter((parsed) => parsed.centerline.length >= 2)
  .map(
    (parsed) =>
      new Vine({
        origin: vineOrigin,
        parsed,
      })
  );

console.info(
  "String of Pearls:",
  parsedVines.map((v) => ({
    id: v.id,
    particles: v.centerline.length,
    pearls: v.pearls.length,
  }))
);

let view = { scale: 1, ox: 0, oy: 0 };

function sizeCanvas() {
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  const sx = window.innerWidth / windowFrame.width;
  const sy = window.innerHeight / windowFrame.height;
  view.scale = Math.max(sx, sy);
  view.ox = (window.innerWidth - windowFrame.width * view.scale) / 2;
  view.oy = (window.innerHeight - windowFrame.height * view.scale) / 2;
}

function toScene(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cssX = clientX - rect.left;
  const cssY = clientY - rect.top;
  return {
    x: (cssX - view.ox) / view.scale,
    y: (cssY - view.oy) / view.scale,
  };
}

sizeCanvas();
window.addEventListener("resize", sizeCanvas);

const input = new Input(canvas, toScene);
input.onGrab = (mouse) => {
  for (const vine of vines) {
    const p = vine.nearestParticle(mouse, 18);
    if (p && !p.pinned) {
      p.originalPinnedState = p.pinned;
      p.pinned = true;
      input.grabbed = p;
      break;
    }
  }
};

function drawScene() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.fillStyle = "#0c0d09";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  ctx.setTransform(
    dpr * view.scale,
    0,
    0,
    dpr * view.scale,
    dpr * view.ox,
    dpr * view.oy
  );

  const cycle = BREEZE.length * FRAME_MS;
  const t = (performance.now() % cycle) / FRAME_MS;
  const i = Math.floor(t) % BREEZE.length;
  const next = (i + 1) % BREEZE.length;
  const mix = smoothstep(0, 1, t - i);
  const a = bgFrames[BREEZE[i]];
  const b = bgFrames[BREEZE[next]];
  ctx.drawImage(a, windowFrame.x, windowFrame.y, windowFrame.width, windowFrame.height);
  if (mix > 0) {
    ctx.save();
    ctx.globalAlpha = mix;
    ctx.drawImage(b, windowFrame.x, windowFrame.y, windowFrame.width, windowFrame.height);
    ctx.restore();
  }
  ctx.drawImage(
    planterImg,
    planterBox.x,
    planterBox.y,
    planterBox.width,
    planterBox.height
  );

  for (const vine of vines) vine.draw(ctx);
}

let last = performance.now();
function tick(now) {
  const dt = Math.min(32, now - last);
  last = now;

  for (const vine of vines) {
    const holding = vine.holds(input.grabbed);
    const disturbed =
      holding ||
      (input.ready && vine.applyMouse(input.mouse, input.pointerDown));
    vine.step(input.grabbed, disturbed);
    if (input.ready) vine.disturbPearls(input.mouse, input.speed, dt);
    else vine.disturbPearls({ x: -1e6, y: -1e6 }, 0, dt);
  }
  input.speed *= 0.85;

  drawScene();
  requestAnimationFrame(tick);
}

drawScene();
requestAnimationFrame(tick);
