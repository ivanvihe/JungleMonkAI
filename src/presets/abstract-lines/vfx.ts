import { AudioData } from '../../core/PresetLoader';
import { getIntensity, triggerEffect } from '../../utils/vfx';

export function applyVFX(canvas: HTMLCanvasElement, audio: AudioData): void {
  const intensity = getIntensity(audio);
  if (intensity > 0.95) {
    triggerEffect(canvas, 'effect-flash', 300);
  }
}
