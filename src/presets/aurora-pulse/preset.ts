import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';

export const config: PresetConfig = {
  name: 'Aurora Pulse',
  description: 'Soft abstract burst fading gently',
  author: 'AudioVisualizer',
  version: '1.0.0',
  category: 'one-shot',
  tags: ['aurora', 'pulse', 'one-shot'],
  thumbnail: 'heart_beat_thumb.png',
  note: 62,
  defaultConfig: {
    opacity: 1.0,
    duration: 2.0,
    color: '#a0e8ff'
  },
  controls: [
    { name: 'color', type: 'color', label: 'Color', default: '#a0e8ff' },
    { name: 'duration', type: 'slider', label: 'Duration', min: 0.5, max: 3, step: 0.1, default: 2.0 }
  ],
  audioMapping: {
    low: { description: 'Slight expansion', frequency: '20-250 Hz', effect: 'Radius' },
    mid: { description: 'Color drift', frequency: '250-4000 Hz', effect: 'Hue' },
    high: { description: 'Sparkle', frequency: '4000+ Hz', effect: 'Sparkle' }
  },
  performance: { complexity: 'low', recommendedFPS: 60, gpuIntensive: false }
};

class AuroraPulsePreset extends BasePreset {
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
        uTime: { value: 0 }
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
        uniform float uTime;
        void main(){
          vec2 center = vec2(0.5);
          float dist = length(vUv - center);
          float angle = atan(vUv.y-center.y, vUv.x-center.x);
          float wave = sin(angle*6.0 + uTime*2.0)*0.02;
          float alpha = smoothstep(0.5+wave, 0.0, dist) * (1.0 - uProgress);
          vec3 col = mix(uColor, vec3(1.0), dist*0.3);
          gl_FragColor = vec4(col, alpha);
        }
      `
    });
    this.mesh = new THREE.Mesh(geometry, material);

    // Posicionar el pulso en un lugar aleatorio cada vez
    const randX = (Math.random() - 0.5) * 6;
    const randY = (Math.random() - 0.5) * 4;
    this.mesh.position.set(randX, randY, 0);

    this.scene.add(this.mesh);
    this.start = this.clock.getElapsedTime();
  }

  public update(): void {
    const t = this.clock.getElapsedTime();
    const progress = (t - this.start) / this.currentConfig.duration;
    const mat = this.mesh.material as THREE.ShaderMaterial;
    mat.uniforms.uProgress.value = progress;
    mat.uniforms.uTime.value = t - this.start;
    if (progress > 1) {
      this.dispose();
    }
  }

  public updateConfig(newConfig: any): void {
    this.currentConfig = { ...this.currentConfig, ...newConfig };
    const mat = this.mesh?.material as THREE.ShaderMaterial;
    if (newConfig.color && mat) {
      mat.uniforms.uColor.value = new THREE.Color(newConfig.color);
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
  return new AuroraPulsePreset(scene, camera, renderer, cfg);
}
