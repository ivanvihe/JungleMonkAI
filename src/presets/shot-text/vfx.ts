import { AudioData } from '../../core/PresetLoader';
import { getIntensity, triggerEffect } from '../../utils/vfx';

const glitches = ['effect-glitch1', 'effect-glitch2', 'effect-glitch3'];

export function applyVFX(canvas: HTMLCanvasElement, audio: AudioData): void {
  const intensity = getIntensity(audio);
  if (canvas.classList.contains('vfx-flash') && intensity > 0.9) {
    triggerEffect(canvas, 'effect-flash', 300);
  }
  if (canvas.classList.contains('vfx-glitch') && audio.high > 0.85) {
    const cls = glitches[Math.floor(Math.random() * glitches.length)];
    triggerEffect(canvas, cls, 500);
  }
  if (canvas.classList.contains('vfx-blur') && intensity > 0.8) {
    triggerEffect(canvas, 'effect-blur', 500);
  }
  if (canvas.classList.contains('vfx-distortion') && intensity > 0.7) {
    triggerEffect(canvas, 'effect-distortion', 600);
  }
  if (canvas.classList.contains('vfx-lightning') && audio.high > 0.9) {
    triggerEffect(canvas, 'effect-lightning', 300);
  }
  if (canvas.classList.contains('vfx-scanlines')) {
    canvas.classList.add('effect-scanlines');
  }
}
