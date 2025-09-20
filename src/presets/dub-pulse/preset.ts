import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';

export const config: PresetConfig = {
  name: 'Dub Pulse',
  description: 'Bass driven expanding ring',
  author: 'AudioVisualizer',
  version: '1.0.0',
  category: 'audio-reactive',
  tags: ['dub','pulse','ring'],
  thumbnail: 'dub_pulse_thumb.png',
  note: 73,
  defaultConfig: {
    color: '#66ff99'
  },
  controls: [
    { name: 'color', type: 'color', label: 'Color', default: '#66ff99' }
  ],
  audioMapping: {
    low: { description: 'Bass energy', frequency: '20-250 Hz', effect: 'Ring scale' }
  },
  performance: { complexity: 'low', recommendedFPS: 60, gpuIntensive: false }
};

class DubPulsePreset extends BasePreset {
  private ring!: THREE.Mesh;
  private currentConfig: any;

  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, cfg: PresetConfig) {
    super(scene, camera, renderer, cfg);
    this.currentConfig = { ...cfg.defaultConfig };
  }

  init(): void {
    const geo = new THREE.RingGeometry(0.5, 0.52, 64);
    const mat = new THREE.MeshBasicMaterial({ color: this.currentConfig.color, transparent: true, opacity: 0.5 });
    this.ring = new THREE.Mesh(geo, mat);
    this.ring.rotation.x = Math.PI / 2;
    this.scene.add(this.ring);
  }

  update(): void {
    const scale = 1 + this.audioData.low * 4;
    this.ring.scale.setScalar(scale);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.2 + this.audioData.low * 0.8;
    this.ring.rotation.z += 0.01;
  }

  updateConfig(newConfig: any): void {
    this.currentConfig = { ...this.currentConfig, ...newConfig };
    if (newConfig.color) {
      (this.ring.material as THREE.MeshBasicMaterial).color.set(newConfig.color);
    }
  }

  dispose(): void {
    this.scene.remove(this.ring);
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
  }
}

export function createPreset(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  cfg: PresetConfig,
  shaderCode?: string
): BasePreset {
  return new DubPulsePreset(scene, camera, renderer, cfg);
}
