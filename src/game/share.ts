import type { HudSnap, RunStats } from "@/game/types";
import { formatMiles } from "@/game/constants";

export const GAME_URL = "https://roadkill.grok.me";

export function overTitle(reason: HudSnap["overReason"]) {
  if (reason === "gas") return "Out of gas";
  if (reason === "raccoon") return "It got in";
  return "Totaled";
}

export function overImage(reason: HudSnap["overReason"]) {
  if (reason === "crash") return "/wreck.jpg";
  if (reason === "raccoon") return "/raccoon-cab.jpg";
  if (reason === "gas") return "/walk-gas.jpg";
  return null;
}

export function shareText(
  score: number,
  level: number,
  distance: number,
  reason: HudSnap["overReason"],
  stats: RunStats,
) {
  const hits = (["deer", "raccoon", "possum", "turkey"] as const)
    .map((k) => {
      const h = stats.hits[k];
      if (!h.body && !h.steel) return null;
      const name = k[0].toUpperCase() + k.slice(1);
      return `${name} ${h.body}(${h.steel})`;
    })
    .filter(Boolean)
    .join(" · ");
  const picks = (["coffee", "horseshoe", "tire", "gas"] as const)
    .map((k) => (stats.pickups[k] ? `${k} ${stats.pickups[k]}` : null))
    .filter(Boolean)
    .join(" · ");
  const lines = [
    "Roadkill: Don't Hit 'Em",
    `${overTitle(reason)} · ${score} pts · Night ${level} · ${formatMiles(distance)} mi`,
  ];
  if (hits) lines.push(`Hits: ${hits}`);
  if (picks) lines.push(`Loot: ${picks}`);
  lines.push(`Play: ${GAME_URL}`);
  return lines.join("\n");
}

async function loadImageEl(src: string) {
  if (typeof document !== "undefined" && "fonts" in document) {
    await document.fonts.ready.catch(() => undefined);
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

export async function buildBadgeBlob(
  imageSrc: string | null,
  title: string,
  score: number,
  level: number,
  distance: number,
): Promise<Blob | null> {
  try {
    const W = 1200;
    const H = 675;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, W, H);
    if (imageSrc) {
      const img = await loadImageEl(imageSrc);
      const scale = Math.max(W / img.width, H / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    const g = ctx.createLinearGradient(0, H * 0.42, 0, H);
    g.addColorStop(0, "rgba(11,16,32,0)");
    g.addColorStop(0.5, "rgba(11,16,32,0.55)");
    g.addColorStop(1, "rgba(11,16,32,0.94)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#f3e6c8";
    ctx.beginPath();
    ctx.moveTo(W - 248, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, 52);
    ctx.lineTo(W - 210, 52);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0b1020";
    ctx.font = "600 22px Teko, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BADGE OF HONOR", W - 112, 27);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f3e6c8";
    ctx.font = "600 42px Teko, sans-serif";
    ctx.fillText("ROADKILL", 48, H - 118);
    ctx.fillStyle = "#9a917c";
    ctx.font = "600 24px Teko, sans-serif";
    ctx.fillText("DON'T HIT 'EM", 48, H - 84);
    ctx.fillStyle = "#f3e6c8";
    ctx.font = "600 52px Teko, sans-serif";
    ctx.fillText(title.toUpperCase(), 48, H - 28);

    ctx.textAlign = "right";
    ctx.font = "600 64px Teko, sans-serif";
    ctx.fillText(String(score), W - 48, H - 70);
    ctx.fillStyle = "#9a917c";
    ctx.font = "600 24px Teko, sans-serif";
    ctx.fillText(`NIGHT ${level}  ·  ${formatMiles(distance)} MI`, W - 48, H - 28);

    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88));
  } catch {
    return null;
  }
}

export async function shareDrive(opts: {
  score: number;
  level: number;
  distance: number;
  reason: HudSnap["overReason"];
  stats: RunStats;
}): Promise<"shared" | "copied" | "failed"> {
  const title = overTitle(opts.reason);
  const text = shareText(opts.score, opts.level, opts.distance, opts.reason, opts.stats);
  const imgSrc = overImage(opts.reason);
  const blob = await buildBadgeBlob(imgSrc, title, opts.score, opts.level, opts.distance);
  const file = blob ? new File([blob], "roadkill-badge.jpg", { type: "image/jpeg" }) : null;

  if (typeof navigator.share === "function") {
    if (file) {
      const withFiles = { title: "Roadkill: Don't Hit 'Em", text, files: [file] };
      try {
        if (!navigator.canShare || navigator.canShare(withFiles)) {
          await navigator.share(withFiles);
          return "shared";
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return "failed";
      }
    }
    try {
      await navigator.share({ title: "Roadkill: Don't Hit 'Em", text, url: GAME_URL });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "failed";
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
