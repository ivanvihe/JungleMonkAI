import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';

export const config: PresetConfig = {
  name: 'Soft Flare',
  description: 'Gentle fullscreen flare that fades quickly',
  author: 'AudioVisualizer',
  version: '1.0.0',
  category: 'one-shot',
  tags: ['flare', 'flash', 'one-shot'],
  thumbnail: 'soft_flare_thumb.png',
  note: 63,
  defaultConfig: {
    opacity: 1.0,
    duration: 1.0,
    color: '#e0f7ff'
  },
  controls: [
    { name: 'color', type: 'color', label: 'Color', default: '#e0f7ff' },
    { name: 'duration', type: 'slider', label: 'Duration', min: 0.5, max: 2, step: 0.1, default: 1.0 }
  ],
  audioMapping: {
    low: { description: 'Controls brightness', frequency: '20-250 Hz', effect: 'Intensity' },
    mid: { description: 'Modulates radius', frequency: '250-4000 Hz', effect: 'Radius' },
    high: { description: 'Adds sparkle', frequency: '4000+ Hz', effect: 'Sparkle' }
  },
  performance: { complexity: 'low', recommendedFPS: 60, gpuIntensive: false }
};

class SoftFlarePreset extends BasePreset {
  private mesh!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private start = 0;
  private currentConfig: any;

  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, cfg: PresetConfig) {
    super(scene, camera, renderer, cfg);
  }

  public init(): void {
    this.currentConfig = JSON.parse(JSON.stringify(this.config.defaultConfig));

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uColor: { value: new THREE.Color(this.currentConfig.color) },
        uProgress: { value: 0 },
        uCenter: { value: new THREE.Vector2(Math.random(), Math.random()) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uProgress;
        uniform vec2 uCenter;
        void main(){
          float dist = length(vUv - uCenter);
          float alpha = smoothstep(0.5, 0.0, dist) * (1.0 - uProgress);
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);
    this.start = this.clock.getElapsedTime();
  }

  public update(): void {
    const t = this.clock.getElapsedTime();
    const progress = (t - this.start) / this.currentConfig.duration;
    const mat = this.mesh.material as THREE.ShaderMaterial;
    mat.uniforms.uProgress.value = progress;
    if (progress > 1) {
      this.dispose();
    }
  }

  public updateConfig(newConfig: any): void {
    this.currentConfig = { ...this.currentConfig, ...newConfig };
    if (newConfig.color) {
      (this.mesh.material as THREE.ShaderMaterial).uniforms.uColor.value = new THREE.Color(newConfig.color);
    }
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export function createPreset(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  cfg: PresetConfig,
  shaderCode?: string
): BasePreset {
  return new SoftFlarePreset(scene, camera, renderer, cfg);
}
