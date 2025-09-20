import { AudioData } from '../core/PresetLoader';

/**
 * Calculates average intensity of the audio spectrum.
 */
export function getIntensity(audio: AudioData): number {
  return (audio.low + audio.mid + audio.high) / 3;
}

/**
 * Adds an effect class to the canvas for a limited duration.
 */
export function triggerEffect(
  canvas: HTMLCanvasElement,
  effectClass: string,
  duration: number
): void {
  canvas.classList.add(effectClass);
  setTimeout(() => canvas.classList.remove(effectClass), duration);
}
