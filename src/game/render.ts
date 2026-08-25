import {
  ANIMAL,
  PICKUP_DRAW,
  PLAYER_SCREEN_Y,
  ROAD_HALF,
  STEEL_WARN,
  VH,
  VW,
} from "./constants";
import { drawFrame, type Atlas } from "./assets";
import type { Sim } from "./engine";

const ASPHALT = "#3a3f4c";
const ASPHALT2 = "#4a5160";
const LINE_YEL = "#f0d36a";
const LINE_WHT = "#efe8d8";
const GRASS = "#1a2a1c";
const GRASS2 = "#121c14";
const NIGHT = "#12182a";
const SKY = "#1a2438";

export class Renderer {
  private stars: { x: number; y: number; s: number }[] = [];
  private gravel: HTMLCanvasElement | null = null;
  private reduced = false;

  constructor() {
    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random() * 0.55,
        s: Math.random() * 1.4 + 0.3,
      });
    }
    if (typeof window !== "undefined") {
      this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  }

  private gravelPat() {
    if (this.gravel) return this.gravel;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d");
    if (!g) return c;
    g.fillStyle = "#2a261f";
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = `rgba(${40 + ((i * 13) % 50)},${36 + ((i * 7) % 30)},${28 + (i % 20)},0.55)`;
      g.fillRect((i * 17) % 64, (i * 29) % 64, 1 + (i % 2), 1);
    }
    this.gravel = c;
    return c;
  }

  draw(ctx: CanvasRenderingContext2D, sim: Sim, atlas: Atlas, cssW: number, cssH: number, dpr: number) {
    const w = cssW * dpr;
    const h = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = cssH / VH;
    const viewW = cssW / scale;
    ctx.save();
    ctx.scale(scale, scale);

    let shakeX = 0;
    let shakeY = 0;
    if (sim.shake > 0 && !this.reduced) {
      const mag = sim.shake * sim.shake * 14;
      shakeX = (Math.random() - 0.5) * mag;
      shakeY = (Math.random() - 0.5) * mag;
    }
    ctx.translate(shakeX, shakeY);

    const originX = viewW / 2;
    const camY = sim.player.y;
    const toS = (x: number, y: number) => ({
      sx: originX + x,
      sy: PLAYER_SCREEN_Y - (y - camY),
    });

    this.drawSky(ctx, viewW, VH);
    this.drawForest(ctx, sim, atlas, viewW, originX, camY);
    this.drawRoad(ctx, originX, camY, viewW);
    this.drawPickups(ctx, sim, atlas, toS);
    this.drawAnimals(ctx, sim, atlas, toS);
    this.drawLights(ctx, sim, originX, viewW);
    this.drawParticles(ctx, sim, toS);
    this.drawTruck(ctx, sim, atlas, toS);
    this.drawAmbush(ctx, sim, atlas, toS);
    this.drawSmoke(ctx, sim, toS);
    this.drawFloaters(ctx, sim, toS);

    if (sim.flash > 0) {
      ctx.fillStyle = `rgba(243,230,200,${sim.flash * 0.35})`;
      ctx.fillRect(-20, -20, viewW + 40, VH + 40);
    }
    ctx.restore();
    void w;
    void h;
  }

  private drawSky(ctx: CanvasRenderingContext2D, viewW: number, viewH: number) {
    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, SKY);
    g.addColorStop(0.45, "#152033");
    g.addColorStop(1, NIGHT);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.fillStyle = "#f3ead2";
    for (const s of this.stars) {
      ctx.globalAlpha = 0.35 + s.s * 0.4;
      ctx.fillRect(s.x * viewW, s.y * viewH, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    const mx = viewW * 0.78;
    const my = viewH * 0.12;
    ctx.fillStyle = "#e8e0c8";
    ctx.beginPath();
    ctx.arc(mx, my, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SKY;
    ctx.beginPath();
    ctx.arc(mx + 8, my - 4, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawForest(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    atlas: Atlas,
    viewW: number,
    originX: number,
    camY: number,
  ) {
    ctx.fillStyle = GRASS2;
    ctx.fillRect(0, 0, originX - ROAD_HALF - 36, VH);
    ctx.fillRect(originX + ROAD_HALF + 36, 0, viewW, VH);
    ctx.fillStyle = GRASS;
    ctx.fillRect(originX - ROAD_HALF - 36, 0, 22, VH);
    ctx.fillRect(originX + ROAD_HALF + 14, 0, 22, VH);

    const pat = ctx.createPattern(this.gravelPat(), "repeat");
    if (pat) {
      ctx.save();
      ctx.fillStyle = pat;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(originX - ROAD_HALF - 18, 0, 18, VH);
      ctx.fillRect(originX + ROAD_HALF, 0, 18, VH);
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, originX - ROAD_HALF + 4, VH);
    ctx.rect(originX + ROAD_HALF - 4, 0, viewW, VH);
    ctx.clip();
    for (const s of sim.scenery) {
      const sy = PLAYER_SCREEN_Y - (s.y - camY);
      if (sy < -160 || sy > VH + 40) continue;
      const img = s.kind === "pine" ? atlas.pine : s.kind === "oak" ? atlas.oak : atlas.mailbox;
      const h =
        s.kind === "mailbox" ? 44 * s.scale : s.kind === "oak" ? 108 * s.scale : 128 * s.scale;
      const w = (img.width / img.height) * h;
      const sx = originX + s.x - w / 2;
      ctx.save();
      ctx.globalAlpha = 0.95;
      if (s.flip) {
        ctx.translate(sx + w / 2, sy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, -w / 2, -h + 10, w, h);
      } else {
        ctx.drawImage(img, sx, sy - h + 10, w, h);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  private drawRoad(ctx: CanvasRenderingContext2D, originX: number, camY: number, viewW: number) {
    const left = originX - ROAD_HALF;
    const right = originX + ROAD_HALF;
    ctx.fillStyle = ASPHALT;
    ctx.fillRect(left, 0, ROAD_HALF * 2, VH);
    const g = ctx.createLinearGradient(left, 0, right, 0);
    g.addColorStop(0, "#2f3340");
    g.addColorStop(0.5, ASPHALT2);
    g.addColorStop(1, "#2f3340");
    ctx.fillStyle = g;
    ctx.fillRect(left, 0, ROAD_HALF * 2, VH);

    ctx.fillStyle = LINE_WHT;
    ctx.fillRect(left + 4, 0, 5, VH);
    ctx.fillRect(right - 9, 0, 5, VH);

    const dash = 34;
    const gap = 26;
    const period = dash + gap;
    const offset = ((camY % period) + period) % period;
    ctx.fillStyle = LINE_YEL;
    for (let y = -period + offset; y < VH + period; y += period) {
      ctx.fillRect(originX - 3, y, 6, dash);
    }

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(left, 0, 10, VH);
    ctx.fillRect(right - 10, 0, 10, VH);
    void viewW;
  }

  private drawPickups(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    atlas: Atlas,
    toS: (x: number, y: number) => { sx: number; sy: number },
  ) {
    for (const k of sim.pickups) {
      if (!k.alive) continue;
      const { sx, sy } = toS(k.x, k.y);
      const bob = Math.sin(k.t * 4) * 4;
      const frame = k.kind === "coffee" ? 0 : k.kind === "horseshoe" ? 1 : k.kind === "tire" ? 2 : 3;
      const size = k.kind === "gas" ? 52 : PICKUP_DRAW;
      ctx.save();
      ctx.shadowColor = k.kind === "gas" ? "rgba(196,69,54,0.7)" : "rgba(232,163,23,0.45)";
      ctx.shadowBlur = k.kind === "gas" ? 16 : 12;
      drawFrame(
        ctx,
        atlas.pickups,
        frame,
        sx - size / 2,
        sy - size + bob,
        size,
        size,
      );
      ctx.restore();
    }
  }

  private drawAnimals(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    atlas: Atlas,
    toS: (x: number, y: number) => { sx: number; sy: number },
  ) {
    const sorted = sim.animals.filter((a) => a.alive).sort((a, b) => b.y - a.y);
    for (const a of sorted) {
      const { sx, sy } = toS(a.x, a.y);
      const def = ANIMAL[a.kind];
      const freeze = a.state === "freeze";
      const sheet =
        a.kind === "deer"
          ? freeze
            ? atlas.deerFreeze
            : atlas.deerWalk
          : a.kind === "raccoon"
            ? atlas.raccoon
            : a.kind === "possum"
              ? atlas.possum
              : atlas.turkey;
      const fps = freeze ? 3 : a.state === "bolt" ? 12 : 8;
      const frame = Math.floor(a.t * fps) % 4;
      const flip = a.facing < 0;
      if (freeze) {
        ctx.save();
        ctx.shadowColor = "rgba(232,163,23,0.7)";
        ctx.shadowBlur = 18;
        drawFrame(ctx, sheet, frame, sx - def.drawW / 2, sy - def.drawH, def.drawW, def.drawH, flip);
        ctx.restore();
      } else {
        drawFrame(ctx, sheet, frame, sx - def.drawW / 2, sy - def.drawH, def.drawW, def.drawH, flip);
      }
    }
  }

  private drawLights(ctx: CanvasRenderingContext2D, sim: Sim, originX: number, viewW: number) {
    const p = sim.player;
    const sx = originX + p.x;
    const sy = PLAYER_SCREEN_Y;
    const spread = 78;
    const reach = 360;

    ctx.save();
    ctx.fillStyle = "rgba(6,10,18,0.28)";
    ctx.fillRect(0, 0, Math.max(0, originX - ROAD_HALF - 8), VH);
    ctx.fillRect(originX + ROAD_HALF + 8, 0, viewW, VH);

    ctx.globalCompositeOperation = "lighter";
    const cone = ctx.createLinearGradient(sx, sy - 8, sx, sy - reach);
    cone.addColorStop(0, p.hornFlash > 0 ? "rgba(255,244,210,0.42)" : "rgba(232,163,23,0.28)");
    cone.addColorStop(0.4, "rgba(232,163,23,0.12)");
    cone.addColorStop(1, "rgba(232,163,23,0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(sx - 14, sy - 18);
    ctx.lineTo(sx - spread, sy - reach);
    ctx.lineTo(sx + spread, sy - reach);
    ctx.lineTo(sx + 14, sy - 18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawParticles(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    toS: (x: number, y: number) => { sx: number; sy: number },
  ) {
    for (const q of sim.particles) {
      if (q.kind === "smoke") continue;
      const { sx, sy } = toS(q.x, q.y);
      const a = Math.max(0, q.life / q.max);
      if (q.kind === "moth") {
        ctx.fillStyle = `rgba(243,230,200,${0.55 * a})`;
        ctx.fillRect(sx, sy, 2, 2);
      } else if (q.kind === "spark") {
        ctx.fillStyle = `rgba(232,163,23,${a})`;
        ctx.fillRect(sx, sy, q.size, q.size);
      } else if (q.kind === "leaf") {
        ctx.fillStyle = `rgba(90,110,60,${a})`;
        ctx.fillRect(sx, sy, q.size, q.size * 0.6);
      } else {
        ctx.fillStyle = `rgba(160,140,110,${0.45 * a})`;
        ctx.beginPath();
        ctx.arc(sx, sy, q.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawTruck(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    atlas: Atlas,
    toS: (x: number, y: number) => { sx: number; sy: number },
  ) {
    const p = sim.player;
    const { sx, sy } = toS(p.x, p.y);
    const frame = Math.floor(p.bounce) % 4;
    const steelLook = p.steel && p.invuln > STEEL_WARN;
    const blink = p.invuln > 0 && !steelLook && Math.floor(p.invuln * 18) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.4;
    const w = 56;
    const h = 112;
    ctx.save();
    ctx.translate(sx, sy);
    if (steelLook) {
      ctx.shadowColor = "rgba(243,230,200,0.7)";
      ctx.shadowBlur = 24;
    } else if (p.invuln > 0) {
      ctx.shadowColor = "rgba(243,230,200,0.6)";
      ctx.shadowBlur = 14;
    }
    drawFrame(ctx, steelLook ? atlas.truckGuard : atlas.truck, frame, -w / 2, -h + 18, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawAmbush(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    atlas: Atlas,
    toS: (x: number, y: number) => { sx: number; sy: number },
  ) {
    const a = sim.ambush;
    if (!a) return;
    const { sx, sy } = toS(a.x, a.y);
    const lunge = a.phase === "lunge";
    const w = lunge ? 72 : 52;
    const h = lunge ? 52 : 38;
    const frame = Math.floor(a.t * (lunge ? 14 : 7)) % 4;
    const flip = a.fromX > 0;
    ctx.save();
    if (lunge) {
      ctx.shadowColor = "rgba(232,80,60,0.75)";
      ctx.shadowBlur = 22;
    }
    drawFrame(ctx, atlas.raccoon, frame, sx - w / 2, sy - h * 0.85, w, h, flip);
    ctx.restore();
  }

  private drawSmoke(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    toS: (x: number, y: number) => { sx: number; sy: number },
  ) {
    for (const q of sim.particles) {
      if (q.kind !== "smoke") continue;
      const { sx, sy } = toS(q.x, q.y);
      const a = Math.max(0, q.life / q.max);
      const r = q.size * (1.2 - a * 0.25);
      ctx.fillStyle = `rgba(196, 190, 178, ${0.5 * a})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(92, 90, 86, ${0.28 * a})`;
      ctx.beginPath();
      ctx.arc(sx + r * 0.12, sy - r * 0.18, r * 0.58, 0, Math.PI * 2);
      ctx.fill();
    }
    if (sim.mode === "play" && sim.player.damage >= 1) {
      const p = sim.player;
      const { sx, sy } = toS(p.x, p.y);
      const t = sim.time;
      for (let i = 0; i < 5; i++) {
        const wobble = Math.sin(t * 6 + i * 1.7);
        const ox = Math.cos(t * 3.2 + i * 2.1) * (10 + i * 3);
        const oy = -18 - i * 10 + wobble * 4;
        const r = 16 + i * 7;
        ctx.fillStyle = `rgba(210, 206, 196, ${0.28 - i * 0.04})`;
        ctx.beginPath();
        ctx.arc(sx + ox, sy + oy - 20, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawFloaters(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    toS: (x: number, y: number) => { sx: number; sy: number },
  ) {
    ctx.font = "700 26px Teko, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    for (const f of sim.floaters) {
      const { sx, sy } = toS(f.x, f.y);
      const a = Math.max(0, Math.min(1, f.life * 1.35));
      ctx.globalAlpha = a;
      ctx.strokeStyle = "rgba(11,16,32,0.88)";
      ctx.fillStyle = "#f3e6c8";
      ctx.strokeText(f.text, sx, sy);
      ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }
}

