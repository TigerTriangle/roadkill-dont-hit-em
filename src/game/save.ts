import { MIX_DEFAULT, SAVE_KEY, SAVE_VERSION } from "./constants";

export type Mix = {
  horn: number;
  sfx: number;
  music: number;
  engine: number;
};

export type SaveData = {
  version: number;
  highScore: number;
  muted: boolean;
  tutorialDone: boolean;
  mix: Mix;
};

function clampMix(n: unknown, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(1, v));
}

const defaults: SaveData = {
  version: SAVE_VERSION,
  highScore: 0,
  muted: false,
  tutorialDone: false,
  mix: { ...MIX_DEFAULT },
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...defaults, mix: { ...MIX_DEFAULT } };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const horn = clampMix(parsed.mix?.horn, MIX_DEFAULT.horn);
    const music = clampMix(parsed.mix?.music, MIX_DEFAULT.music);
    const oldFactory =
      (horn === 0.48 && music === 0.32) || (horn === 0.18 && music === 0.1);
    return {
      version: SAVE_VERSION,
      highScore: Number(parsed.highScore) || 0,
      muted: Boolean(parsed.muted),
      tutorialDone: Boolean(parsed.tutorialDone),
      mix: {
        horn: oldFactory ? MIX_DEFAULT.horn : horn,
        sfx: clampMix(parsed.mix?.sfx, MIX_DEFAULT.sfx),
        music: oldFactory ? MIX_DEFAULT.music : music,
        engine: clampMix(parsed.mix?.engine, MIX_DEFAULT.engine),
      },
    };
  } catch {
    return { ...defaults, mix: { ...MIX_DEFAULT } };
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch {
    /* private mode / quota */
  }
}
