export const VW = 480;
export const VH = 800;
export const STEP = 1 / 60;
export const MAX_FRAME_DT = 0.1;

export const PLAYER_SCREEN_Y = 630;
export const ROAD_HALF = 108;
export const LANE = 44;
export const SHOULDER = 168;

export const BASE_SPEED = 230;
export const MAX_SPEED = 470;
export const SPEED_TO_MPH = 0.22;
export const STEER_SPEED = 320;
export const STEER_ACCEL = 1400;
export const PLAYER_DRAG = 8;
export const BRAKE_DECEL = 440;
export const STOP_EPS = 8;
export const THROTTLE_BONUS = 80;

export const PLAYER_HW = 20;
export const PLAYER_HH = 30;
export const HIT_DAMAGE = 0.25;
export const MAX_DAMAGE = 1;
export const WRECK_TIME = 1.2;
export const IDLE_GRACE = 0;
export const IDLE_CREEP = 2.15;
export const IDLE_LUNGE = 0.55;
export const INVULN_TIME = 1.45;
export const SHIELD_TIME = 6;
export const STEEL_WARN = 1;
export const HORN_COOLDOWN = 1.8;
export const HORN_RANGE = 260;

export const MAX_GAS = 1;
export const START_GAS = 0.72;
export const GAS_CAN_FILL = 0.4;
export const GAS_BURN_IDLE = 0.0035;
export const GAS_BURN_MOVE = 0.022;
export const GAS_BURN_THROTTLE = 0.01;
export const GAS_WARN = 0.2;
export const GAS_FORCE_GAP = 2200;

export const HORSESHOE_RATE = 0.07;

export type LevelDef = {
  id: number;
  name: string;
  until: number;
  cruise: number;
  maxSpeed: number;
  spawnGap: number;
  empty: number;
  pickup: number;
  freeze: number;
  double: number;
  gasForce: number;
  walk: number;
};

const T = 3800;

export const LEVELS: LevelDef[] = [
  { id: 0, name: "Lesson", until: T, cruise: 150, maxSpeed: 190, spawnGap: 480, empty: 1, pickup: 0, freeze: 0, double: 0, gasForce: 99999, walk: 0.7 },
  { id: 1, name: "Back road", until: T + 5000, cruise: 185, maxSpeed: 260, spawnGap: 310, empty: 0.2, pickup: 0.4, freeze: 0.1, double: 0, gasForce: 1500, walk: 0.82 },
  { id: 2, name: "Farm road", until: T + 12000, cruise: 215, maxSpeed: 320, spawnGap: 255, empty: 0.1, pickup: 0.32, freeze: 0.14, double: 0.06, gasForce: 1800, walk: 0.9 },
  { id: 3, name: "County line", until: T + 22000, cruise: 245, maxSpeed: 370, spawnGap: 215, empty: 0.04, pickup: 0.24, freeze: 0.18, double: 0.12, gasForce: 2100, walk: 0.98 },
  { id: 4, name: "State route", until: T + 36000, cruise: 280, maxSpeed: 410, spawnGap: 185, empty: 0, pickup: 0.18, freeze: 0.22, double: 0.18, gasForce: 2400, walk: 1.06 },
  { id: 5, name: "Interstate", until: T + 54000, cruise: 320, maxSpeed: 450, spawnGap: 160, empty: 0, pickup: 0.13, freeze: 0.26, double: 0.24, gasForce: 2700, walk: 1.12 },
  { id: 6, name: "Graveyard", until: Infinity, cruise: 360, maxSpeed: 490, spawnGap: 140, empty: 0, pickup: 0.1, freeze: 0.3, double: 0.32, gasForce: 3000, walk: 1.18 },
];

export type TutorialBeat = {
  y: number;
  prompt: string;
  spawn?: { kind: "gas" | "coffee" | "tire" | "cross" | "freeze"; lane?: number; from?: 1 | -1 };
};

export const TUTORIAL_BEATS: TutorialBeat[] = [
  { y: 40, prompt: "Steer — A / D" },
  { y: 720, prompt: "Siphon a can", spawn: { kind: "gas", lane: 1 } },
  { y: 1320, prompt: "Miss the animal", spawn: { kind: "cross", from: -1 } },
  { y: 1920, prompt: "Honk — Space", spawn: { kind: "freeze", lane: -1 } },
  { y: 2520, prompt: "Coffee steels you", spawn: { kind: "coffee", lane: 1 } },
  { y: 3100, prompt: "A spare patches the body", spawn: { kind: "tire", lane: -1 } },
  { y: 3520, prompt: "Night 1 ahead" },
];

export function levelAt(y: number): LevelDef {
  for (const level of LEVELS) {
    if (y < level.until) return level;
  }
  return LEVELS[LEVELS.length - 1];
}

export function worldMiles(y: number) {
  return (Math.max(0, y) * SPEED_TO_MPH) / 3600;
}

export function formatMiles(mi: number) {
  return mi.toFixed(1);
}

export const SAVE_KEY = "roadkill-save-v1";
export const SAVE_VERSION = 1;

export const MIX_DEFAULT = {
  horn: 0.48,
  sfx: 0.75,
  music: 0.32,
  engine: 0.65,
} as const;

export type MixKey = keyof typeof MIX_DEFAULT;

export const ANIMAL = {
  deer: { hw: 30, hh: 24, walk: 78, freezeChance: 0.62, drawW: 92, drawH: 78 },
  raccoon: { hw: 18, hh: 12, walk: 120, freezeChance: 0.08, drawW: 48, drawH: 34 },
  possum: { hw: 20, hh: 12, walk: 52, freezeChance: 0.12, drawW: 54, drawH: 32 },
  turkey: { hw: 20, hh: 16, walk: 88, freezeChance: 0.1, drawW: 56, drawH: 48 },
} as const;

export const PICKUP_DRAW = 44;
export const PICKUP_R = 18;
