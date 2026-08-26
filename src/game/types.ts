export type Mode = "boot" | "title" | "play" | "pause" | "over";

export type AnimalKind = "deer" | "raccoon" | "possum" | "turkey";
export type PickupKind = "coffee" | "horseshoe" | "tire" | "gas";
export type PropKind =
  | "pine"
  | "oak"
  | "mailbox"
  | "shrub"
  | "cow"
  | "pig"
  | "corn"
  | "bale"
  | "deersign"
  | "datacenter"
  | "grave"
  | "scarecrow";

export type HitPair = { body: number; steel: number };

export type RunStats = {
  hits: Record<AnimalKind, HitPair>;
  potholes: HitPair;
  pickups: Record<PickupKind, number>;
  honks: number;
  near: number;
};

export function emptyRun(): RunStats {
  const hit = (): HitPair => ({ body: 0, steel: 0 });
  return {
    hits: { deer: hit(), raccoon: hit(), possum: hit(), turkey: hit() },
    potholes: hit(),
    pickups: { coffee: 0, horseshoe: 0, tire: 0, gas: 0 },
    honks: 0,
    near: 0,
  };
}

export type AnimalState = "cross" | "freeze" | "bolt";

export interface Animal {
  id: number;
  kind: AnimalKind;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  facing: 1 | -1;
  state: AnimalState;
  freezeT: number;
  t: number;
  hw: number;
  hh: number;
  scored: boolean;
  alive: boolean;
}

export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  alive: boolean;
  t: number;
}

export interface Pothole {
  id: number;
  x: number;
  y: number;
  hw: number;
  hh: number;
  rot: number;
  alive: boolean;
}

export interface Scenery {
  id: number;
  kind: PropKind;
  x: number;
  y: number;
  scale: number;
  flip: boolean;
  alive: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  kind: "dust" | "spark" | "moth" | "leaf" | "smoke";
}

export interface Ambush {
  x: number;
  y: number;
  fromX: number;
  t: number;
  phase: "creep" | "lunge";
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
}

export interface Player {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  speed: number;
  damage: number;
  invuln: number;
  hornCd: number;
  hornFlash: number;
  bounce: number;
  gas: number;
  steel: boolean;
}

export interface HudSnap {
  mode: Mode;
  score: number;
  distance: number;
  high: number;
  horn: number;
  shield: number;
  muted: boolean;
  combo: number;
  newBest: boolean;
  speed: number;
  stopped: boolean;
  gas: number;
  lowFuel: boolean;
  damage: number;
  wrecking: boolean;
  level: number;
  levelName: string;
  levelFlash: number;
  hint: string;
  tutorial: boolean;
  tutorialDone: boolean;
  overReason: "crash" | "gas" | "raccoon" | null;
  ambush: 0 | 1 | 2;
  mix: { horn: number; sfx: number; music: number; engine: number };
  stats: RunStats;
}

export type ControlsProbe = {
  getX: () => number;
  getYaw: () => number;
  getSpeed: () => number;
  getHornFlash?: () => number;
  getGas?: () => number;
  setGas?: (v: number) => void;
  getDamage?: () => number;
  setDamage?: (v: number) => void;
  getInvuln?: () => number;
  setInvuln?: (v: number) => void;
  getLevel?: () => number;
  setLevel?: (n: number) => void;
  skipLesson?: () => void;
  getAmbush?: () => number;
  getPotholes?: () => number;
  setSteer: (v: number) => void;
  setKeys: (codes: string[]) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}
