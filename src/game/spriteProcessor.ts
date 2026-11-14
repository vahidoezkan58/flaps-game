export interface FlapsSprites {
  monuments: HTMLCanvasElement[];
  clouds: HTMLCanvasElement[];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = async () => {
      try {
        const res = await fetch(src, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const blobImg = new Image();
        blobImg.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(blobImg);
        };
        blobImg.onerror = (err) => {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        };
        blobImg.src = objectUrl;
      } catch (err) {
        reject(err);
      }
    };
    img.src = src;
  });
}

function extractComponents(
  img: HTMLImageElement,
  targetCount: number,
  maxDim = 960
): HTMLCanvasElement[] {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const total = w * h;

  // 1. Identify candidate white pixels
  const isCandidateWhite = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
    if (min >= 230 && max - min <= 26) {
      isCandidateWhite[i] = 1;
    }
  }

  // 2. BFS on candidate white regions: remove exterior & large interior archways (>= 80 px)
  const visitedWhite = new Uint8Array(total);
  const isBg = new Uint8Array(total);
  const queue = new Int32Array(total);
  const compPixels = new Int32Array(total);

  for (let i = 0; i < total; i++) {
    if (!isCandidateWhite[i] || visitedWhite[i]) continue;
    let qHead = 0;
    let qTail = 0;
    let count = 0;
    queue[qTail++] = i;
    visitedWhite[i] = 1;

    while (qHead < qTail) {
      const curr = queue[qHead++];
      compPixels[count++] = curr;
      const x = curr % w;
      const y = (curr - x) / w;

      if (x > 0) {
        const n = curr - 1;
        if (isCandidateWhite[n] && !visitedWhite[n]) {
          visitedWhite[n] = 1;
          queue[qTail++] = n;
        }
      }
      if (x < w - 1) {
        const n = curr + 1;
        if (isCandidateWhite[n] && !visitedWhite[n]) {
          visitedWhite[n] = 1;
          queue[qTail++] = n;
        }
      }
      if (y > 0) {
        const n = curr - w;
        if (isCandidateWhite[n] && !visitedWhite[n]) {
          visitedWhite[n] = 1;
          queue[qTail++] = n;
        }
      }
      if (y < h - 1) {
        const n = curr + w;
        if (isCandidateWhite[n] && !visitedWhite[n]) {
          visitedWhite[n] = 1;
          queue[qTail++] = n;
        }
      }
    }

    // Large white regions (background + monument archways) become transparent
    if (count >= 80) {
      for (let k = 0; k < count; k++) {
        isBg[compPixels[k]] = 1;
      }
    }
  }

  // 3. Apply transparency + smooth 1-2px edge feathering & white-matte defringing
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    if (isBg[i]) {
      data[idx + 3] = 0;
      continue;
    }

    const x = i % w;
    const y = (i - x) / w;
    let nearBg = false;
    for (let dy = -1; dy <= 1 && !nearBg; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        if (isBg[ny * w + nx]) {
          nearBg = true;
          break;
        }
      }
    }

    if (nearBg) {
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const distWhite = Math.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2);
      if (distWhite < 56) {
        const alphaNorm = Math.max(0, Math.min(1, (distWhite - 14) / 42));
        data[idx + 3] = Math.round(alphaNorm * 255);
        // Defringe white matte toward saturated pink edge
        if (alphaNorm > 0.08 && alphaNorm < 0.98) {
          data[idx] = Math.max(0, Math.min(255, Math.round((r - 255 * (1 - alphaNorm)) / alphaNorm)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round((g - 255 * (1 - alphaNorm)) / alphaNorm)));
          data[idx + 2] = Math.max(0, Math.min(255, Math.round((b - 255 * (1 - alphaNorm)) / alphaNorm)));
        }
      }
    }
  }

  // 4. Foreground mask + 2px dilation to group delicate edge bubbles with their parent sprite
  const fg = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (data[i * 4 + 3] > 20) fg[i] = 1;
  }

  const dilated = new Uint8Array(total);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!fg[i]) continue;
      const y0 = Math.max(0, y - 2);
      const y1 = Math.min(h - 1, y + 2);
      const x0 = Math.max(0, x - 2);
      const x1 = Math.min(w - 1, x + 2);
      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          dilated[ny * w + nx] = 1;
        }
      }
    }
  }

  // 5. Find foreground connected components
  interface ComponentInfo {
    pixels: number[];
    fgCount: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }

  const visitedFg = new Uint8Array(total);
  const components: ComponentInfo[] = [];

  for (let i = 0; i < total; i++) {
    if (!dilated[i] || visitedFg[i]) continue;
    let qHead = 0;
    let qTail = 0;
    queue[qTail++] = i;
    visitedFg[i] = 1;

    const pixels: number[] = [];
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;

    while (qHead < qTail) {
      const curr = queue[qHead++];
      if (fg[curr]) {
        pixels.push(curr);
        const cx = curr % w;
        const cy = (curr - cx) / w;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
      }

      const x = curr % w;
      const y = (curr - x) / w;
      if (x > 0) {
        const n = curr - 1;
        if (dilated[n] && !visitedFg[n]) {
          visitedFg[n] = 1;
          queue[qTail++] = n;
        }
      }
      if (x < w - 1) {
        const n = curr + 1;
        if (dilated[n] && !visitedFg[n]) {
          visitedFg[n] = 1;
          queue[qTail++] = n;
        }
      }
      if (y > 0) {
        const n = curr - w;
        if (dilated[n] && !visitedFg[n]) {
          visitedFg[n] = 1;
          queue[qTail++] = n;
        }
      }
      if (y < h - 1) {
        const n = curr + w;
        if (dilated[n] && !visitedFg[n]) {
          visitedFg[n] = 1;
          queue[qTail++] = n;
        }
      }
    }

    if (pixels.length > 200) {
      components.push({
        pixels,
        fgCount: pixels.length,
        minX,
        minY,
        maxX,
        maxY,
      });
    }
  }

  // Keep the N largest components, sorted left-to-right
  components.sort((a, b) => b.fgCount - a.fgCount);
  const selected = components.slice(0, targetCount);
  selected.sort((a, b) => a.minX - b.minX);

  return selected.map((comp) => {
    const cw = Math.max(1, comp.maxX - comp.minX + 1);
    const ch = Math.max(1, comp.maxY - comp.minY + 1);
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    const outCtx = out.getContext('2d');
    if (!outCtx) return out;

    const outData = outCtx.createImageData(cw, ch);
    const od = outData.data;

    for (let k = 0; k < comp.pixels.length; k++) {
      const p = comp.pixels[k];
      const px = p % w;
      const py = (p - px) / w;
      const ox = px - comp.minX;
      const oy = py - comp.minY;
      const sIdx = p * 4;
      const dIdx = (oy * cw + ox) * 4;
      od[dIdx] = data[sIdx];
      od[dIdx + 1] = data[sIdx + 1];
      od[dIdx + 2] = data[sIdx + 2];
      od[dIdx + 3] = data[sIdx + 3];
    }

    outCtx.putImageData(outData, 0, 0);
    return out;
  });
}

export async function loadFlapsSprites(): Promise<FlapsSprites> {
  const [monumentsImg, cloudsImg] = await Promise.all([
    loadImage('/assets/aistudio/IMG_7681_90a71b32.jpeg'),
    loadImage('/assets/aistudio/IMG_7683_97a83f17.jpeg'),
  ]);

  const monuments = extractComponents(monumentsImg, 2, 960);
  const clouds = extractComponents(cloudsImg, 5, 960);

  return { monuments, clouds };
}
