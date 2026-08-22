import { Vec2 } from "./vec2.js";

export class Particle {
  constructor({ x, y, pinned = false } = {}) {
    this.pos = new Vec2(x, y);
    this.oldPos = new Vec2(x, y);
    this.rest = new Vec2(x, y);
    this.acceleration = new Vec2();
    this.pinned = pinned;
  }

  applyForce(v) {
    this.acceleration.add(v);
  }

  update(gravity, damping) {
    if (this.pinned) {
      this.acceleration.reset();
      return;
    }

    const vx = (this.pos.x - this.oldPos.x) * damping;
    const vy = (this.pos.y - this.oldPos.y) * damping;
    this.oldPos.reset(this.pos.x, this.pos.y);
    this.pos.x += vx + this.acceleration.x;
    this.pos.y += vy + this.acceleration.y + gravity;
    this.acceleration.reset();
  }
}

export class Constraint {
  constructor({ p1, p2, length, stiffness = 1 }) {
    this.p1 = p1;
    this.p2 = p2;
    this.length = length;
    this.stiffness = stiffness;
  }

  solve() {
    const dx = this.p2.pos.x - this.p1.pos.x;
    const dy = this.p2.pos.y - this.p1.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || dist <= this.length) return;

    const w1 = this.p1.pinned ? 0 : 1;
    const w2 = this.p2.pinned ? 0 : 1;
    const w = w1 + w2;
    if (w === 0) return;

    const excess = (dist - this.length) / dist;
    const ox = dx * excess;
    const oy = dy * excess;
    this.p1.pos.x += ox * (w1 / w);
    this.p1.pos.y += oy * (w1 / w);
    this.p2.pos.x -= ox * (w2 / w);
    this.p2.pos.y -= oy * (w2 / w);
  }
}
