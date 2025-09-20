import { describe, it, expect } from 'vitest';
import { getPresetThumbnail } from '../presetThumbnails';
import type { LoadedPreset } from '../../core/PresetLoader';

describe('getPresetThumbnail', () => {
  it('returns specific icon for known preset', () => {
    const preset = { id: 'neural_network', name: '', config: {} } as LoadedPreset;
    expect(getPresetThumbnail(preset)).toBe('🧠');
  });

  it('falls back to generic icon', () => {
    const preset = { id: 'unknown', name: '', config: {} } as LoadedPreset;
    expect(getPresetThumbnail(preset)).toBe('🎨');
  });
});
