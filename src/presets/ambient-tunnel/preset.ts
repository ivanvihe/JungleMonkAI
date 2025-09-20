import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';

export const config: PresetConfig = {
  name: 'Ambient Tunnel',
  description: 'Slow moving neon tunnel for drone backgrounds',
  author: 'AudioVisualizer',
  version: '1.0.0',
  category: 'background',
  tags: ['ambient','tunnel','background'],
  thumbnail: 'ambient_tunnel_thumb.png',
  note: 70,
  defaultConfig: {
    speed: 0.5,
    color: '#3366ff',
    height: 5
  },
  controls: [
    { name: 'speed', type: 'slider', label: 'Speed', min: 0.1, max: 2.0, step: 0.1, default: 0.5 },
    { name: 'color', type: 'color', label: 'Color', default: '#3366ff' },
    { name: 'height', type: 'slider', label: 'Tunnel Radius', min: 2, max: 10, step: 0.5, default: 5 }
  ],
  audioMapping: {},
  performance: { complexity: 'low', recommendedFPS: 60, gpuIntensive: false }
};

class AmbientTunnelPreset extends BasePreset {
  private rings: THREE.Mesh[] = [];
  private currentConfig: any;

  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, cfg: PresetConfig) {
    super(scene, camera, renderer, cfg);
    this.currentConfig = { ...cfg.defaultConfig };
  }

  init(): void {
    for (let i = 0; i < 20; i++) {
      const geo = new THREE.TorusGeometry(1, 0.05, 16, 64);
      const mat = new THREE.MeshBasicMaterial({ color: this.currentConfig.color, transparent: true, opacity: 0.3 });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = Math.PI / 2;
      ring.scale.setScalar(this.currentConfig.height);
      ring.position.z = -i * 2;
      this.scene.add(ring);
      this.rings.push(ring);
    }
  }

  update(): void {
    const delta = this.clock.getDelta();
    this.rings.forEach(r => {
      r.position.z += this.currentConfig.speed * delta * 2;
      if (r.position.z > 2) r.position.z = -40;
    });
  }

  updateConfig(newConfig: any): void {
    this.currentConfig = { ...this.currentConfig, ...newConfig };
    if (newConfig.color) {
      this.rings.forEach(r => (r.material as THREE.MeshBasicMaterial).color.set(newConfig.color));
    }
    if (newConfig.height !== undefined) {
      this.rings.forEach(r => r.scale.setScalar(this.currentConfig.height));
    }
  }

  dispose(): void {
    this.rings.forEach(r => {
      this.scene.remove(r);
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    });
    this.rings = [];
  }
}

export function createPreset(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  cfg: PresetConfig,
  shaderCode?: string
): BasePreset {
  return new AmbientTunnelPreset(scene, camera, renderer, cfg);
}
