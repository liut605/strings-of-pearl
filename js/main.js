import { Input } from "./input.js";
import { parseVinesSheet } from "./parse-vine.js";
import { Vine } from "./vine.js";
import { smoothstep } from "./vec2.js";

const unsupported = document.getElementById("unsupported");
const isSmallScreen = window.matchMedia("(max-width: 1023px)").matches;
const isTouchPrimary = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

if (isSmallScreen || isTouchPrimary) {
  document.documentElement.classList.add("is-unsupported");
  if (unsupported) unsupported.hidden = false;
} else {
  await bootPrototype();
}

async function bootPrototype() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const loader = document.getElementById("loader");

  const GROW_DURATION_MS = 2200;
  const GROW_STAGGER_MS = 550;

  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return new Promise((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = reject;
    });
  }

  function waitFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  const layout = await fetch("assets/layout.json").then((r) => r.json());
  const windowFrame = layout.background;
  const bgSources = windowFrame.frames || [windowFrame.src];

  const bgFrames = await Promise.all(bgSources.map(loadImage));

  const BREEZE = [0, 1, 2, 3, 4, 3, 2, 1];
  const FRAME_MS = windowFrame.frameMs || 1000;
  const planterBox = layout.planter;
  const vineOrigin = { x: layout.vinesSheet.x, y: layout.vinesSheet.y };

  let view = { scale: 1, ox: 0, oy: 0 };
  let planterImg = null;
  let vines = [];
  /** Planter + vines stay off until loading text is gone. */
  let showPlants = false;
  let growthStart = 0;
  let growthDone = false;
  let growDelays = [];

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

  function drawBackground() {
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
  }

  function updateGrowth(now) {
    if (!showPlants || growthDone) return;
    let allDone = true;
    for (let i = 0; i < vines.length; i++) {
      const local = (now - growthStart - growDelays[i]) / GROW_DURATION_MS;
      const g = smoothstep(0, 1, local);
      vines[i].growth = g;
      if (g < 1) allDone = false;
    }
    growthDone = allDone;
  }

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

    drawBackground();

    if (!showPlants) return;

    ctx.drawImage(
      planterImg,
      planterBox.x,
      planterBox.y,
      planterBox.width,
      planterBox.height
    );
    for (const vine of vines) vine.draw(ctx);
  }

  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);

  const input = new Input(canvas, toScene);
  input.onGrab = (mouse) => {
    if (!growthDone) return;
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

  let last = performance.now();

  function tick(now) {
    const dt = Math.min(32, now - last);
    last = now;

    updateGrowth(now);

    if (showPlants) {
      for (const vine of vines) {
        const holding = growthDone && vine.holds(input.grabbed);
        const disturbed =
          holding ||
          (growthDone && input.ready && vine.applyMouse(input.mouse, input.pointerDown));
        vine.step(holding ? input.grabbed : null, disturbed);
        if (growthDone && input.ready) vine.disturbPearls(input.mouse, input.speed, dt);
        else vine.disturbPearls({ x: -1e6, y: -1e6 }, 0, dt);
      }
      if (growthDone) input.speed *= 0.85;
    }

    drawScene();
    requestAnimationFrame(tick);
  }

  // Background first, then loading text — no black interstitial screen.
  drawScene();
  if (loader) {
    loader.hidden = false;
    loader.setAttribute("aria-busy", "true");
  }
  requestAnimationFrame(tick);

  const [planter, parsedVines] = await Promise.all([
    loadImage(layout.planter.src),
    parseVinesSheet(layout.vinesSheet.src),
  ]);

  planterImg = planter;
  vines = parsedVines
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

  // Stagger growth by hanging-point x so vines unfurl across the planter.
  const xs = vines.map((v) => v.particles[0].pos.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const span = maxX - minX || 1;
  growDelays = vines.map((v) => ((v.particles[0].pos.x - minX) / span) * GROW_STAGGER_MS);

  // Text off first, then plants grow — never both.
  if (loader) {
    loader.hidden = true;
    loader.setAttribute("aria-busy", "false");
    loader.remove();
  }
  await waitFrame();
  await waitFrame();
  growthStart = performance.now();
  showPlants = true;
}
