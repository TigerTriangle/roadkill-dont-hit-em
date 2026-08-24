export type Actions = {
  steer: number;
  throttle: number;
  brake: number;
  horn: boolean;
  hornPressed: boolean;
  pausePressed: boolean;
};

const GAME_CODES = new Set([
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
  "KeyH",
  "KeyP",
  "Escape",
  "Enter",
]);

function radialDeadzone(x: number, y: number, dz = 0.18) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

export class Input {
  keys = new Set<string>();
  touchSteer = 0;
  touchThrottle = 0;
  touchBrake = 0;
  touchHorn = false;
  injectedSteer: number | null = null;
  injectedKeys: string[] | null = null;
  onGesture: (() => void) | null = null;
  private prevHorn = false;
  private prevPause = false;

  attach() {
    const down = (e: KeyboardEvent) => {
      if (GAME_CODES.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
      this.onGesture?.();
    };
    const up = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };
    const clear = () => this.keys.clear();
    window.addEventListener("keydown", down, { capture: true });
    window.addEventListener("keyup", up, { capture: true });
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clear();
    });
    this._off = () => {
      window.removeEventListener("keydown", down, { capture: true } as AddEventListenerOptions);
      window.removeEventListener("keyup", up, { capture: true } as AddEventListenerOptions);
      window.removeEventListener("blur", clear);
    };
  }

  private _off: (() => void) | null = null;

  detach() {
    this._off?.();
    this._off = null;
  }

  setTouchSteer(v: number) {
    this.touchSteer = v;
  }
  setTouchThrottle(v: number) {
    this.touchThrottle = v;
  }
  setTouchBrake(v: number) {
    this.touchBrake = v;
  }
  setTouchHorn(v: boolean) {
    this.touchHorn = v;
  }

  poll(): Actions {
    const held = new Set(this.keys);
    if (this.injectedKeys) {
      for (const c of this.injectedKeys) held.add(c);
    }

    let steer = 0;
    if (held.has("KeyA") || held.has("ArrowLeft")) steer -= 1;
    if (held.has("KeyD") || held.has("ArrowRight")) steer += 1;
    steer += this.touchSteer;

    let throttle = this.touchThrottle;
    let brake = this.touchBrake;
    if (held.has("KeyW") || held.has("ArrowUp")) throttle += 1;
    if (held.has("KeyS") || held.has("ArrowDown")) brake += 1;

    let padHorn = false;
    const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : [];
    if (pads) {
      for (const pad of pads) {
        if (!pad) continue;
        const stick = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
        steer += stick.x;
        if (stick.y < -0.3) throttle += -stick.y;
        if (stick.y > 0.3) brake += stick.y;
        if (pad.buttons[14]?.pressed) steer -= 1;
        if (pad.buttons[15]?.pressed) steer += 1;
        if (pad.buttons[12]?.pressed) throttle += 1;
        if (pad.buttons[13]?.pressed) brake += 1;
        if (pad.buttons[7]?.value) throttle += pad.buttons[7].value;
        if (pad.buttons[6]?.value) brake += pad.buttons[6].value;
        if (pad.buttons[0]?.pressed) padHorn = true;
        if (pad.buttons[9]?.pressed) held.add("Escape");
      }
    }

    if (this.injectedSteer !== null) {
      // +1 = player-visible left = negative x
      steer = -this.injectedSteer;
    }

    steer = Math.max(-1, Math.min(1, steer));
    throttle = Math.max(0, Math.min(1, throttle));
    brake = Math.max(0, Math.min(1, brake));

    const hornHeld = held.has("Space") || held.has("KeyH") || this.touchHorn || padHorn;
    const hornPressed = hornHeld && !this.prevHorn;
    this.prevHorn = hornHeld;

    const pauseHeld = held.has("Escape") || held.has("KeyP");
    const pausePressed = pauseHeld && !this.prevPause;
    this.prevPause = pauseHeld;

    return { steer, throttle, brake, horn: hornHeld, hornPressed, pausePressed };
  }
}
