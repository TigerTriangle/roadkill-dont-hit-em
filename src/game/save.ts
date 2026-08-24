import { SAVE_KEY, SAVE_VERSION } from "./constants";

export type SaveData = {
  version: number;
  highScore: number;
  muted: boolean;
  tutorialDone: boolean;
};

const defaults: SaveData = { version: SAVE_VERSION, highScore: 0, muted: false, tutorialDone: false };

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      version: SAVE_VERSION,
      highScore: Number(parsed.highScore) || 0,
      muted: Boolean(parsed.muted),
      tutorialDone: Boolean(parsed.tutorialDone),
    };
  } catch {
    return { ...defaults };
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch {
    /* private mode / quota */
  }
}
