export class Input {
  constructor(canvas, toScene) {
    this.canvas = canvas;
    this.toScene = toScene;
    this.mouse = { x: 0, y: 0 };
    this.prev = { x: 0, y: 0 };
    this.speed = 0;
    this.pointerDown = false;
    this.grabbed = null;
    this.ready = false;
    this._onDown = this.onDown.bind(this);
    this._onUp = this.onUp.bind(this);
    this._onMove = this.onMove.bind(this);
    canvas.addEventListener("pointerdown", this._onDown);
    window.addEventListener("pointerup", this._onUp);
    window.addEventListener("pointermove", this._onMove);
  }

  setFromEvent(e) {
    const p = this.toScene(e.clientX, e.clientY);
    if (!this.ready) {
      this.mouse.x = this.prev.x = p.x;
      this.mouse.y = this.prev.y = p.y;
      this.ready = true;
      return;
    }
    this.prev.x = this.mouse.x;
    this.prev.y = this.mouse.y;
    this.mouse.x = p.x;
    this.mouse.y = p.y;
  }

  onDown(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.setFromEvent(e);
    this.pointerDown = true;
    this.onGrab?.(this.mouse);
  }

  onUp() {
    this.pointerDown = false;
    if (this.grabbed) {
      this.grabbed.pinned = this.grabbed.originalPinnedState;
      this.grabbed = null;
    }
  }

  onMove(e) {
    this.setFromEvent(e);
    const dx = this.mouse.x - this.prev.x;
    const dy = this.mouse.y - this.prev.y;
    this.speed = Math.hypot(dx, dy);
    if (this.grabbed) {
      this.grabbed.pos.reset(this.mouse.x, this.mouse.y);
      this.grabbed.oldPos.reset(this.mouse.x, this.mouse.y);
    }
  }
}
