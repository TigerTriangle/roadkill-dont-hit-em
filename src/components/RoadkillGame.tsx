import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Megaphone,
  Pause,
  Share2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadAtlas, type Atlas } from "@/game/assets";
import { MIX_DEFAULT, formatMiles } from "@/game/constants";
import { Sim } from "@/game/engine";
import { Renderer } from "@/game/render";
import type { HudSnap, RunStats } from "@/game/types";
import { emptyRun } from "@/game/types";
import { badgeQuip, badgeRank, overImage, overTitle, shareDrive } from "@/game/share";
import { cn } from "@/lib/utils";

const idleHud: HudSnap = {
  mode: "boot",
  score: 0,
  distance: 0,
  high: 0,
  horn: 0,
  shield: 0,
  muted: false,
  combo: 0,
  newBest: false,
  speed: 0,
  stopped: false,
  gas: 1,
  lowFuel: false,
  damage: 0,
  wrecking: false,
  level: 0,
  levelName: "Lesson",
  levelFlash: 0,
  hint: "",
  tutorial: false,
  tutorialDone: false,
  overReason: null,
  ambush: 0,
  mix: { ...MIX_DEFAULT },
  stats: emptyRun(),
};

export function RoadkillGame() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim | null>(null);
  const [hud, setHud] = useState<HudSnap>(idleHud);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [coarse, setCoarse] = useState(false);
  const [settings, setSettings] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(mq.matches || window.innerWidth < 720);
    sync();
    mq.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let killed = false;
    let raf = 0;
    let atlas: Atlas | null = null;
    const renderer = new Renderer();
    const sim = new Sim();
    sim.onHud = (h) => setHud(h);
    simRef.current = sim;

    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const vis = () => {
      if (document.hidden) return;
      sim.audio.resume();
    };
    document.addEventListener("visibilitychange", vis);

    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!atlas) return;
      sim.tick(dt);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.draw(ctx, sim, atlas, r.width, r.height, dpr);
    };

    void (async () => {
      try {
        atlas = await loadAtlas();
        if (killed) return;
        sim.attach();
        setReady(true);
        last = performance.now();
        raf = requestAnimationFrame(loop);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not load art");
      }
    })();

    return () => {
      killed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", vis);
      sim.detach();
      simRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    setSettings(false);
    setStatsOpen(false);
    setShareMsg(null);
    simRef.current?.drive(false);
    wrapRef.current?.focus();
  }, []);

  const startLesson = useCallback(() => {
    setSettings(false);
    setStatsOpen(false);
    setShareMsg(null);
    simRef.current?.drive(true);
    wrapRef.current?.focus();
  }, []);

  const shareThisDrive = useCallback(async () => {
    const result = await shareDrive({
      score: hud.score,
      level: hud.level,
      distance: hud.distance,
      reason: hud.overReason,
      stats: hud.stats,
    });
    setShareMsg(result === "shared" ? "Shared" : result === "copied" ? "Copied to clipboard" : "Could not share");
    window.setTimeout(() => setShareMsg(null), 2200);
  }, [hud.score, hud.level, hud.distance, hud.overReason, hud.stats]);

  const overlay = hud.mode === "title" || hud.mode === "boot" || hud.mode === "over" || hud.mode === "pause";

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      className="relative h-dvh w-full overflow-hidden bg-bg text-fg antialiased touch-none outline-none"
      data-ready={ready ? "true" : "false"}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />

      {hud.mode === "play" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-end gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          {hud.tutorial && (
            <button
              type="button"
              className="pointer-events-auto mt-1 mr-auto text-xs font-semibold uppercase tracking-[0.18em] text-muted"
              onClick={() => {
                simRef.current?.skipLesson(false);
                wrapRef.current?.focus();
              }}
            >
              Skip lesson
            </button>
          )}
          <HudIconButton
            label={hud.muted ? "Unmute" : "Mute"}
            onClick={() => simRef.current?.toggleMute()}
          >
            {hud.muted ? <VolumeX /> : <Volume2 />}
          </HudIconButton>
          <HudIconButton label="Pause" onClick={() => simRef.current?.pause()}>
            <Pause />
          </HudIconButton>
        </div>
      )}

      {hud.mode === "play" && (
        <div
          className={cn(
            "absolute inset-x-0 z-10 flex flex-col",
            coarse
              ? "bottom-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
              : "bottom-4 pb-[max(0px,env(safe-area-inset-bottom))]",
          )}
        >
          {coarse && (
            <div className="flex items-end justify-between px-4 pb-2">
              <HornButton
                onDown={() => {
                  const sim = simRef.current;
                  if (!sim) return;
                  sim.audio.unlock();
                  sim.input.setTouchHorn(true);
                }}
                onUp={() => simRef.current?.input.setTouchHorn(false)}
              />
              <DrivePad
                onChange={(steer, throttle, brake) => {
                  const input = simRef.current?.input;
                  if (!input) return;
                  input.setTouchSteer(steer);
                  input.setTouchThrottle(throttle);
                  input.setTouchBrake(brake);
                }}
              />
            </div>
          )}
          <div className="pointer-events-none px-4">
            <div className="mx-auto flex max-w-xl items-end justify-between gap-3 rounded-lg bg-bg/55 px-3 py-2 backdrop-blur-sm">
              <div className="min-w-0">
                <p className="font-display text-3xl leading-none tracking-wide tabular-nums">
                  {hud.score.toString().padStart(5, "0")}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  {hud.level === 0 ? "Lesson" : `Night ${hud.level}`} · {formatMiles(hud.distance)} mi ·{" "}
                  {hud.stopped ? "stopped" : `${hud.speed} mph`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Fuel</span>
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-fg/20 sm:w-28">
                    <div
                      className={cn("h-full rounded-full", hud.lowFuel || hud.gas <= 0 ? "bg-danger" : "bg-fg")}
                      style={{ width: `${Math.max(0, Math.min(100, Math.round(hud.gas * 100)))}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Body</span>
                  <div className="flex gap-1.5">
                    {Array.from({ length: 4 }).map((_, i) => {
                      const hits = Math.round(hud.damage / 0.25);
                      const remaining = 4 - hits;
                      const intact = i < remaining;
                      return (
                        <span
                          key={i}
                          className={cn(
                            "block size-2.5 rounded-full",
                            !intact && "bg-fg/20",
                            intact && remaining === 1 && "bg-danger",
                            intact && remaining > 1 && "bg-fg",
                          )}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {hud.mode === "play" && hud.levelFlash > 0 && !hud.wrecking && (
        <div className="pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 text-center">
          <p className="font-display text-3xl font-semibold tracking-[0.2em] text-fg">
            {hud.level === 0 ? "LESSON" : `NIGHT ${hud.level}`}
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">{hud.levelName}</p>
        </div>
      )}

      {hud.mode === "play" && hud.hint && hud.levelFlash === 0 && !hud.wrecking && hud.horn === 0 && (
        <p className="pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 text-center font-display text-3xl font-semibold tracking-[0.12em] text-fg">
          {hud.hint}
        </p>
      )}

      {hud.mode === "play" && hud.lowFuel && !hud.stopped && hud.levelFlash === 0 && !hud.hint && (
        <p className="pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 font-display text-3xl font-semibold tracking-[0.2em] text-danger">
          LOW FUEL
        </p>
      )}

      {hud.mode === "play" && hud.gas <= 0 && (
        <p className="pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 font-display text-3xl font-semibold tracking-[0.2em] text-danger">
          OUT OF GAS
        </p>
      )}

      {hud.mode === "play" && hud.wrecking && (
        <p className="pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 font-display text-3xl font-semibold tracking-[0.2em] text-danger">
          TOTALED
        </p>
      )}

      {hud.mode === "play" && hud.damage >= 0.75 && !hud.wrecking && !hud.lowFuel && hud.gas > 0 && hud.levelFlash === 0 && !hud.hint && hud.ambush === 0 && (
        <p className="pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 font-display text-3xl font-semibold tracking-[0.2em] text-danger">
          HEAVY DAMAGE
        </p>
      )}

      {hud.mode === "play" && hud.shield > 0 && !hud.stopped && hud.gas > 0 && !hud.lowFuel && hud.damage < 0.75 && !hud.wrecking && hud.levelFlash === 0 && !hud.hint && hud.ambush === 0 && (
        <p className="pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 font-display text-3xl font-semibold tracking-[0.2em] text-fg">
          STEEL
        </p>
      )}

      {hud.mode === "play" && hud.ambush === 2 && (
        <p className="pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 font-display text-3xl font-semibold tracking-[0.2em] text-danger">
          IT GOT IN
        </p>
      )}

      {hud.mode === "play" && hud.ambush === 1 && hud.horn === 0 && (
        <p className="pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 text-center font-display text-2xl font-semibold tracking-[0.1em] text-danger sm:text-3xl sm:tracking-[0.16em]">
          RABID RACCOON ALERT
        </p>
      )}

      {hud.mode === "play" && hud.stopped && hud.gas > 0 && !hud.wrecking && hud.ambush === 0 && (
        <p className="pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 font-display text-3xl font-semibold tracking-[0.2em] text-fg">
          STOPPED
        </p>
      )}

      {hud.mode === "play" && hud.horn > 0 && (
        <p className="pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 font-display text-5xl font-semibold tracking-[0.2em] text-fg">
          HONK
        </p>
      )}

      {(hud.mode === "title" || hud.mode === "boot") && (
        <>
          <picture>
            <source media="(min-aspect-ratio: 1/1)" srcSet="/title.jpg" />
            <img
              src="/title-portrait.jpg"
              alt=""
              className="absolute inset-0 z-10 size-full object-cover object-center"
            />
          </picture>
          <div className="absolute inset-0 z-10 bg-gradient-to-t from-bg/70 via-bg/25 to-transparent" />
        </>
      )}

      {overlay && (
        <div
          className={cn(
            "absolute inset-0 z-20 flex justify-center overflow-y-auto p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6",
            hud.mode === "title" || hud.mode === "boot" ? "items-end sm:items-end" : "items-start sm:items-center",
          )}
        >
          <div
            className={cn(
              "my-auto w-full max-w-md rounded-xl border border-border p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-7",
              hud.mode === "title" || hud.mode === "boot"
                ? "my-0 bg-surface/50 backdrop-blur-sm"
                : "bg-surface",
            )}
          >
            {!ready && !loadError && hud.mode === "boot" && (
              <TitleCard
                high={hud.high}
                onDrive={start}
                onLesson={startLesson}
                onSettings={() => setSettings(true)}
                ready={false}
              />
            )}
            {loadError && <p className="text-sm text-danger">{loadError}</p>}
            {ready && hud.mode === "title" && !settings && (
              <TitleCard
                high={hud.high}
                onDrive={start}
                onLesson={startLesson}
                onSettings={() => {
                  simRef.current?.audio.unlock();
                  setSettings(true);
                }}
                ready
              />
            )}
            {hud.mode === "pause" && !settings && (
              <MenuCard
                title="Paused"
                body="The highway keeps. You don't have to."
                primary="Resume"
                onPrimary={() => simRef.current?.resume()}
                secondary="Settings"
                onSecondary={() => {
                  simRef.current?.audio.unlock();
                  setSettings(true);
                }}
                tertiary="Title"
                onTertiary={() => simRef.current?.toTitle()}
              />
            )}
            {settings && (hud.mode === "title" || hud.mode === "pause") && (
              <SettingsCard
                muted={hud.muted}
                mix={hud.mix}
                onMute={() => simRef.current?.toggleMute()}
                onMix={(key, value) => simRef.current?.setMix(key, value)}
                onBack={() => setSettings(false)}
              />
            )}
            {hud.mode === "over" && !statsOpen && (
              <MenuCard
                title={overTitle(hud.overReason)}
                body={`${hud.score} pts · night ${hud.level} · ${formatMiles(hud.distance)} mi${hud.newBest ? " · new best" : ""}`}
                image={overImage(hud.overReason) ?? undefined}
                badge={{ rank: badgeRank(hud.level), quip: badgeQuip(hud.overReason) }}
                primary="Drive again"
                onPrimary={start}
                secondary="Stats"
                onSecondary={() => setStatsOpen(true)}
                share
                onShare={shareThisDrive}
                tertiary="Title"
                onTertiary={() => {
                  setStatsOpen(false);
                  setShareMsg(null);
                  simRef.current?.toTitle();
                }}
                note={shareMsg}
              />
            )}
            {hud.mode === "over" && statsOpen && (
              <StatsCard
                score={hud.score}
                level={hud.level}
                distance={hud.distance}
                stats={hud.stats}
                reason={hud.overReason}
                onBack={() => setStatsOpen(false)}
                onShare={shareThisDrive}
                shareMsg={shareMsg}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HudIconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="pointer-events-auto flex size-11 items-center justify-center rounded-lg border border-border bg-bg/70 text-fg backdrop-blur-sm"
    >
      {children}
    </button>
  );
}

function HornButton({ onDown, onUp }: { onDown: () => void; onUp: () => void }) {
  const [held, setHeld] = useState(false);
  const release = () => {
    if (!held) return;
    setHeld(false);
    onUp();
  };
  return (
    <button
      type="button"
      aria-label="Horn"
      className={cn(
        "flex size-20 items-center justify-center rounded-full border border-border bg-surface/70 text-fg backdrop-blur-sm touch-none",
        held && "bg-fg/20",
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setHeld(true);
        onDown();
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <Megaphone className="size-8" />
    </button>
  );
}

function DrivePad({
  onChange,
}: {
  onChange: (steer: number, throttle: number, brake: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [vec, setVec] = useState({ x: 0, y: 0 });
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => () => cb.current(0, 0, 0), []);

  const apply = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let x = (clientX - (r.left + r.width / 2)) / (r.width * 0.42);
    let y = (clientY - (r.top + r.height / 2)) / (r.height * 0.42);
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    const dead = 0.22;
    const steer = Math.abs(x) < dead ? 0 : x;
    const throttle = y < -dead ? Math.min(1, -y) : 0;
    const brake = y > dead ? Math.min(1, y) : 0;
    setVec({ x: steer, y: throttle ? -throttle : brake });
    cb.current(steer, throttle, brake);
  };

  const clear = () => {
    setVec({ x: 0, y: 0 });
    cb.current(0, 0, 0);
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Drive pad. Up gas, down brake, left and right steer."
      className="relative size-32 touch-none rounded-full border border-border bg-surface/70 backdrop-blur-sm"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        apply(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        apply(e.clientX, e.clientY);
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
    >
      <ChevronUp
        className={cn(
          "pointer-events-none absolute left-1/2 top-1 size-7 -translate-x-1/2",
          vec.y < -0.22 ? "text-fg" : "text-muted",
        )}
      />
      <ChevronDown
        className={cn(
          "pointer-events-none absolute bottom-1 left-1/2 size-7 -translate-x-1/2",
          vec.y > 0.22 ? "text-fg" : "text-muted",
        )}
      />
      <ChevronLeft
        className={cn(
          "pointer-events-none absolute left-1 top-1/2 size-7 -translate-y-1/2",
          vec.x < -0.22 ? "text-fg" : "text-muted",
        )}
      />
      <ChevronRight
        className={cn(
          "pointer-events-none absolute right-1 top-1/2 size-7 -translate-y-1/2",
          vec.x > 0.22 ? "text-fg" : "text-muted",
        )}
      />
      <span className="pointer-events-none absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg/35" />
    </div>
  );
}

function TitleCard({
  high,
  onDrive,
  onLesson,
  onSettings,
  ready = true,
}: {
  high: number;
  onDrive: () => void;
  onLesson: () => void;
  onSettings: () => void;
  ready?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div>
        <h1 className="sr-only">Roadkill: Don't Hit 'Em</h1>
        <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted">
          Late. Two-lane. Something always walks into the lights. Swerve, honk, or pay the price. Oh, and
          don't stop too long. You've been warned.
        </p>
      </div>
      <Button
        size="lg"
        className="w-full font-display text-xl tracking-[0.16em]"
        onClick={onDrive}
        data-testid="drive"
        disabled={!ready}
      >
        {ready ? "Drive" : "Loading"}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="w-full" onClick={onLesson} data-testid="lesson" disabled={!ready}>
          Lesson
        </Button>
        <Button variant="outline" className="w-full" onClick={onSettings} disabled={!ready} data-testid="settings">
          Settings
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs uppercase tracking-[0.16em] text-muted">
        <dt>Steer</dt>
        <dd className="text-fg">A / D</dd>
        <dt>Throttle / brake</dt>
        <dd className="text-fg">W / Hold S</dd>
        <dt>Horn</dt>
        <dd className="text-fg">Space</dd>
        <dt>Best</dt>
        <dd className="text-fg tabular-nums">{high}</dd>
      </dl>
    </div>
  );
}

function MenuCard({
  title,
  body,
  image,
  badge,
  primary,
  onPrimary,
  secondary,
  onSecondary,
  share,
  onShare,
  tertiary,
  onTertiary,
  note,
}: {
  title: string;
  body: string;
  image?: string;
  badge?: { rank: string; quip: string };
  primary: string;
  onPrimary: () => void;
  secondary: string;
  onSecondary: () => void;
  share?: boolean;
  onShare?: () => void | Promise<void>;
  tertiary?: string;
  onTertiary?: () => void;
  note?: string | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      {image && (
        <div className="relative overflow-hidden rounded-lg outline outline-1 -outline-offset-1 outline-fg/10">
          <img src={image} alt="" className="aspect-video w-full object-cover" />
          {badge && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/90 to-transparent px-3 pb-2.5 pt-10">
              <p className="font-display text-2xl leading-none tracking-[0.06em]">{badge.rank}</p>
              <p className="mt-1 text-sm text-muted">{badge.quip}</p>
            </div>
          )}
        </div>
      )}
      <div>
        <h2 className="font-display text-5xl leading-none tracking-[0.06em]">{title}</h2>
        <p className="mt-3 text-sm text-muted">{body}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button size="lg" className="w-full font-display text-xl tracking-[0.14em]" onClick={onPrimary}>
          {primary}
        </Button>
        <Button variant="outline" className="w-full" onClick={onSecondary}>
          {secondary}
        </Button>
        {share && onShare && (
          <Button variant="outline" className="w-full gap-2" onClick={() => void onShare()}>
            <Share2 className="size-4" />
            Share
          </Button>
        )}
        {tertiary && onTertiary && (
          <Button variant="outline" className="w-full" onClick={onTertiary}>
            {tertiary}
          </Button>
        )}
      </div>
      {note && <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted">{note}</p>}
    </div>
  );
}

function MixSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
        <span className="tabular-nums text-fg">{Math.round(value * 100)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="mix-slider"
      />
    </label>
  );
}

function SettingsCard({
  muted,
  mix,
  onMute,
  onMix,
  onBack,
}: {
  muted: boolean;
  mix: HudSnap["mix"];
  onMute: () => void;
  onMix: (key: "horn" | "sfx" | "music" | "engine", value: number) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-5xl leading-none tracking-[0.06em]">Settings</h2>
        <p className="mt-3 text-sm text-muted">Horn, banjo, crashes, and the rumble under the hood.</p>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            {muted ? "Sound off" : "Sound on"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={!muted}
            aria-label={muted ? "Sound off" : "Sound on"}
            onClick={onMute}
            className={cn(
              "relative h-7 w-12 rounded-full transition-colors duration-(--motion-fast) ease-(--ease-out) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              muted ? "bg-border" : "bg-fg",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-6 rounded-full transition-transform duration-(--motion-fast) ease-(--ease-out)",
                muted ? "left-0.5 bg-muted" : "left-0.5 translate-x-5 bg-bg",
              )}
            />
          </button>
        </div>
        <MixSlider label="Horn" value={mix.horn} onChange={(v) => onMix("horn", v)} />
        <MixSlider label="Effects" value={mix.sfx} onChange={(v) => onMix("sfx", v)} />
        <MixSlider label="Music" value={mix.music} onChange={(v) => onMix("music", v)} />
        <MixSlider label="Engine" value={mix.engine} onChange={(v) => onMix("engine", v)} />
      </div>
      <Button variant="outline" className="w-full" onClick={onBack}>
        Done
      </Button>
    </div>
  );
}

function StatGrid({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{title}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">{row.label}</dt>
            <dd className="tabular-nums text-fg">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function HitGrid({ stats }: { stats: RunStats["hits"] }) {
  const rows: { label: string; kind: keyof RunStats["hits"] }[] = [
    { label: "Deer", kind: "deer" },
    { label: "Raccoon", kind: "raccoon" },
    { label: "Possum", kind: "possum" },
    { label: "Turkey", kind: "turkey" },
  ];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Hit</p>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Damage (steel)</p>
      </div>
      <dl className="mt-2 flex flex-col gap-1.5 text-sm">
        {rows.map((row) => {
          const pair = stats[row.kind];
          return (
            <div key={row.kind} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{row.label}</dt>
              <dd className="tabular-nums text-fg">
                {pair.body} ({pair.steel})
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-muted">Steel is the coffee rush — no dent in the truck.</p>
    </div>
  );
}

function StatsCard({
  score,
  level,
  distance,
  stats,
  reason,
  onBack,
  onShare,
  shareMsg,
}: {
  score: number;
  level: number;
  distance: number;
  stats: RunStats;
  reason: HudSnap["overReason"];
  onBack: () => void;
  onShare: () => void | Promise<void>;
  shareMsg?: string | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-5xl leading-none tracking-[0.06em]">This drive</h2>
        <p className="mt-3 text-sm text-muted">
          {score} pts · night {level} · {formatMiles(distance)} mi · {overTitle(reason)}
        </p>
      </div>
      <HitGrid stats={stats.hits} />
      <StatGrid
        title="Picked up"
        rows={[
          { label: "Coffee", value: stats.pickups.coffee },
          { label: "Horseshoe", value: stats.pickups.horseshoe },
          { label: "Tire", value: stats.pickups.tire },
          { label: "Gas", value: stats.pickups.gas },
        ]}
      />
      <StatGrid
        title="Also"
        rows={[
          { label: "Honks", value: stats.honks },
          { label: "Near misses", value: stats.near },
        ]}
      />
      <div className="flex flex-col gap-2">
        <Button variant="outline" className="w-full gap-2" onClick={() => void onShare()}>
          <Share2 className="size-4" />
          Share
        </Button>
        <Button variant="outline" className="w-full" onClick={onBack}>
          Back
        </Button>
      </div>
      {shareMsg && (
        <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted">{shareMsg}</p>
      )}
    </div>
  );
}
