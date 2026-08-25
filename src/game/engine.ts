import {
  ANIMAL,
  BASE_SPEED,
  BRAKE_DECEL,
  GAS_BURN_IDLE,
  GAS_BURN_MOVE,
  GAS_BURN_THROTTLE,
  GAS_CAN_FILL,
  GAS_WARN,
  HIT_DAMAGE,
  HORN_COOLDOWN,
  HORN_RANGE,
  HORSESHOE_RATE,
  IDLE_CREEP,
  IDLE_GRACE,
  IDLE_LUNGE,
  INVULN_TIME,
  LANE,
  LEVELS,
  type LevelDef,
  levelAt,
  MAX_DAMAGE,
  MAX_FRAME_DT,
  MAX_GAS,
  MIX_DEFAULT,
  type MixKey,
  PICKUP_R,
  PLAYER_DRAG,
  PLAYER_HH,
  PLAYER_HW,
  POTHOLE_HH,
  POTHOLE_HW,
  potholeGap,
  ROAD_HALF,
  SAVE_VERSION,
  SHIELD_TIME,
  START_GAS,
  STEEL_WARN,
  STEER_ACCEL,
  STEER_SPEED,
  STEP,
  STOP_EPS,
  SPEED_TO_MPH,
  THROTTLE_BONUS,
  TUTORIAL_BEATS,
  WRECK_TIME,
  worldMiles,
} from "./constants";
import { GameAudio } from "./audio";
import { Input } from "./input";
import { loadSave, writeSave, type Mix } from "./save";
import type {
  Ambush,
  Animal,
  AnimalKind,
  Floater,
  HudSnap,
  Mode,
  Particle,
  Pickup,
  PickupKind,
  Player,
  Pothole,
  RunStats,
  Scenery,
} from "./types";
import { emptyRun } from "./types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function aabb(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
) {
  return ax - aw < bx + bw && ax + aw > bx - bw && ay - ah < by + bh && ay + ah > by - bh;
}

function toMph(speed: number) {
  return Math.round(speed * SPEED_TO_MPH);
}

export class Sim {
  mode: Mode = "boot";
  player: Player = this.freshPlayer();
  animals: Animal[] = [];
  pickups: Pickup[] = [];
  potholes: Pothole[] = [];
  scenery: Scenery[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  score = 0;
  combo = 0;
  high = 0;
  newBest = false;
  shake = 0;
  hitstop = 0;
  flash = 0;
  time = 0;
  rng = mulberry32(1);
  nextSpawnY = 180;
  nextPropY = 40;
  nextPotholeY = 1400;
  nextId = 1;
  lastGasY = -400;
  overReason: "crash" | "gas" | "raccoon" | null = null;
  level: LevelDef = LEVELS[0];
  tutorialDone = false;
  ambush: Ambush | null = null;
  private dryNotified = false;
  private wreckT = 0;
  private idleT = 0;
  private ambushKillT = 0;
  private snarlT = 0;
  private levelFlash = 0;
  private hint = "";
  private tutorialSpawned = new Set<number>();
  acc = 0;
  input = new Input();
  audio = new GameAudio();
  muted = false;
  mix: Mix = { ...MIX_DEFAULT };
  stats: RunStats = emptyRun();
  onHud?: (h: HudSnap) => void;
  private lastHud = "";
  private attractSteer = 0;
  private pendingHorn = false;
  private pendingPause = false;

  constructor() {
    const save = loadSave();
    this.high = save.highScore;
    this.muted = save.muted;
    this.tutorialDone = save.tutorialDone;
    this.mix = { ...save.mix };
    this.audio.setMuted(this.muted);
    this.audio.setMix(this.mix);
  }

  private freshPlayer(): Player {
    return {
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      vx: 0,
      speed: LEVELS[0].cruise * 0.55,
      damage: 0,
      invuln: 0,
      hornCd: 0,
      hornFlash: 0,
      bounce: 0,
      gas: START_GAS,
      steel: false,
    };
  }

  attach() {
    this.input.attach();
    this.input.onGesture = () => this.audio.unlock();
    this.installProbe();
    this.resetWorld(true);
    this.mode = "title";
    this.emit();
  }

  detach() {
    this.input.detach();
    this.audio.destroy();
    if (typeof window !== "undefined") delete window.__controlsTest;
  }

  private installProbe() {
    if (typeof window === "undefined") return;
    window.__controlsTest = {
      getX: () => this.player.x,
      getYaw: () => -this.player.x,
      getSpeed: () => this.player.speed,
      getHornFlash: () => this.player.hornFlash,
      getGas: () => this.player.gas,
      setGas: (v: number) => {
        this.player.gas = Math.max(0, Math.min(1, v));
      },
      getDamage: () => this.player.damage,
      setDamage: (v: number) => {
        this.player.damage = clamp(v, 0, MAX_DAMAGE);
        if (this.player.damage >= MAX_DAMAGE && this.mode === "play" && this.wreckT <= 0) {
          this.beginWreck();
        }
      },
      getInvuln: () => this.player.invuln,
      setInvuln: (v: number) => {
        this.player.invuln = Math.max(0, v);
        this.player.steel = v > INVULN_TIME;
      },
      getLevel: () => this.level.id,
      setLevel: (n: number) => {
        const idx = LEVELS.findIndex((l) => l.id === Math.round(n));
        const i = idx < 0 ? 0 : idx;
        const prevUntil = i === 0 ? 0 : LEVELS[i - 1].until;
        this.player.y = prevUntil + 40;
        this.syncLevel(true);
      },
      skipLesson: () => this.skipLesson(false),
      getAmbush: () => (this.ambush ? (this.ambush.phase === "lunge" ? 2 : 1) : 0),
      getPotholes: () => this.potholes.filter((h) => h.alive).length,
      setSteer: (v: number) => {
        this.input.injectedSteer = v;
      },
      setKeys: (codes: string[]) => {
        this.input.injectedKeys = codes;
      },
    };
  }

  toggleMute() {
    this.muted = !this.muted;
    this.audio.setMuted(this.muted);
    this.persist();
    this.emit();
  }

  setMix(key: MixKey, value: number) {
    const v = Math.max(0, Math.min(1, value));
    this.mix = { ...this.mix, [key]: v };
    this.audio.setMix(this.mix);
    this.persist();
    this.emit();
  }

  drive(lesson = false) {
    this.audio.unlock();
    this.resetWorld(false);
    this.mode = "play";
    if (lesson) this.levelFlash = 1.6;
    else this.skipLesson(true);
    this.emit();
  }

  skipLesson(quiet = false) {
    const end = LEVELS[0].until + 40;
    this.player.y = end;
    this.player.py = end;
    this.nextSpawnY = end + 260;
    this.nextPotholeY = end + 1400;
    this.lastGasY = end;
    this.tutorialSpawned.clear();
    this.hint = "";
    if (!this.tutorialDone) {
      this.tutorialDone = true;
      this.persist();
    }
    this.syncLevel(quiet);
    this.emit();
  }

  private persist() {
    writeSave({
      version: SAVE_VERSION,
      highScore: this.high,
      muted: this.muted,
      tutorialDone: this.tutorialDone,
      mix: this.mix,
    });
  }

  resume() {
    if (this.mode === "pause") this.mode = "play";
    this.audio.resume();
    this.emit();
  }

  pause() {
    if (this.mode === "play") this.mode = "pause";
    this.audio.setHorn(false);
    this.emit();
  }

  toTitle() {
    this.resetWorld(true);
    this.mode = "title";
    this.audio.setHorn(false);
    this.emit();
  }

  private resetWorld(attract: boolean) {
    this.rng = mulberry32((Math.random() * 0xffffffff) >>> 0);
    this.player = this.freshPlayer();
    this.animals = [];
    this.pickups = [];
    this.potholes = [];
    this.scenery = [];
    this.particles = [];
    this.floaters = [];
    this.score = 0;
    this.combo = 0;
    this.newBest = false;
    this.stats = emptyRun();
    this.shake = 0;
    this.hitstop = 0;
    this.flash = 0;
    this.time = 0;
    this.nextSpawnY = attract ? 80 : 280;
    this.nextPropY = 20;
    this.nextPotholeY = attract ? 1e9 : 99999;
    this.nextId = 1;
    this.lastGasY = attract ? 99999 : -400;
    this.overReason = null;
    this.dryNotified = false;
    this.wreckT = 0;
    this.idleT = 0;
    this.ambushKillT = 0;
    this.snarlT = 0;
    this.ambush = null;
    this.level = LEVELS[0];
    this.levelFlash = 0;
    this.hint = "";
    this.tutorialSpawned.clear();
    this.pendingHorn = false;
    this.pendingPause = false;
    for (let i = 0; i < 28; i++) this.spawnProp(this.nextPropY + i * 70);
    this.nextPropY = 20 + 28 * 70;
    if (attract) {
      this.player.speed = BASE_SPEED * 0.7;
      this.seedAttract();
    }
  }

  private seedAttract() {
    this.spawnCross(220, "deer", this.rng() < 0.5 ? -1 : 1);
    this.spawnFreeze(420, this.rng() < 0.5 ? -1 : 1);
    this.spawnCross(640, "raccoon", -1);
  }

  tick(dt: number) {
    const capped = Math.min(dt, MAX_FRAME_DT);
    const actions = this.input.poll();
    if (actions.hornPressed) this.pendingHorn = true;
    if (actions.pausePressed) this.pendingPause = true;

    this.audio.setHorn(this.mode === "play" && actions.horn);

    if (this.mode === "play" && this.pendingPause) {
      this.pendingPause = false;
      this.pause();
    } else if (this.mode === "pause" && this.pendingPause) {
      this.pendingPause = false;
      this.resume();
    }

    if (this.mode === "play" && this.pendingHorn) {
      this.pendingHorn = false;
      this.blowHorn();
    }

    this.acc += capped;
    const playing = this.mode === "play" || this.mode === "title";
    while (this.acc >= STEP) {
      if (this.hitstop > 0) {
        this.hitstop -= STEP;
      } else if (playing) {
        this.step(STEP, actions);
      }
      this.acc -= STEP;
    }
    this.audio.setSteel(this.mode === "play" && this.player.steel && this.player.invuln > STEEL_WARN);
    this.audio.setEngine(this.player.speed, this.mode === "play" || this.mode === "title", this.player.gas);
    this.emit();
  }

  private emit() {
    const snap: HudSnap = {
      mode: this.mode,
      score: Math.floor(this.score),
      distance: worldMiles(this.player.y),
      high: this.high,
      horn: this.player.hornFlash > 0.05 ? 1 : 0,
      shield: this.player.steel && this.player.invuln > STEEL_WARN ? 1 : 0,
      muted: this.muted,
      combo: this.combo,
      newBest: this.newBest,
      speed: toMph(this.player.speed),
      stopped: this.mode === "play" && this.player.speed <= STOP_EPS,
      gas: this.player.gas,
      lowFuel: this.mode === "play" && this.player.gas <= GAS_WARN && this.player.gas > 0,
      damage: this.player.damage,
      wrecking: this.wreckT > 0,
      level: this.level.id,
      levelName: this.level.name,
      levelFlash: this.levelFlash > 0.05 ? 1 : 0,
      hint: this.mode === "play" ? this.hint : "",
      tutorial: this.mode === "play" && this.level.id === 0,
      tutorialDone: this.tutorialDone,
      overReason: this.overReason,
      ambush: this.ambush ? (this.ambush.phase === "lunge" ? 2 : 1) : 0,
      mix: this.mix,
      stats: this.stats,
    };
    const key = JSON.stringify(snap);
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.onHud?.(snap);
  }

  private step(dt: number, actions: ReturnType<Input["poll"]>) {
    this.time += dt;
    const p = this.player;
    p.px = p.x;
    p.py = p.y;

    if (this.mode === "title") {
      this.attractSteerTowardGap(dt);
    } else {
      const targetVx = actions.steer * STEER_SPEED;
      p.vx += (targetVx - p.vx) * Math.min(1, STEER_ACCEL * dt * 0.002);
      if (Math.abs(actions.steer) < 0.05) p.vx *= Math.exp(-PLAYER_DRAG * dt);
    }

    p.x += p.vx * dt;
    const maxX = ROAD_HALF - 12;
    if (p.x > maxX) {
      p.x = maxX;
      p.vx = 0;
    }
    if (p.x < -maxX) {
      p.x = -maxX;
      p.vx = 0;
    }

    const cruise = this.level.cruise;
    const wrecking = this.mode === "play" && this.wreckT > 0;
    const dry = this.mode === "play" && p.gas <= 0 && !wrecking;
    if (wrecking || dry) {
      p.speed = Math.max(0, p.speed - 340 * dt);
      if (p.speed < STOP_EPS) p.speed = 0;
    } else if (this.mode === "play" && actions.brake > 0) {
      p.speed = Math.max(0, p.speed - BRAKE_DECEL * actions.brake * dt);
      if (p.speed < STOP_EPS) p.speed = 0;
    } else {
      let desired = cruise;
      if (this.mode === "play") desired += actions.throttle * THROTTLE_BONUS;
      desired = clamp(desired, 0, this.level.maxSpeed + THROTTLE_BONUS);
      p.speed += (desired - p.speed) * (1 - Math.exp(-3.2 * dt));
    }
    if (this.mode === "play" && !wrecking && this.level.id !== 0) {
      const speedFactor = p.speed / BASE_SPEED;
      let burn = GAS_BURN_IDLE + Math.max(0, speedFactor) * GAS_BURN_MOVE;
      if (!dry && actions.throttle > 0) burn += GAS_BURN_THROTTLE * actions.throttle;
      p.gas = clamp(p.gas - burn * dt, 0, MAX_GAS);
      if (p.gas <= 0) {
        if (!this.dryNotified) {
          this.dryNotified = true;
          this.floaters.push({ x: p.x, y: p.y + 70, text: "OUT OF GAS", life: 1.1 });
        }
        if (p.speed <= STOP_EPS && !this.overReason) {
          this.gameOver("gas");
          return;
        }
      } else {
        this.dryNotified = false;
      }
    }
    p.y += p.speed * dt;
    if (this.mode === "play") this.syncLevel();
    if (p.speed > STOP_EPS) p.bounce += dt * (6 + p.speed * 0.02);
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.invuln <= 0) p.steel = false;
    p.hornCd = Math.max(0, p.hornCd - dt);
    p.hornFlash = Math.max(0, p.hornFlash - dt);
    this.levelFlash = Math.max(0, this.levelFlash - dt);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.flash = Math.max(0, this.flash - dt * 4);

    if (wrecking) {
      this.wreckT -= dt;
      this.puffSmoke(3);
      if (this.wreckT <= 0) {
        this.gameOver("crash");
        return;
      }
    }

    if (this.mode === "play" && !wrecking && this.level.id !== 0 && p.gas > 0 && !this.overReason) {
      this.updateAmbush(dt);
      if (this.mode !== "play") return;
    }

    this.spawnAhead();
    this.spawnPotholes();
    this.spawnProps();
    this.updateAnimals(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateFloaters(dt);

    if (this.mode === "play" && !wrecking) {
      this.score += p.speed * dt * 0.12;
      this.collide();
    }

    this.scenery = this.scenery.filter((s) => s.y > p.y - 140 && s.alive);
    this.animals = this.animals.filter((a) => a.alive && a.y > p.y - 120);
    this.pickups = this.pickups.filter((k) => k.alive && k.y > p.y - 80);
    this.potholes = this.potholes.filter((h) => h.alive && h.y > p.y - 80);
  }

  private attractSteerTowardGap(dt: number) {
    const p = this.player;
    let threatX = 0;
    let best = 9999;
    for (const a of this.animals) {
      const dy = a.y - p.y;
      if (dy < 20 || dy > 280) continue;
      const danger = Math.abs(a.x - p.x) + dy * 0.2;
      if (danger < best) {
        best = danger;
        threatX = a.x;
      }
    }
    const want = clamp(-threatX * 0.04 - p.x * 0.3, -1, 1);
    this.attractSteer += (want - this.attractSteer) * (1 - Math.exp(-4 * dt));
    p.vx = this.attractSteer * STEER_SPEED * 0.7;
  }

  private spawnAhead() {
    const p = this.player;
    const look = p.y + p.speed * 1.85 + 220;
    if (this.mode === "play" && this.level.id === 0) {
      this.runTutorial(look);
      return;
    }
    while (this.nextSpawnY < look) {
      this.placePattern(this.nextSpawnY);
      const gap = this.level.spawnGap + this.rng() * 80 + p.speed * 0.1;
      this.nextSpawnY += gap;
    }
  }

  private runTutorial(look: number) {
    const p = this.player;
    for (let i = 0; i < TUTORIAL_BEATS.length; i++) {
      const beat = TUTORIAL_BEATS[i];
      if (this.tutorialSpawned.has(i)) continue;
      if (look < beat.y) break;
      this.tutorialSpawned.add(i);
      const s = beat.spawn;
      if (!s) continue;
      if (s.kind === "gas" || s.kind === "coffee" || s.kind === "tire") {
        this.spawnPickup(beat.y, s.lane ?? 1, s.kind);
      } else if (s.kind === "cross") {
        this.spawnCross(beat.y, "possum", (s.from ?? -1) as 1 | -1);
      } else if (s.kind === "pothole") {
        this.spawnPothole(beat.y, s.lane ?? 1);
      } else {
        this.spawnFreeze(beat.y, s.lane ?? -1, 2.8);
      }
    }
    let prompt = TUTORIAL_BEATS[0]?.prompt ?? "";
    for (const beat of TUTORIAL_BEATS) {
      if (p.y + 90 >= beat.y) prompt = beat.prompt;
    }
    this.hint = prompt;
  }

  private lanesClear(y: number, lane: number) {
    for (const a of this.animals) {
      if (!a.alive) continue;
      if (Math.abs(a.y - y) < 110 && Math.abs(a.x - lane * LANE) < 50) return false;
    }
    return true;
  }

  private placePattern(y: number) {
    const L = this.level;
    const roll = this.rng();
    if (this.mode === "play" && y - this.lastGasY > L.gasForce) {
      this.spawnPickup(y, this.rng() < 0.5 ? -1 : 1, "gas");
      return;
    }
    if (this.mode === "play" && this.lastGasY < 0) {
      this.spawnPickup(y, this.rng() < 0.5 ? -1 : 1, "gas");
      return;
    }
    if (this.mode === "play" && roll < HORSESHOE_RATE) {
      this.spawnPickup(y, this.rng() < 0.5 ? -1 : 1, "horseshoe");
      return;
    }
    const rest = this.rng();
    if (rest < L.empty) return;
    if (rest < L.empty + L.pickup) {
      this.spawnPickup(y, this.rng() < 0.5 ? -1 : 1, this.pickHelpful());
      return;
    }
    const animalRoll = this.rng();
    if (animalRoll < L.freeze) {
      const lane = this.rng() < 0.5 ? -1 : 1;
      if (this.lanesClear(y, lane)) this.spawnFreeze(y, lane);
      else this.spawnCross(y, this.pickSpecies(), -lane as 1 | -1);
      return;
    }
    if (animalRoll < L.freeze + L.double) {
      const from = this.rng() < 0.5 ? -1 : 1;
      this.spawnCross(y, this.pickSpecies(), from as 1 | -1);
      this.spawnCross(y + 95, this.pickSpecies(), -from as 1 | -1);
      return;
    }
    this.spawnCross(y, this.pickSpecies(), this.rng() < 0.5 ? -1 : 1);
  }

  private pickSpecies(): AnimalKind {
    const id = this.level.id;
    const r = this.rng();
    if (id <= 2) {
      if (r < 0.35) return "deer";
      if (r < 0.7) return "possum";
      return "raccoon";
    }
    if (id <= 4) {
      if (r < 0.42) return "deer";
      if (r < 0.64) return "raccoon";
      if (r < 0.82) return "possum";
      return "turkey";
    }
    if (r < 0.48) return "deer";
    if (r < 0.68) return "turkey";
    if (r < 0.84) return "raccoon";
    return "possum";
  }

  private pickHelpful(): PickupKind {
    const r = this.rng();
    if (r < 0.46) return "gas";
    if (r < 0.76) return "coffee";
    return "tire";
  }

  private spawnCross(y: number, kind: AnimalKind, from: 1 | -1) {
    const def = ANIMAL[kind];
    const a: Animal = {
      id: this.nextId++,
      kind,
      x: from * (ROAD_HALF + 70 + this.rng() * 40),
      y,
      px: 0,
      py: y,
      vx: -from * def.walk * this.level.walk,
      facing: -from as 1 | -1,
      state: "cross",
      freezeT: 0,
      t: this.rng(),
      hw: def.hw,
      hh: def.hh,
      scored: false,
      alive: true,
    };
    a.px = a.x;
    this.animals.push(a);
  }

  private spawnFreeze(y: number, lane: number, hold?: number) {
    const def = ANIMAL.deer;
    const a: Animal = {
      id: this.nextId++,
      kind: "deer",
      x: lane * LANE + (this.rng() - 0.5) * 18,
      y,
      px: lane * LANE,
      py: y,
      vx: 0,
      facing: lane < 0 ? 1 : -1,
      state: "freeze",
      freezeT: hold ?? 1.15 + this.rng() * 1.1,
      t: this.rng(),
      hw: def.hw,
      hh: def.hh,
      scored: false,
      alive: true,
    };
    this.animals.push(a);
  }

  private spawnPickup(y: number, lane: number, kind: PickupKind) {
    this.pickups.push({
      id: this.nextId++,
      kind,
      x: lane * LANE,
      y,
      alive: true,
      t: this.rng() * Math.PI * 2,
    });
    if (kind === "gas") this.lastGasY = y;
  }

  private spawnPothole(y: number, lane: number) {
    const wobble = (this.rng() - 0.5) * 16;
    this.potholes.push({
      id: this.nextId++,
      x: lane * LANE + wobble,
      y,
      hw: POTHOLE_HW + this.rng() * 6,
      hh: POTHOLE_HH + this.rng() * 4,
      rot: (this.rng() - 0.5) * 0.5,
      alive: true,
    });
  }

  private spawnPotholes() {
    if (this.mode !== "play" || this.level.id === 0) return;
    const p = this.player;
    const look = p.y + p.speed * 1.85 + 220;
    while (this.nextPotholeY < look) {
      const y = this.nextPotholeY;
      const first = this.rng() < 0.5 ? 1 : -1;
      let placed = false;
      for (const lane of [first, -first]) {
        if (this.holeClear(y, lane)) {
          this.spawnPothole(y, lane);
          placed = true;
          break;
        }
      }
      this.nextPotholeY += placed
        ? potholeGap(this.level.id) * (0.82 + this.rng() * 0.45)
        : 140;
    }
  }

  private holeClear(y: number, lane: number) {
    const x = lane * LANE;
    for (const a of this.animals) {
      if (!a.alive) continue;
      if (Math.abs(a.y - y) < 90 && Math.abs(a.x - x) < 48) return false;
    }
    for (const k of this.pickups) {
      if (!k.alive) continue;
      if (Math.abs(k.y - y) < 70 && Math.abs(k.x - x) < 40) return false;
    }
    return true;
  }

  private spawnProp(y: number) {
    const side = this.rng() < 0.5 ? -1 : 1;
    const kindRoll = this.rng();
    const kind = kindRoll < 0.62 ? "pine" : kindRoll < 0.88 ? "oak" : "mailbox";
    const edge = kind === "mailbox" ? ROAD_HALF + 42 : ROAD_HALF + 72 + this.rng() * 90;
    this.scenery.push({
      id: this.nextId++,
      kind,
      x: side * edge,
      y,
      scale: 0.78 + this.rng() * 0.5,
      flip: this.rng() < 0.5,
      alive: true,
    });
  }

  private spawnProps() {
    const p = this.player;
    while (this.nextPropY < p.y + 780) {
      this.spawnProp(this.nextPropY);
      if (this.rng() < 0.45) this.spawnProp(this.nextPropY + 12);
      this.nextPropY += 48 + this.rng() * 36;
    }
  }

  private inLights(x: number, y: number) {
    const p = this.player;
    const dy = y - p.y;
    if (dy < 10 || dy > HORN_RANGE + 40) return false;
    const cone = 28 + dy * 0.42;
    return Math.abs(x - p.x) < cone;
  }

  private updateAnimals(dt: number) {
    const p = this.player;
    for (const a of this.animals) {
      if (!a.alive) continue;
      a.px = a.x;
      a.py = a.y;
      a.t += dt;
      if (a.state === "freeze") {
        a.freezeT -= dt;
        if (this.inLights(a.x, a.y) && a.kind === "deer") {
          /* hold the stare while lit */
        }
        if (a.freezeT <= 0) {
          a.state = "bolt";
          a.vx = a.facing * ANIMAL[a.kind].walk * 2.2 * this.level.walk;
        }
      } else {
        a.x += a.vx * dt;
        if (a.state === "cross" && a.kind === "deer" && this.inLights(a.x, a.y)) {
          if (this.rng() < ANIMAL.deer.freezeChance * dt * 2.4) {
            a.state = "freeze";
            a.vx = 0;
            a.freezeT = 0.9 + this.rng() * 0.8;
          }
        }
        if (Math.abs(a.x) > ROAD_HALF + 160) a.alive = false;
      }

      if (this.mode === "play" && !a.scored) {
        const dy = a.y - p.y;
        if (dy < -8 && Math.abs(a.x - p.x) < 58 && Math.abs(a.x) < ROAD_HALF) {
          a.scored = true;
          this.combo += 1;
          const pts = 40 + this.combo * 12;
          this.score += pts;
          this.stats = { ...this.stats, near: this.stats.near + 1 };
          this.floaters.push({ x: a.x, y: a.y, text: `NEAR +${pts}`, life: 0.8 });
        }
      }
    }
  }

  private updatePickups(dt: number) {
    const p = this.player;
    for (const k of this.pickups) {
      if (!k.alive) continue;
      k.t += dt;
      if (this.wreckT > 0) continue;
      if (aabb(p.x, p.y + 8, PLAYER_HW, PLAYER_HH, k.x, k.y, PICKUP_R, PICKUP_R)) {
        k.alive = false;
        this.collect(k);
      }
    }
  }

  private collect(k: Pickup) {
    this.audio.pickup();
    this.combo = 0;
    const p = this.player;
    this.stats = {
      ...this.stats,
      pickups: { ...this.stats.pickups, [k.kind]: this.stats.pickups[k.kind] + 1 },
    };
    if (k.kind === "coffee") {
      p.invuln = SHIELD_TIME;
      p.steel = true;
      this.score += 120;
      this.floaters.push({ x: k.x, y: k.y, text: "STEEL +120", life: 0.9 });
    } else if (k.kind === "horseshoe") {
      this.score += 250;
      this.floaters.push({ x: k.x, y: k.y, text: "LUCK +250", life: 0.9 });
    } else if (k.kind === "tire") {
      const patched = p.damage > 0;
      p.damage = Math.max(0, p.damage - HIT_DAMAGE);
      this.score += 80;
      this.floaters.push({
        x: k.x,
        y: k.y,
        text: patched ? "PATCH −25%" : "SPARE +80",
        life: 0.9,
      });
    } else {
      p.gas = clamp(p.gas + GAS_CAN_FILL, 0, MAX_GAS);
      this.dryNotified = false;
      this.score += 70;
      this.floaters.push({ x: k.x, y: k.y, text: "FUEL +70", life: 0.9 });
    }
    this.burst(k.x, k.y, "spark", 10);
  }

  private blowHorn() {
    const p = this.player;
    p.hornFlash = 0.45;
    this.stats = { ...this.stats, honks: this.stats.honks + 1 };
    this.floaters.push({ x: p.x, y: p.y + 70, text: "HONK", life: 0.55 });
    if (p.hornCd > 0) return;
    p.hornCd = HORN_COOLDOWN;
    let startled = 0;
    for (const a of this.animals) {
      if (!a.alive) continue;
      const dy = a.y - p.y;
      if (dy < 8 || dy > HORN_RANGE) continue;
      if (!this.inLights(a.x, a.y) && Math.abs(a.x - p.x) > 70) continue;
      a.state = "bolt";
      const dir = a.x >= p.x ? 1 : -1;
      a.facing = dir as 1 | -1;
      a.vx = dir * (ANIMAL[a.kind].walk * 2.6 * this.level.walk);
      a.freezeT = 0;
      startled++;
    }
    if (startled) {
      this.audio.startle();
      this.score += startled * 30;
      this.floaters.push({ x: p.x, y: p.y + 80, text: "GIT!", life: 0.6 });
    }
  }

  private collide() {
    const p = this.player;
    const shielded = p.invuln > 0;
    const py0 = Math.min(p.py, p.y);
    const py1 = Math.max(p.py, p.y) + PLAYER_HH;
    for (const a of this.animals) {
      if (!a.alive) continue;
      const hit = aabb(p.x, (py0 + py1) / 2, PLAYER_HW, (py1 - py0) / 2 + PLAYER_HH, a.x, a.y, a.hw, a.hh);
      if (!hit) continue;
      a.alive = false;
      this.combo = 0;
      const pair = this.stats.hits[a.kind];
      this.stats = {
        ...this.stats,
        hits: {
          ...this.stats.hits,
          [a.kind]: {
            body: pair.body + (p.steel || shielded ? 0 : 1),
            steel: pair.steel + (p.steel ? 1 : 0),
          },
        },
      };
      if (p.steel) {
        this.burst(a.x, a.y, "spark", 20);
        this.audio.clang();
        this.shake = Math.min(1, this.shake + 0.16);
        this.hitstop = 0.02;
        this.score += 60;
        this.floaters.push({ x: a.x, y: a.y, text: "NO DENT +60", life: 0.7 });
        return;
      }
      this.burst(a.x, a.y, "dust", 18);
      this.burst(a.x, a.y, "leaf", 8);
      this.audio.thud();
      if (shielded) {
        this.shake = Math.min(1, this.shake + 0.28);
        this.hitstop = 0.03;
        this.score += 60;
        this.floaters.push({ x: a.x, y: a.y, text: "CLEAR +60", life: 0.65 });
        return;
      }
      this.applyDent(a.x, a.y);
      return;
    }
    for (const hole of this.potholes) {
      if (!hole.alive) continue;
      const hit = aabb(p.x, (py0 + py1) / 2, PLAYER_HW, (py1 - py0) / 2 + PLAYER_HH, hole.x, hole.y, hole.hw, hole.hh);
      if (!hit) continue;
      hole.alive = false;
      this.combo = 0;
      this.stats = {
        ...this.stats,
        potholes: {
          body: this.stats.potholes.body + (p.steel || shielded ? 0 : 1),
          steel: this.stats.potholes.steel + (p.steel ? 1 : 0),
        },
      };
      if (p.steel) {
        this.burst(hole.x, hole.y, "spark", 14);
        this.audio.clang();
        this.shake = Math.min(1, this.shake + 0.16);
        this.hitstop = 0.02;
        this.score += 60;
        this.floaters.push({ x: hole.x, y: hole.y, text: "NO DENT +60", life: 0.7 });
        return;
      }
      this.burst(hole.x, hole.y, "dust", 16);
      this.audio.thud();
      if (shielded) {
        this.shake = Math.min(1, this.shake + 0.28);
        this.hitstop = 0.03;
        this.score += 60;
        this.floaters.push({ x: hole.x, y: hole.y, text: "CLEAR +60", life: 0.65 });
        return;
      }
      this.applyDent(hole.x, hole.y);
      return;
    }
  }

  private applyDent(x: number, y: number) {
    const p = this.player;
    this.shake = Math.min(1, this.shake + 0.55);
    this.hitstop = 0.07;
    this.flash = 0.16;
    p.damage = clamp(p.damage + HIT_DAMAGE, 0, MAX_DAMAGE);
    p.invuln = INVULN_TIME;
    p.speed *= 0.62;
    this.floaters.push({ x, y, text: "HIT +25%", life: 0.7 });
    if (p.damage >= MAX_DAMAGE) {
      if (this.level.id === 0) p.damage = 0.75;
      else this.beginWreck();
    }
  }

  private syncLevel(quiet = false) {
    const next = levelAt(this.player.y);
    if (next.id === this.level.id) return;
    const fromLesson = this.level.id === 0;
    this.level = next;
    this.hint = next.id === 0 ? this.hint : "";
    if (fromLesson && next.id > 0 && !this.tutorialDone) {
      this.tutorialDone = true;
      this.persist();
    }
    if (fromLesson && next.id > 0) {
      this.nextPotholeY = Math.max(this.nextPotholeY, this.player.y + 1400);
    }
    if (quiet || this.mode !== "play") return;
    this.levelFlash = 1.7;
    this.score += 40 * Math.max(1, next.id);
    this.floaters.push({
      x: this.player.x,
      y: this.player.y + 70,
      text: next.id === 0 ? "LESSON" : `NIGHT ${next.id}`,
      life: 1.1,
    });
  }

  private updateAmbush(dt: number) {
    const p = this.player;
    if (this.ambush?.phase === "lunge") {
      this.ambush.x = p.x;
      this.ambush.y = p.y + 12;
      this.ambush.t += dt;
      this.ambushKillT -= dt;
      if (this.ambushKillT <= 0) this.gameOver("raccoon");
      return;
    }
    if (p.speed > STOP_EPS) {
      this.idleT = 0;
      this.snarlT = 0;
      this.ambush = null;
      return;
    }
    this.idleT += dt;
    if (this.idleT < IDLE_GRACE) return;
    if (!this.ambush) {
      const side = p.x >= 0 ? 1 : -1;
      const x = side * (ROAD_HALF + 58);
      this.ambush = { x, y: p.y - 8, fromX: x, t: 0, phase: "creep" };
      this.audio.snarl(0.55);
      this.snarlT = 0.7;
    }
    const a = this.ambush;
    a.t += dt;
    a.y = p.y - 6;
    const u = Math.min(1, (this.idleT - IDLE_GRACE) / IDLE_CREEP);
    const e = u * 0.72 + u * u * 0.28;
    a.x = a.fromX + (p.x - a.fromX) * e;
    this.snarlT -= dt;
    if (this.snarlT <= 0 && a.phase === "creep") {
      this.audio.snarl(0.45 + u * 0.4);
      this.snarlT = 0.72 - u * 0.22;
    }
    if (u >= 1) {
      a.phase = "lunge";
      a.x = p.x;
      a.y = p.y + 12;
      this.ambushKillT = IDLE_LUNGE;
      this.shake = 1;
      this.flash = 0.22;
      this.audio.snarl(1);
      this.audio.thud();
      this.floaters.push({ x: p.x, y: p.y + 54, text: "RABID", life: 0.9 });
    }
  }

  private beginWreck() {
    if (this.wreckT > 0 || this.mode !== "play" || this.level.id === 0) return;
    this.player.damage = MAX_DAMAGE;
    this.wreckT = WRECK_TIME;
    this.player.invuln = WRECK_TIME;
    this.player.steel = false;
    this.shake = 1;
    this.flash = 0.28;
    this.floaters.push({ x: this.player.x, y: this.player.y + 70, text: "TOTALED", life: 1.2 });
    this.puffSmoke(22);
  }

  private puffSmoke(n: number) {
    const p = this.player;
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: p.x + (this.rng() - 0.5) * 26,
        y: p.y + 8 + this.rng() * 18,
        vx: (this.rng() - 0.5) * 34,
        vy: 18 + this.rng() * 48,
        life: 0.5 + this.rng() * 0.75,
        max: 1.25,
        size: 10 + this.rng() * 18,
        kind: "smoke",
      });
    }
  }

  private gameOver(reason: "crash" | "gas" | "raccoon" = "crash") {
    this.mode = "over";
    this.overReason = reason;
    this.audio.setHorn(false);
    this.audio.over();
    const total = Math.floor(this.score);
    if (total > this.high) {
      this.high = total;
      this.newBest = true;
    }
    this.persist();
    this.emit();
  }

  burst(x: number, y: number, kind: Particle["kind"], n: number) {
    for (let i = 0; i < n; i++) {
      const ang = this.rng() * Math.PI * 2;
      const sp = 40 + this.rng() * 160;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp * 0.5 + (kind === "dust" ? -20 : 30),
        life: 0.3 + this.rng() * 0.45,
        max: 0.75,
        size: kind === "moth" ? 2 : 3 + this.rng() * 4,
        kind,
      });
    }
  }

  private updateParticles(dt: number) {
    const p = this.player;
    if (p.speed > STOP_EPS && this.rng() < 0.35) {
      this.particles.push({
        x: p.x + (this.rng() - 0.5) * 36,
        y: p.y + 20,
        vx: (this.rng() - 0.5) * 20,
        vy: -p.speed * 0.15,
        life: 0.35,
        max: 0.35,
        size: 2 + this.rng() * 3,
        kind: "dust",
      });
    }
    if (this.mode === "play" && p.damage > 0 && this.wreckT <= 0) {
      const rate = p.damage >= 0.75 ? 0.55 : p.damage >= 0.5 ? 0.3 : 0.12;
      if (this.rng() < rate) this.puffSmoke(1);
    }
    if (this.rng() < 0.12) {
      this.particles.push({
        x: p.x + (this.rng() - 0.5) * 50,
        y: p.y + 40 + this.rng() * 180,
        vx: (this.rng() - 0.5) * 30,
        vy: 10,
        life: 0.8,
        max: 0.8,
        size: 1.6,
        kind: "moth",
      });
    }
    for (const q of this.particles) {
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    if (this.particles.length > 280) this.particles.splice(0, this.particles.length - 280);
    this.particles = this.particles.filter((q) => q.life > 0);
  }

  private updateFloaters(dt: number) {
    for (const f of this.floaters) {
      f.life -= dt;
      f.y += 28 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }
}
