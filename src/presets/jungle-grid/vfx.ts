import { AudioData } from '../../core/PresetLoader';
import { triggerEffect } from '../../utils/vfx';

const glitches = ['effect-glitch1', 'effect-glitch2', 'effect-glitch3'];

export function triggerClipFlash(canvas: HTMLCanvasElement): void {
  if (!canvas.classList.contains('vfx-flash')) return;
  triggerEffect(canvas, 'effect-flash', 300);
}

export function applyVFX(canvas: HTMLCanvasElement, audio: AudioData): void {
  if (canvas.classList.contains('vfx-glitch') && audio.high > 0.8) {
    const cls = glitches[Math.floor(Math.random() * glitches.length)];
    triggerEffect(canvas, cls, 500);
  }
}
