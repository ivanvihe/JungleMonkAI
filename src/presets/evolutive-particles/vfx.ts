import { AudioData } from '../../core/PresetLoader';
import { getIntensity, triggerEffect } from '../../utils/vfx';

const glitches = ['effect-glitch1', 'effect-glitch2', 'effect-glitch3'];

export function applyVFX(canvas: HTMLCanvasElement, audio: AudioData): void {
  const intensity = getIntensity(audio);
  if (canvas.classList.contains('vfx-flash') && intensity > 0.95) {
    triggerEffect(canvas, 'effect-flash', 300);
  }
  if (canvas.classList.contains('vfx-glitch') && audio.high > 0.8) {
    const cls = glitches[Math.floor(Math.random() * glitches.length)];
    triggerEffect(canvas, cls, 500);
  }
  if (canvas.classList.contains('vfx-blur') && intensity > 0.7) {
    triggerEffect(canvas, 'effect-blur', 500);
  }
}
