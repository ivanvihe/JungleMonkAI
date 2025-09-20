import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';

export const config: PresetConfig = {
  name: 'Custom Glitch Text',
  description: 'Text with configurable glitch effect',
  author: 'AudioVisualizer',
  version: '1.1.0',
  category: 'text',
  tags: ['text', 'glitch', 'one-shot'],
  thumbnail: 'custom_glitch_text_thumb.png',
  note: 59,
  defaultConfig: {
    opacity: 1.0,
    fadeMs: 200,
    effect: 'jitter',
    text: {
      content: 'TEXT',
      fontSize: 120,
      fontFamily: 'Arial Black, sans-serif',
      letterSpacing: 0.2
    },
    glitch: {
      intensity: 0.05,
      frequency: 2.0
    },
    effects: {
      glowIntensity: 1.2,
      pulseSpeed: 2.0
    },
    color: '#ffffff'
  },
  controls: [
    { name: 'text.content', type: 'text', label: 'Text', default: 'TEXT' },
    { name: 'text.fontSize', type: 'slider', label: 'Font Size', min: 40, max: 200, step: 10, default: 120 },
    { name: 'glitch.intensity', type: 'slider', label: 'Glitch Intensity', min: 0, max: 0.5, step: 0.01, default: 0.05 },
    { name: 'glitch.frequency', type: 'slider', label: 'Glitch Frequency', min: 0, max: 10, step: 0.1, default: 2.0 },
    { name: 'effects.glowIntensity', type: 'slider', label: 'Glow', min: 0, max: 3, step: 0.1, default: 1.2 },
    { name: 'effects.pulseSpeed', type: 'slider', label: 'Pulse Speed', min: 0.5, max: 5, step: 0.1, default: 2.0 },
    { name: 'effect', type: 'select', label: 'Effect', options: ['jitter', 'robotica'], default: 'jitter' },
    { name: 'color', type: 'color', label: 'Color', default: '#ffffff' }
  ],
  audioMapping: {
    low: { description: 'Slight scale bump', frequency: '20-250 Hz', effect: 'Scale' },
    mid: { description: 'Glitch trigger', frequency: '250-4000 Hz', effect: 'Glitch randomness' },
    high: { description: 'Color flicker', frequency: '4000+ Hz', effect: 'Color shift' }
  },
  performance: { complexity: 'low', recommendedFPS: 60, gpuIntensive: false }
};

class CinematicLetter {
  public mesh: THREE.Mesh;
  public glow: THREE.Mesh;
  private texture: THREE.Texture;
  private material: THREE.ShaderMaterial;
  private glowMaterial: THREE.MeshBasicMaterial;
  private startOffset: number;
  private pulseOffset: number;

  constructor(char: string, fontSize: number, fontFamily: string, position: THREE.Vector3, color: string, index: number) {
    const canvas = document.createElement('canvas');
    canvas.width = fontSize * 1.5;
    canvas.height = fontSize * 1.5;
    const ctx = canvas.getContext('2d')!;
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(char, canvas.width / 2, canvas.height / 2);

    this.texture = new THREE.Texture(canvas);
    this.texture.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTexture: { value: this.texture },
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(color) }
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
        uniform sampler2D uTexture;
        uniform float uOpacity;
        uniform vec3 uColor;
        void main(){
          vec4 t = texture2D(uTexture, vUv);
          if(t.a < 0.1) discard;
          gl_FragColor = vec4(uColor, t.a * uOpacity);
        }
      `
    });
    const geometry = new THREE.PlaneGeometry(canvas.width/100, canvas.height/100);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.copy(position);
    this.glowMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
    this.glow = new THREE.Mesh(geometry.clone(), this.glowMaterial);
    this.glow.scale.setScalar(1.4);
    this.glow.position.copy(position);
    this.startOffset = index * 0.1;
    this.pulseOffset = Math.random() * Math.PI * 2;
  }

  update(time: number, color: string, glowIntensity: number, pulseSpeed: number): void {
    const progress = THREE.MathUtils.clamp((time - this.startOffset) / 0.5, 0, 1);
    const pulse = 0.8 + 0.4 * Math.sin(time * pulseSpeed + this.pulseOffset);
    this.material.uniforms.uOpacity.value = progress;
    this.material.uniforms.uColor.value.set(color);
    this.glowMaterial.color.set(color);
    this.glowMaterial.opacity = progress * glowIntensity * pulse;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.glow.geometry.dispose();
    this.glowMaterial.dispose();
  }
}

class CustomGlitchTextPreset extends BasePreset {
  private group!: THREE.Group;
  private mesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D;
  private texture?: THREE.Texture;
  private letters: CinematicLetter[] = [];
  private currentConfig: any;
  private start = 0;

  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, cfg: PresetConfig) {
    super(scene, camera, renderer, cfg);
  }

  public init(): void {
    this.currentConfig = JSON.parse(JSON.stringify(this.config.defaultConfig));
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.buildEffect();
  }

  private buildEffect(): void {
    this.disposeMeshes();
    if (this.currentConfig.effect === 'robotica') {
      this.buildRobotica();
    } else {
      this.buildGlitch();
    }
  }

  private buildGlitch(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.Texture(this.canvas);
    this.texture.needsUpdate = true;
    const cam = this.camera as THREE.PerspectiveCamera;
    const distance = cam.position.z;
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
    const visibleWidth = visibleHeight * cam.aspect;
    const planeHeight = visibleWidth / 4; // mantener proporcion 4:1 del canvas
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(visibleWidth, planeHeight),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, color: new THREE.Color(this.currentConfig.color) })
    );
    this.group.add(this.mesh);
    this.updateCanvas();
  }

  private buildRobotica(): void {
    this.letters = [];
    const { content, fontSize, fontFamily, letterSpacing } = this.currentConfig.text;
    const totalWidth = content.length * (fontSize/100 + letterSpacing);
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const x = i * (fontSize/100 + letterSpacing) - totalWidth/2;
      const letter = new CinematicLetter(char, fontSize, fontFamily, new THREE.Vector3(x,0,0), this.currentConfig.color, i);
      this.group.add(letter.mesh);
      this.group.add(letter.glow);
      this.letters.push(letter);
    }
    const cam = this.camera as THREE.PerspectiveCamera;
    const distance = cam.position.z;
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
    const visibleWidth = visibleHeight * cam.aspect;
    const scale = visibleWidth / totalWidth;
    this.group.scale.set(scale, scale, 1);
    this.start = this.clock.getElapsedTime();
  }

  private updateCanvas(): void {
    if (!this.ctx || !this.canvas) return;
    const { content, fontSize, fontFamily } = this.currentConfig.text;
    this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(content, this.canvas.width/2, this.canvas.height/2);
    this.texture!.needsUpdate = true;
  }

  private applyCanvasGlitch(): void {
    if (!this.ctx || !this.canvas) return;
    const slices = 6;
    for (let i = 0; i < slices; i++) {
      const y = Math.random() * this.canvas.height;
      const h = Math.random() * 20;
      const offset = (Math.random() - 0.5) * 40;
      this.ctx.drawImage(this.canvas, 0, y, this.canvas.width, h, offset, y, this.canvas.width, h);
    }
    this.texture!.needsUpdate = true;
  }

  public update(): void {
    if (this.currentConfig.effect === 'robotica') {
      const t = this.clock.getElapsedTime() - this.start;
      const { glowIntensity, pulseSpeed } = this.currentConfig.effects;
      this.letters.forEach(l => l.update(t, this.currentConfig.color, glowIntensity, pulseSpeed));
    } else {
      const delta = this.clock.getDelta();
      const { intensity, frequency } = this.currentConfig.glitch;
      if (Math.random() < frequency * delta) {
        this.mesh!.position.x = (Math.random() - 0.5) * intensity;
        this.mesh!.position.y = (Math.random() - 0.5) * intensity;
        this.mesh!.material.color.setHSL(Math.random(), 1, 0.5);
        this.applyCanvasGlitch();
      } else {
        this.mesh!.position.set(0,0,0);
        this.mesh!.material.color.set(this.currentConfig.color);
        this.updateCanvas();
      }
      const scaleBump = 1 + this.audioData.low * 0.1;
      this.group.scale.setScalar(scaleBump);
    }
  }

  public updateConfig(newConfig: any): void {
    this.currentConfig = this.deepMerge(this.currentConfig, newConfig);
    if (newConfig.text || newConfig.effect) {
      this.buildEffect();
    } else if (newConfig.color || newConfig.effects) {
      if (this.currentConfig.effect === 'robotica') {
        const t = this.clock.getElapsedTime() - this.start;
        const { glowIntensity, pulseSpeed } = this.currentConfig.effects;
        this.letters.forEach(l => l.update(t, this.currentConfig.color, glowIntensity, pulseSpeed));
      } else {
        if (newConfig.color) {
          this.mesh!.material.color.set(newConfig.color);
        }
        this.updateCanvas();
      }
    }
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  private disposeMeshes(): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = undefined;
    }
    this.letters.forEach(l => { this.group.remove(l.mesh); this.group.remove(l.glow); l.dispose(); });
    this.letters = [];
    if (this.texture) this.texture.dispose();
  }

  public dispose(): void {
    this.disposeMeshes();
    this.scene.remove(this.group);
  }
}

export function createPreset(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  cfg: PresetConfig,
  shaderCode?: string
): BasePreset {
  return new CustomGlitchTextPreset(scene, camera, renderer, cfg);
}
