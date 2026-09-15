import { Vec2, lerp, smoothstep } from "./vec2.js";
import { Particle, Constraint } from "./physics.js";

const GRAVITY = 0.08;
const DAMPING = 0.988;
const GRAB_DAMPING = 0.82;
const SHAPE_RETURN = 0.012;
const ITERATIONS = 5;
const GRAB_ITERATIONS = 32;
const MOUSE_SIZE = 90 * 90;
const MOUSE_STRENGTH = 2.4;
const MAX_FALL_FRACTION = 0.2;
const MAX_FALLING = 6;
const SPEED_SLAP = 22;
const STRESS_DROP = 1.4;
const NEAR_RADIUS = 36;

export class Vine {
  constructor({ origin, parsed }) {
    this.origin = origin;
    this.stemWidth = parsed.stemWidth;
    this.stemFill = parsed.stemFill;
    this.particles = parsed.centerline.map(
      (p, i) =>
        new Particle({
          x: origin.x + p.x,
          y: origin.y + p.y,
          pinned: i === 0,
        })
    );
    this.constraints = [];
    for (let i = 0; i < this.particles.length - 1; i++) {
      const a = this.particles[i];
      const b = this.particles[i + 1];
      this.constraints.push(
        new Constraint({
          p1: a,
          p2: b,
          length: Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y),
        })
      );
    }
    this.pearls = parsed.pearls.map((p) => ({
      ...p,
      attached: true,
      stress: 0,
      pos: new Vec2(),
      vel: new Vec2(),
    }));
    this.fallen = 0;
    this.cooldown = 0;
    /** 0–1 stem reveal from the hanging point downward. */
    this.growth = 0;
    this.placePearls();
  }

  pointAt(t) {
    const n = this.particles.length - 1;
    const f = Math.max(0, Math.min(1, t)) * n;
    const i = Math.min(n - 1, Math.floor(f));
    const u = f - i;
    const a = this.particles[i].pos;
    const b = this.particles[i + 1].pos;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    return {
      x: lerp(a.x, b.x, u),
      y: lerp(a.y, b.y, u),
      tx,
      ty,
      nx: -ty,
      ny: tx,
    };
  }

  placePearls() {
    for (const pearl of this.pearls) {
      if (!pearl.attached) continue;
      const p = this.pointAt(pearl.t);
      pearl.pos.reset(
        p.x + p.tx * pearl.along + p.nx * pearl.side,
        p.y + p.ty * pearl.along + p.ny * pearl.side
      );
    }
  }

  holds(particle) {
    return particle && this.particles.includes(particle);
  }

  limitGrab(grabbed) {
    const gi = this.particles.indexOf(grabbed);
    if (gi <= 0) return;
    const pin = this.particles[0];
    let maxLen = 0;
    for (let i = 0; i < gi; i++) maxLen += this.constraints[i].length;
    const dx = grabbed.pos.x - pin.pos.x;
    const dy = grabbed.pos.y - pin.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxLen || dist === 0) return;
    const s = maxLen / dist;
    grabbed.pos.reset(pin.pos.x + dx * s, pin.pos.y + dy * s);
    grabbed.oldPos.reset(grabbed.pos.x, grabbed.pos.y);
  }

  applyMouse(mouse, pointerDown) {
    let hit = false;
    for (const p of this.particles) {
      const dx = mouse.x - p.pos.x;
      const dy = mouse.y - p.pos.y;
      const ls = dx * dx + dy * dy;
      if (ls >= MOUSE_SIZE || ls === 0) continue;
      hit = true;
      const a = Math.atan2(dy, dx) - Math.PI;
      const strength =
        smoothstep(MOUSE_SIZE, -1200, ls) * MOUSE_STRENGTH * (pointerDown ? 1.35 : 0.85);
      p.applyForce(new Vec2(Math.cos(a) * strength, Math.sin(a) * strength));
    }
    return hit;
  }

  step(grabbed, disturbed) {
    const holding = this.holds(grabbed);
    if (holding) this.limitGrab(grabbed);

    const damping = holding ? GRAB_DAMPING : DAMPING;
    for (const p of this.particles) p.update(GRAVITY, damping);

    if (holding) this.limitGrab(grabbed);

    if (!holding) {
      const k = disturbed ? SHAPE_RETURN * 0.2 : SHAPE_RETURN;
      for (const p of this.particles) {
        if (p.pinned) continue;
        p.pos.x += (p.rest.x - p.pos.x) * k;
        p.pos.y += (p.rest.y - p.pos.y) * k;
      }
    }

    const iters = holding ? GRAB_ITERATIONS : ITERATIONS;
    for (let i = 0; i < iters; i++) {
      for (const c of this.constraints) c.solve();
    }

    if (holding) {
      this.limitGrab(grabbed);
      for (const p of this.particles) {
        if (p.pinned) continue;
        p.oldPos.x += (p.pos.x - p.oldPos.x) * 0.65;
        p.oldPos.y += (p.pos.y - p.oldPos.y) * 0.65;
      }
    }

    this.placePearls();
  }

  disturbPearls(mouse, speed, dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    const attached = this.pearls.filter((p) => p.attached);
    const cap = Math.max(1, Math.floor(this.pearls.length * MAX_FALL_FRACTION));
    const falling = this.pearls.filter((p) => !p.attached && p.pos.y < 1400).length;

    for (const pearl of attached) {
      const dist = Math.hypot(mouse.x - pearl.pos.x, mouse.y - pearl.pos.y);
      const near = dist < NEAR_RADIUS + Math.max(pearl.rx, pearl.ry);
      if (near) {
        pearl.stress += speed > SPEED_SLAP ? 0.55 : 0.045;
      } else {
        pearl.stress *= 0.96;
      }

      const slap = speed > SPEED_SLAP && near;
      const worn = pearl.stress > STRESS_DROP && near;
      const allowed =
        this.fallen < cap &&
        falling < MAX_FALLING &&
        this.cooldown <= 0;
      if (allowed && (slap || worn)) {
        this.detach(pearl, mouse, speed);
      }
    }

    for (const pearl of this.pearls) {
      if (pearl.attached) continue;
      pearl.vel.y += GRAVITY * 1.15;
      pearl.vel.x *= 0.995;
      pearl.vel.y *= 0.995;
      pearl.pos.x += pearl.vel.x;
      pearl.pos.y += pearl.vel.y;
    }
  }

  detach(pearl, mouse, speed) {
    pearl.attached = false;
    this.fallen += 1;
    this.cooldown = 420;
    const dirx = pearl.pos.x - mouse.x;
    const diry = pearl.pos.y - mouse.y;
    const len = Math.hypot(dirx, diry) || 1;
    const kick = Math.min(6, 1.2 + speed * 1.8);
    pearl.vel.reset((dirx / len) * kick, Math.abs(diry / len) * kick * 0.35 + 0.8);
  }

  draw(ctx) {
    const growth = Math.max(0, Math.min(1, this.growth));
    if (growth <= 0.001) return;

    const pts = this.particles;
    const end = growth * (pts.length - 1);
    const iEnd = Math.floor(end);
    const frac = end - iEnd;
    const visible = [];
    for (let i = 0; i <= iEnd; i++) visible.push(pts[i].pos);
    if (frac > 0.001 && iEnd < pts.length - 1) {
      const a = pts[iEnd].pos;
      const b = pts[iEnd + 1].pos;
      visible.push({ x: lerp(a.x, b.x, frac), y: lerp(a.y, b.y, frac) });
    }
    if (visible.length < 2) return;

    ctx.save();
    ctx.strokeStyle = this.stemFill;
    ctx.lineWidth = this.stemWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(visible[0].x, visible[0].y);
    if (visible.length === 2) {
      ctx.lineTo(visible[1].x, visible[1].y);
    } else {
      for (let i = 1; i < visible.length - 1; i++) {
        const midX = (visible[i].x + visible[i + 1].x) / 2;
        const midY = (visible[i].y + visible[i + 1].y) / 2;
        ctx.quadraticCurveTo(visible[i].x, visible[i].y, midX, midY);
      }
      const last = visible[visible.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
    ctx.restore();

    for (const pearl of this.pearls) {
      if (pearl.attached && pearl.t > growth) continue;
      if (!pearl.attached && pearl.pos.y > 1250) continue;
      this.drawPearl(ctx, pearl);
    }
  }

  drawPearl(ctx, pearl) {
    const { x, y } = pearl.pos;
    const g = ctx.createRadialGradient(
      x - pearl.rx * 0.25,
      y - pearl.ry * 0.2,
      pearl.rx * 0.1,
      x,
      y,
      Math.max(pearl.rx, pearl.ry)
    );
    g.addColorStop(0, pearl.fill.inner);
    g.addColorStop(1, pearl.fill.outer);
    ctx.beginPath();
    ctx.ellipse(x, y, pearl.rx, pearl.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = pearl.rim || "rgba(15, 13, 1, 0.55)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  nearestParticle(point, radius) {
    let best = null;
    let bestD = radius * radius;
    for (const p of this.particles) {
      const dx = point.x - p.pos.x;
      const dy = point.y - p.pos.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }
}
