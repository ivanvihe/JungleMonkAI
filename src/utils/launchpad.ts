export type LaunchpadPreset =
  | 'spectrum'
  | 'pulse'
  | 'wave'
  | 'test'
  | 'rainbow'
  | 'snake'
  | 'canvas'
  | 'custom-text';

export const LAUNCHPAD_PRESETS: { id: LaunchpadPreset; label: string }[] = [
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'wave', label: 'Wave' },
  { id: 'test', label: 'Test Pattern' },
  { id: 'rainbow', label: 'Rainbow' },
  { id: 'snake', label: 'Snake' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'custom-text', label: 'Custom Text' }
];

const GRID_SIZE = 8;
const GRID_LEN = GRID_SIZE * GRID_SIZE;

let textCanvas: HTMLCanvasElement | null = null;

/**
 * Determine whether a given MIDI port belongs to a Novation Launchpad.
 * Some Launchpad models expose names like "LPPRO MIDI" or "LPX Standalone Port",
 * so we check both the manufacturer and common LP prefixes.
 */
export function isLaunchpadDevice(device: any): boolean {
  const name = (device?.name || '').toLowerCase();
  const manufacturer = (device?.manufacturer || '').toLowerCase();

  if (name.includes('launchpad')) return true;
  if (name.includes('lppro') || name.includes('llpro') || name.includes('mk3')) return true;

  const fromNovation = manufacturer.includes('novation');
  return fromNovation && /^lp/.test(name);
}

/**
 * Convert a 0-63 grid index (0 = top-left, 63 = bottom-right) to the
 * corresponding Launchpad MIDI note number.
 *
 * The physical Launchpad layout numbers pads from the bottom-left corner
 * with a stride of 16 between rows. For example, the bottom row spans
 * notes 0-7, the next row 16-23, and so on up to 112-119 at the top.
 */
export function gridIndexToNote(index: number): number {
  const rowFromTop = Math.floor(index / GRID_SIZE); // 0 = top row
  const col = index % GRID_SIZE;
  const rowFromBottom = GRID_SIZE - 1 - rowFromTop;
  return rowFromBottom * 16 + col;
}

/**
 * Sample the current canvas and downscale it to an 8x8 grid for the Launchpad.
 * This returns 64 brightness values (0-127) representing the canvas image.
 */
export function canvasToLaunchpadFrame(canvas: HTMLCanvasElement): number[] {
  const offscreen = document.createElement('canvas');
  offscreen.width = GRID_SIZE;
  offscreen.height = GRID_SIZE;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return new Array(GRID_LEN).fill(0);
  }

  // Draw the source canvas scaled to 8x8
  ctx.drawImage(canvas, 0, 0, GRID_SIZE, GRID_SIZE);
  const imgData = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data;

  const colors = new Array(GRID_LEN).fill(0);
  for (let i = 0; i < GRID_LEN; i++) {
    const r = imgData[i * 4];
    const g = imgData[i * 4 + 1];
    const b = imgData[i * 4 + 2];
    const a = imgData[i * 4 + 3] / 255;

    const brightness = (r + g + b) / 3 / 255;
    const value = Math.min(127, Math.floor(brightness * a * 127));
    colors[i] = value;
  }

  return colors;
}

/**
 * Build a frame of 64 color values for the Launchpad grid based on audio data.
 * Colors use the built-in palette (0-127).
 * IMPORTANT: This function MUST always return exactly 64 values for the 8x8 grid
 */
export function buildLaunchpadFrame(
  preset: LaunchpadPreset,
  data: { fft: number[]; low: number; mid: number; high: number },
  options?: { text?: string }
): number[] {
  // 🔥 CRITICAL: Always initialize with exactly 64 elements (8x8 grid)
  const colors = new Array(GRID_LEN).fill(0);

  // Debug: verify that we have valid data
  if (!data.fft || data.fft.length === 0) {
    console.log('⚠️ buildLaunchpadFrame: No FFT data, returning empty grid');
    return colors; // return all off if no data
  }

  switch (preset) {
    case 'spectrum': {
      // Map FFT into 8 columns (grid completo 8x8)
      const cols = GRID_SIZE;
      for (let x = 0; x < cols; x++) {
        const idx = Math.floor((data.fft.length / cols) * x);
        const v = data.fft[idx] || 0;
        // Amplify the signal for better visibility
        const amplified = Math.min(1, v * 3);
        const height = Math.min(GRID_SIZE, Math.floor(amplified * GRID_SIZE));
        const color = Math.min(127, Math.floor(amplified * 100) + 10);
        const baseline = Math.max(5, Math.floor(amplified * 20));

        // Llenar la columna completa asegurando uso del grid 8x8
        for (let y = 0; y < GRID_SIZE; y++) {
          const gridIndex = (GRID_SIZE - 1 - y) * GRID_SIZE + x;
          if (y < height) {
            colors[gridIndex] = color;
          } else {
            colors[gridIndex] = baseline;
          }
        }
      }
      break;
    }
    case 'pulse': {
      // Ondas circulares expansivas desde el centro
      const t = Date.now() / 400;
      const avg = (data.low + data.mid + data.high) / 3;
      const radius = ((Math.sin(t) + 1) / 2) * (GRID_SIZE / 2);
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const dx = x - (GRID_SIZE - 1) / 2;
          const dy = y - (GRID_SIZE - 1) / 2;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const diff = Math.abs(dist - radius);
          const ring = Math.max(0, 1 - diff / 1.5);
          const value = Math.min(127, Math.floor(ring * avg * 200));
          colors[y * GRID_SIZE + x] = value;
        }
      }
      break;
    }
    case 'wave': {
      // Onda que se mueve por todo el grid 8x8
      const t = Date.now() / 150;
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const gridIndex = y * GRID_SIZE + x;
          const wave = Math.sin(t + x * 0.5 + y * 0.3);
          const intensity = Math.min(127, Math.floor(((wave + 1) / 2) * data.mid * 100) + 10);
          colors[gridIndex] = intensity;
        }
      }
      break;
    }
    case 'test': {
      // PRESET TEST COMPLETAMENTE INDEPENDIENTE DEL AUDIO
      // Use the entire 8x8 grid with a visible pattern
      const t = Date.now() / 300;
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const gridIndex = y * GRID_SIZE + x;

          // Crossed wave pattern covering the entire grid
          const wave1 = Math.sin(t + x * 0.8) * 0.5;
          const wave2 = Math.sin(t * 0.7 + y * 0.6) * 0.5;
          const combined = (wave1 + wave2 + 2) / 4;

          // Color que va de 20 a 100
          const color = Math.floor(combined * 80) + 20;
          colors[gridIndex] = color;
        }
      }
      break;
    }
    case 'rainbow': {
      // ROTATING RAINBOW using the entire 8x8 grid
      const t = Date.now() / 100;
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const gridIndex = y * GRID_SIZE + x;
          const hue = (x + y + t * 0.01) % 8;
          const colors_palette = [15, 30, 45, 60, 75, 90, 105, 120];
          const color = colors_palette[Math.floor(hue)];
          colors[gridIndex] = color;
        }
      }
      break;
    }
    case 'snake': {
      // MOVING SNAKE EFFECT covering the entire 8x8 grid
      const t = Date.now() / 150;
      const snakeLength = 12;

      // Inicializar todo el grid a 0
      colors.fill(0);

      for (let i = 0; i < snakeLength; i++) {
        const phase = (t + i * 0.5) % (Math.PI * 4);

        // Calculate position in the 8x8 grid
        let x = Math.floor((Math.sin(phase) + 1) * (GRID_SIZE - 1) / 2);
        let y = Math.floor((Math.cos(phase * 0.7) + 1) * (GRID_SIZE - 1) / 2);

        // Ensure it is inside the 8x8 grid
        x = Math.max(0, Math.min(GRID_SIZE - 1, x));
        y = Math.max(0, Math.min(GRID_SIZE - 1, y));

        const gridIndex = y * GRID_SIZE + x;
        const intensity = Math.floor(((snakeLength - i) / snakeLength) * 100) + 20;

        // Only update if the new color is brighter
        if (colors[gridIndex] < intensity) {
          colors[gridIndex] = intensity;
        }
      }
      break;
    }
    case 'custom-text': {
      const message = (options?.text || '').toUpperCase();
      if (!message) break;

      if (!textCanvas) {
        textCanvas = document.createElement('canvas');
        textCanvas.height = GRID_SIZE;
      }
      const ctx = textCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) break;

      ctx.font = '8px monospace';
      const textWidth = Math.ceil(ctx.measureText(message).width);
      textCanvas.width = textWidth + GRID_SIZE;
      ctx.clearRect(0, 0, textCanvas.width, GRID_SIZE);
      ctx.fillStyle = '#fff';
      ctx.fillText(message, 0, 7);
      const img = ctx.getImageData(0, 0, textCanvas.width, GRID_SIZE).data;
      const shift = Math.floor((Date.now() / 100) % textCanvas.width);
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const srcX = (x + shift) % textCanvas.width;
          const idx = (y * textCanvas.width + srcX) * 4;
          const v = img[idx];
          colors[y * GRID_SIZE + x] = v > 128 ? 100 : 0;
        }
      }
      break;
    }
    default: {
      console.warn(`Unknown preset: ${preset}, returning empty grid`);
      break;
    }
  }

  // 🔥 FINAL CHECK: ensure we always return exactly 64 elements
  if (colors.length !== GRID_LEN) {
    console.error(`❌ CRITICAL ERROR: buildLaunchpadFrame returns ${colors.length} elements, must be 64!`);
    return new Array(GRID_LEN).fill(0); // Safe fallback
  }

  // Debug: show statistics of the generated frame
  const activeCount = colors.filter(c => c > 0).length;
  const maxValue = Math.max(...colors);
  console.log(`🎹 Launchpad frame [${preset}]: ${activeCount}/64 active pads, max=${maxValue}`);

  return colors;
}
