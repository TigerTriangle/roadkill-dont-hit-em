export type Sheet = {
  img: HTMLImageElement;
  cols: number;
  rows: number;
};

export type Atlas = {
  truck: Sheet;
  truckGuard: Sheet;
  deerWalk: Sheet;
  deerFreeze: Sheet;
  raccoon: Sheet;
  possum: Sheet;
  turkey: Sheet;
  pickups: Sheet;
  impact: Sheet;
  pine: HTMLImageElement;
  oak: HTMLImageElement;
  mailbox: HTMLImageElement;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function sheet(img: HTMLImageElement, cols: number, rows: number): Sheet {
  return { img, cols, rows };
}

export async function loadAtlas(): Promise<Atlas> {
  const [
    truck,
    truckGuard,
    deerWalk,
    deerFreeze,
    raccoon,
    possum,
    turkey,
    pickups,
    impact,
    pine,
    oak,
    mailbox,
  ] = await Promise.all([
    loadImage("/sprites/truck.png?v=topdown1"),
    loadImage("/sprites/truck-guard.png?v=1"),
    loadImage("/sprites/deer-walk.png"),
    loadImage("/sprites/deer-freeze.png"),
    loadImage("/sprites/raccoon.png"),
    loadImage("/sprites/possum.png"),
    loadImage("/sprites/turkey.png"),
    loadImage("/sprites/pickups.png?v=mug1"),
    loadImage("/sprites/impact.png"),
    loadImage("/sprites/pine.png"),
    loadImage("/sprites/oak.png"),
    loadImage("/sprites/mailbox.png"),
  ]);
  return {
    truck: sheet(truck, 2, 2),
    truckGuard: sheet(truckGuard, 2, 2),
    deerWalk: sheet(deerWalk, 2, 2),
    deerFreeze: sheet(deerFreeze, 2, 2),
    raccoon: sheet(raccoon, 2, 2),
    possum: sheet(possum, 2, 2),
    turkey: sheet(turkey, 2, 2),
    pickups: sheet(pickups, 2, 2),
    impact: sheet(impact, 2, 2),
    pine,
    oak,
    mailbox,
  };
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  frame: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  flip = false,
) {
  const cols = sheet.cols;
  const fw = sheet.img.width / sheet.cols;
  const fh = sheet.img.height / sheet.rows;
  const i = ((frame % (cols * sheet.rows)) + cols * sheet.rows) % (cols * sheet.rows);
  const sx = (i % cols) * fw;
  const sy = Math.floor(i / cols) * fh;
  ctx.save();
  if (flip) {
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet.img, sx, sy, fw, fh, -dw / 2, -dh / 2, dw, dh);
  } else {
    ctx.drawImage(sheet.img, sx, sy, fw, fh, dx, dy, dw, dh);
  }
  ctx.restore();
}
