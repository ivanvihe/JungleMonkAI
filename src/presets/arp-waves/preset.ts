import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';

export const config: PresetConfig = {
  name: 'ARP Waves',
  description: 'Vertical bars reacting to arpeggios',
  author: 'AudioVisualizer',
  version: '1.0.0',
  category: 'audio-reactive',
  tags: ['arp','bars','audio'],
  thumbnail: 'arp_waves_thumb.png',
  note: 72,
  defaultConfig: {
    barCount: 16,
    color: '#00ffcc'
  },
  controls: [
    { name: 'barCount', type: 'slider', label: 'Bars', min: 8, max: 32, step: 1, default: 16 },
    { name: 'color', type: 'color', label: 'Color', default: '#00ffcc' }
  ],
  audioMapping: {
    fft: { description: 'FFT energy', frequency: '20-22050 Hz', effect: 'Bar height' }
  },
  performance: { complexity: 'low', recommendedFPS: 60, gpuIntensive: false }
};

class ArpWavesPreset extends BasePreset {
  private bars: THREE.Mesh[] = [];
  private currentConfig: any;

  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, cfg: PresetConfig) {
    super(scene, camera, renderer, cfg);
    this.currentConfig = { ...cfg.defaultConfig };
  }

  init(): void {
    this.createBars();
  }

  private createBars(): void {
    this.bars.forEach(b => { this.scene.remove(b); b.geometry.dispose(); (b.material as THREE.Material).dispose(); });
    this.bars = [];
    const spacing = 0.15;
    for (let i = 0; i < this.currentConfig.barCount; i++) {
      const geo = new THREE.BoxGeometry(0.1, 1, 0.1);
      const mat = new THREE.MeshBasicMaterial({ color: this.currentConfig.color });
      const bar = new THREE.Mesh(geo, mat);
      bar.position.x = (i - this.currentConfig.barCount / 2) * spacing;
      bar.position.y = 0.5;
      this.scene.add(bar);
      this.bars.push(bar);
    }
  }

  update(): void {
    const fft = this.audioData.fft;
    const step = Math.floor(fft.length / this.bars.length);
    this.bars.forEach((bar, i) => {
      const amp = fft[i * step] || 0;
      const h = 0.1 + amp * 3;
      bar.scale.y = h;
      bar.position.y = h / 2;
    });
  }

  updateConfig(newConfig: any): void {
    const needRebuild = newConfig.barCount && newConfig.barCount !== this.currentConfig.barCount;
    this.currentConfig = { ...this.currentConfig, ...newConfig };
    if (needRebuild) {
      this.createBars();
    } else if (newConfig.color) {
      this.bars.forEach(b => (b.material as THREE.MeshBasicMaterial).color.set(newConfig.color));
    }
  }

  dispose(): void {
    this.bars.forEach(b => {
      this.scene.remove(b);
      b.geometry.dispose();
      (b.material as THREE.Material).dispose();
    });
    this.bars = [];
  }
}

export function createPreset(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  cfg: PresetConfig,
  shaderCode?: string
): BasePreset {
  return new ArpWavesPreset(scene, camera, renderer, cfg);
}
