import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';

export const config: PresetConfig = {
  name: 'Empty',
  description: 'Renders nothing; placeholder preset',
  author: 'AudioVisualizer',
  version: '1.0.0',
  category: 'utility',
  tags: ['empty', 'placeholder'],
  defaultConfig: {
    opacity: 0
  },
  controls: [],
  audioMapping: {
    low: { description: 'No effect', frequency: '20-250 Hz', effect: 'None' },
    mid: { description: 'No effect', frequency: '250-4000 Hz', effect: 'None' },
    high: { description: 'No effect', frequency: '4000+ Hz', effect: 'None' }
  },
  performance: { complexity: 'low', recommendedFPS: 60, gpuIntensive: false }
};

class EmptyPreset extends BasePreset {
  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, cfg: PresetConfig) {
    super(scene, camera, renderer, cfg);
  }

  public init(): void {}
  public update(): void {}
  public dispose(): void {}
}

export function createPreset(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  cfg: PresetConfig,
  shaderCode?: string
): BasePreset {
  return new EmptyPreset(scene, camera, renderer, cfg);
}
