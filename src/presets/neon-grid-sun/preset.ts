import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';

export const config: PresetConfig = {
  name: 'Particle Grid Sun',
  description: 'Neon particles with radial lines forming a solar grid',
  author: 'AudioVisualizer',
  version: '1.0.0',
  category: 'abstract',
  tags: ['particles', 'lines', 'sun'],
  thumbnail: 'particle_grid_sun_thumb.png',
  note: 71,
  defaultConfig: {
    particleColor: '#ffcc00',
    lineColor: '#ff00ff',
    rotationSpeed: 0.2
  },
  controls: [
    { name: 'particleColor', type: 'color', label: 'Particle Color', default: '#ffcc00' },
    { name: 'lineColor', type: 'color', label: 'Line Color', default: '#ff00ff' },
    { name: 'rotationSpeed', type: 'slider', label: 'Rotation Speed', min: 0.0, max: 1.0, step: 0.05, default: 0.2 }
  ],
  audioMapping: {
    low: { description: 'Pulses particle size', frequency: '20-250 Hz', effect: 'Particle scaling' },
    high: { description: 'Boosts line brightness', frequency: '4000+ Hz', effect: 'Line opacity' }
  },
  performance: { complexity: 'low', recommendedFPS: 60, gpuIntensive: false }
};

class ParticleGridSunPreset extends BasePreset {
  private particles!: THREE.Points;
  private lines!: THREE.LineSegments;
  private currentConfig: any;
  private particleGeometry!: THREE.BufferGeometry;
  private lineGeometry!: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, cfg: PresetConfig) {
    super(scene, camera, renderer, cfg);
    this.currentConfig = { ...cfg.defaultConfig };
  }

  init(): void {
    const count = 100;
    const radius = 3;

    const positions = new Float32Array(count * 3);
    const linePositions = new Float32Array(count * 2 * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const z = 0;
      positions.set([x, y, z], i * 3);
      linePositions.set([0, 0, 0, x, y, z], i * 6);
    }

    this.particleGeometry = new THREE.BufferGeometry();
    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({ color: this.currentConfig.particleColor, size: 0.1 });
    this.particles = new THREE.Points(this.particleGeometry, pMat);

    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const lMat = new THREE.LineBasicMaterial({ color: this.currentConfig.lineColor, transparent: true, opacity: 0.3 });
    this.lines = new THREE.LineSegments(this.lineGeometry, lMat);

    this.scene.add(this.particles);
    this.scene.add(this.lines);
  }

  update(): void {
    const delta = this.clock.getDelta();
    const rotation = this.currentConfig.rotationSpeed * delta;
    this.particles.rotation.z += rotation;
    this.lines.rotation.z += rotation;

    const pMat = this.particles.material as THREE.PointsMaterial;
    pMat.size = 0.1 + this.audioData.low * 0.2;

    const lMat = this.lines.material as THREE.LineBasicMaterial;
    lMat.opacity = 0.3 + this.audioData.high * 0.5;
  }

  updateConfig(newConfig: any): void {
    this.currentConfig = { ...this.currentConfig, ...newConfig };
    if (newConfig.particleColor) {
      (this.particles.material as THREE.PointsMaterial).color.set(newConfig.particleColor);
    }
    if (newConfig.lineColor) {
      (this.lines.material as THREE.LineBasicMaterial).color.set(newConfig.lineColor);
    }
  }

  dispose(): void {
    this.scene.remove(this.particles);
    this.scene.remove(this.lines);
    this.particleGeometry.dispose();
    this.lineGeometry.dispose();
    (this.particles.material as THREE.Material).dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}

export function createPreset(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  cfg: PresetConfig,
  shaderCode?: string
): BasePreset {
  return new ParticleGridSunPreset(scene, camera, renderer, cfg);
}
