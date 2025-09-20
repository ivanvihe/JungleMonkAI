import { LoadedPreset } from '../core/PresetLoader';

const PRESET_THUMBNAILS: Record<string, string> = {
  neural_network: '🧠',
  'abstract-lines': '📈',
  'abstract-lines-pro': '📊',
  'abstract-shapes': '🔷',
  'evolutive-particles': '✨',
  'boom-wave': '💥',
  'plasma-ray': '⚡',
  'shot-text': '📝',
  'text-glitch': '🔤',
  'custom-glitch-text': '📝'
};

export function getPresetThumbnail(preset: LoadedPreset): string {
  return (
    PRESET_THUMBNAILS[preset.id] ||
    PRESET_THUMBNAILS[preset.id.split('-')[0]] ||
    '🎨'
  );
}

