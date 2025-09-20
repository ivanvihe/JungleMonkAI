import { AudioData } from '../../core/PresetLoader';
import { triggerEffect } from '../../utils/vfx';

export function applyVFX(canvas: HTMLCanvasElement, audio: AudioData): void {
  if (audio.mid > 0.85) {
    triggerEffect(canvas, 'effect-blur', 400);
  }
}
