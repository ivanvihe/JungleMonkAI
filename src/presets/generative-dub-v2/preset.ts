import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';
import { applyVFX } from './vfx';

export const config: PresetConfig = {
  name: 'Generative Dub V2',
  description:
    'Smooth evolving abstract lines and forms reacting gently to audio FFT.',
  author: 'AudioVisualizer',
  version: '2.0.0',
  category: 'generative',
  tags: [
    'auto',
    'infinite',
    'dub',
    'abstract',
    'audio-reactive',
    'fft',
    'lines',
    'cold',
    'grayscale'
  ],
  thumbnail: 'generative_dub_v2_thumb.png',
  defaultConfig: {
    opacity: 1.0
  },
  controls: [],
  audioMapping: {
    low: {
      description: 'Subtle color shift',
      frequency: '20-250 Hz',
      effect: 'Color warmth'
    },
    mid: {
      description: 'Smooth movement variations',
      frequency: '250-4000 Hz',
      effect: 'Motion'
    },
    high: {
      description: 'Adds soft detail',
      frequency: '4000+ Hz',
      effect: 'Texture'
    },
    fft: {
      description: 'Gently scales patterns',
      frequency: 'full spectrum',
      effect: 'Scale modulation'
    }
  },
  performance: { complexity: 'medium', recommendedFPS: 60, gpuIntensive: true }
};

class GenerativeDubV2Preset extends BasePreset {
  private mesh!: THREE.Mesh;
  private currentConfig: any;
  private lastChange = 0;
  private changeInterval = 60 + Math.random() * 60;

  private audioLow = 0;
  private audioMid = 0;
  private audioHigh = 0;
  private audioFFT = 0;
  private readonly audioSensitivity = 1.0;
  private readonly audioSmoothing = 0.2;

  private currentPattern = 0;
  private nextPattern = 0;
  private transitionStart = 0;
  private transitionDuration = 8;
  private timeOffset = Math.random() * 1000;

  private static readonly PATTERN_COUNT = 10;

  private stageOrder: number[] = [];
  private stageIndex = 0;

  private static readonly PALETTES = [
    ['#0d1b2a', '#1b263b', '#415a77'],
    ['#232526', '#414345', '#6b6b6b'],
    ['#000000', '#14213d', '#8d99ae'],
    ['#2c3e50', '#3a506b', '#5bc0be'],
    ['#1a1a1a', '#333333', '#4d4d4d']
  ].map(p => p.map(c => new THREE.Color(c)));

  public init(): void {
    this.currentConfig = JSON.parse(JSON.stringify(this.config.defaultConfig));
    const geometry = new THREE.PlaneGeometry(2, 2);

    // Ensure the plane fills the view even after other presets modify the camera
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.position.set(0, 0, 1);
      this.camera.lookAt(0, 0, 0);
      this.camera.fov = 90;
      this.camera.aspect =
        this.renderer.domElement.clientWidth /
        this.renderer.domElement.clientHeight;
      this.camera.updateProjectionMatrix();
    }

    this.stageOrder = Array.from(
      { length: GenerativeDubV2Preset.PATTERN_COUNT },
      (_, i) => i
    );
    this.shuffleStages();
    this.currentPattern = this.stageOrder[0];
    this.stageIndex = 1;
    this.nextPattern = this.stageOrder[this.stageIndex];
    
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: this.opacity },
        uParamsA: {
          value: new THREE.Vector3(
            Math.random() * 3 + 1,
            Math.random() * 5 + 1,
            Math.random() * 0.2 + 0.05
          )
        },
        uParamsB: {
          value: new THREE.Vector3(
            Math.random() * 3 + 1,
            Math.random() * 5 + 1,
            Math.random() * 0.2 + 0.05
          )
        },
        uPatternA: { value: this.currentPattern },
        uPatternB: { value: this.nextPattern },
        uBlend: { value: 0 },
        uAudioLow: { value: 0 },
        uAudioMid: { value: 0 },
        uAudioHigh: { value: 0 },
        uAudioFFT: { value: 0 },
        uColor1A: { value: new THREE.Color('#0e0e0e') },
        uColor2A: { value: new THREE.Color('#3a506b') },
        uColor3A: { value: new THREE.Color('#5bc0be') },
        uColor1B: { value: new THREE.Color('#0e0e0e') },
        uColor2B: { value: new THREE.Color('#3a506b') },
        uColor3B: { value: new THREE.Color('#5bc0be') }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uParamsA;
        uniform vec3 uParamsB;
        uniform float uPatternA;
        uniform float uPatternB;
        uniform float uBlend;
        uniform float uAudioLow;
        uniform float uAudioMid;
        uniform float uAudioHigh;
        uniform float uAudioFFT;
        uniform vec3 uColor1A;
        uniform vec3 uColor2A;
        uniform vec3 uColor3A;
        uniform vec3 uColor1B;
        uniform vec3 uColor2B;
        uniform vec3 uColor3B;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }

        float noise(vec2 p){
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        float fbm(vec2 p){
          float v = 0.0;
          float a = 0.5;
          for(int i = 0; i < 5; i++){
            v += a * noise(p);
            p *= 2.0;
            a *= 0.5;
          }
          return v;
        }

        float getPattern(float id, vec2 uv, vec3 params){
          if(id < 0.5){
            // wave interference
            vec2 p = uv * 3.0;
            return 0.5 + 0.5 * sin(p.x + uTime) * cos(p.y - uTime);
          } else if(id < 1.5){
            // polar spiral
            vec2 p = uv - 0.5;
            float r = length(p);
            float a = atan(p.y, p.x);
            return abs(sin(10.0 * r - a * 4.0 + uTime));
          } else if(id < 2.5){
            // noisy grid
            vec2 p = uv * 4.0;
            p += vec2(fbm(p + uTime), fbm(p - uTime));
            vec2 g = abs(fract(p) - 0.5);
            return min(g.x, g.y);
          } else if(id < 3.5){
            // kaleidoscope noise
            vec2 p = uv * 2.0 - 1.0;
            p = abs(p);
            p = p.x > p.y ? p.xy : p.yx;
            return fbm(p * 3.0 + uTime);
          } else if(id < 4.5){
            // pulsing rings
            float r = length(uv - 0.5);
            float s = sin(6.2831 * r * 5.0 + uTime + uAudioLow * 5.0);
            return 0.5 + 0.5 * s;
          } else if(id < 5.5){
            // voronoi cells
            vec2 p = uv * 5.0;
            vec2 i = floor(p);
            vec2 f = fract(p);
            float md = 1.0;
            for(int y=-1;y<=1;y++){
              for(int x=-1;x<=1;x++){
                vec2 g = vec2(float(x), float(y));
                vec2 o = vec2(hash(i+g), hash(i+g+vec2(2.0,8.0)));
                vec2 r = g + o - f;
                md = min(md, dot(r,r));
              }
            }
            return sqrt(md);
          } else if(id < 6.5){
            // lissajous curves
            return 0.5 + 0.5 * sin((uv.x + uTime) * 4.0) * sin((uv.y - uTime) * 3.0);
          } else if(id < 7.5){
            // diagonal stripes
            return smoothstep(-0.2, 0.2, sin((uv.x + uv.y + uTime) * 10.0));
          } else if(id < 8.5){
            // starburst
            vec2 p = uv - 0.5;
            float a = atan(p.y, p.x);
            float r = length(p);
            return abs(sin(a * 12.0 + uTime) * cos(r * 20.0 - uTime));
          } else {
            // Continuous Mandelbrot zoom
            float t = uTime * 0.05;
            float zoom = exp(t * 0.3);
            vec2 offset = vec2(-0.7 + 0.3*sin(t*0.7), 0.27015 + 0.3*cos(t*0.5));
            vec2 p = (uv - 0.5) / zoom + offset;
            vec2 z = vec2(0.0);
            float m = 0.0;
            for(int i=0;i<64;i++){
              z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + p;
              if(dot(z,z) > 4.0) break;
              m += 1.0;
            }
            return m/64.0;
          }
        }

        void main(){
          vec2 uvA = vUv * uParamsA.x * (1.0 + uAudioFFT * 0.05);
          vec2 uvB = vUv * uParamsB.x * (1.0 + uAudioFFT * 0.05);
          float pA = getPattern(uPatternA, uvA, uParamsA);
          float pB = getPattern(uPatternB, uvB, uParamsB);
          vec3 colA = mix(uColor1A, uColor2A, pA);
          colA = mix(colA, uColor3A, pA * pA);
          vec3 colB = mix(uColor1B, uColor2B, pB);
          colB = mix(colB, uColor3B, pB * pB);
          vec3 col = mix(colA, colB, uBlend);
          gl_FragColor = vec4(col, uOpacity);
        }
      `
    });

    // Inicializar uniformes de forma coherente
    const paramsA = material.uniforms.uParamsA.value as THREE.Vector3;
    const paramsB = material.uniforms.uParamsB.value as THREE.Vector3;
    paramsB.copy(paramsA);
    this.randomizePalette(material, 'A');
    const c1A = material.uniforms.uColor1A.value as THREE.Color;
    const c2A = material.uniforms.uColor2A.value as THREE.Color;
    const c3A = material.uniforms.uColor3A.value as THREE.Color;
    const c1B = material.uniforms.uColor1B.value as THREE.Color;
    const c2B = material.uniforms.uColor2B.value as THREE.Color;
    const c3B = material.uniforms.uColor3B.value as THREE.Color;
    c1B.copy(c1A);
    c2B.copy(c2A);
    c3B.copy(c3A);
    this.randomize(material);
    this.mesh = new THREE.Mesh(geometry, material);
    // Ajustar el plano para que ocupe toda la ventana según el aspect ratio actual
    const aspect =
      this.renderer.domElement.clientWidth /
      this.renderer.domElement.clientHeight;
    this.mesh.scale.set(aspect, 1, 1);
    this.scene.add(this.mesh);
    this.clock.start();
    this.lastChange = this.timeOffset;
  }

  private randomize(material: THREE.ShaderMaterial): void {
    const paramsA = material.uniforms.uParamsA.value as THREE.Vector3;
    const paramsB = material.uniforms.uParamsB.value as THREE.Vector3;
    paramsA.copy(paramsB);
    const c1A = material.uniforms.uColor1A.value as THREE.Color;
    const c2A = material.uniforms.uColor2A.value as THREE.Color;
    const c3A = material.uniforms.uColor3A.value as THREE.Color;
    const c1B = material.uniforms.uColor1B.value as THREE.Color;
    const c2B = material.uniforms.uColor2B.value as THREE.Color;
    const c3B = material.uniforms.uColor3B.value as THREE.Color;
    c1A.copy(c1B);
    c2A.copy(c2B);
    c3A.copy(c3B);
    paramsB.set(
      Math.random() * 3 + 1,
      Math.random() * 5 + 1,
      Math.random() * 0.2 + 0.05
    );
    this.randomizePalette(material, 'B');
    this.currentPattern = this.nextPattern;
    this.stageIndex = (this.stageIndex + 1) % this.stageOrder.length;
    if (this.stageIndex === 0) {
      this.shuffleStages();
    }
    this.nextPattern = this.stageOrder[this.stageIndex];
    this.transitionStart = this.clock.getElapsedTime() + this.timeOffset;
    this.transitionDuration = 5 + Math.random() * 10;
    material.uniforms.uPatternA.value = this.currentPattern;
    material.uniforms.uPatternB.value = this.nextPattern;
    material.uniforms.uBlend.value = 0;
  }

  public update(): void {
    const t = this.clock.getElapsedTime() + this.timeOffset;
    const mat = this.mesh.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value = t;

    this.audioLow = THREE.MathUtils.lerp(
      this.audioLow,
      Math.min(this.audioData.low * this.audioSensitivity, 1),
      this.audioSmoothing
    );

    this.audioMid = THREE.MathUtils.lerp(
      this.audioMid,
      Math.min(this.audioData.mid * this.audioSensitivity, 1),
      this.audioSmoothing
    );
    
    this.audioHigh = THREE.MathUtils.lerp(
      this.audioHigh,
      Math.min(this.audioData.high * this.audioSensitivity, 1),
      this.audioSmoothing
    );

    const fftAvg =
      this.audioData.fft.length > 0
        ? this.audioData.fft.reduce((a, b) => a + b, 0) /
          this.audioData.fft.length
        : 0;
    this.audioFFT = THREE.MathUtils.lerp(
      this.audioFFT,
      Math.min(fftAvg * this.audioSensitivity, 1),
      this.audioSmoothing
    );

    mat.uniforms.uAudioLow.value = this.audioLow;
    mat.uniforms.uAudioMid.value = this.audioMid;
    mat.uniforms.uAudioHigh.value = this.audioHigh;
    mat.uniforms.uAudioFFT.value = this.audioFFT;
    mat.uniforms.uOpacity.value = this.opacity;

    if (t - this.lastChange > this.changeInterval) {
      this.randomize(mat);
      this.lastChange = t;
      this.changeInterval = 60 + Math.random() * 60;
    }

    if (this.currentPattern !== this.nextPattern) {
      const blend = Math.min((t - this.transitionStart) / this.transitionDuration, 1);
      mat.uniforms.uBlend.value = blend;
      if (blend >= 1) {
        this.currentPattern = this.nextPattern;
        this.nextPattern = this.currentPattern;
        const paramsA = mat.uniforms.uParamsA.value as THREE.Vector3;
        const paramsB = mat.uniforms.uParamsB.value as THREE.Vector3;
        paramsA.copy(paramsB);
        (mat.uniforms.uColor1A.value as THREE.Color).copy(
          mat.uniforms.uColor1B.value as THREE.Color
        );
        (mat.uniforms.uColor2A.value as THREE.Color).copy(
          mat.uniforms.uColor2B.value as THREE.Color
        );
        (mat.uniforms.uColor3A.value as THREE.Color).copy(
          mat.uniforms.uColor3B.value as THREE.Color
        );
        mat.uniforms.uPatternA.value = this.currentPattern;
        mat.uniforms.uPatternB.value = this.nextPattern;
        mat.uniforms.uBlend.value = 0;
      }
    }

    applyVFX(this.renderer.domElement, this.audioData);
  }

  public updateConfig(newConfig: any): void {
    this.currentConfig = { ...this.currentConfig, ...newConfig };
    const mat = this.mesh.material as THREE.ShaderMaterial;
    if (newConfig.opacity !== undefined) {
      mat.uniforms.uOpacity.value = newConfig.opacity;
    }
  }

  private randomizePalette(
    material: THREE.ShaderMaterial,
    target: 'A' | 'B'
  ): void {
    const palette = GenerativeDubV2Preset.PALETTES[
      Math.floor(Math.random() * GenerativeDubV2Preset.PALETTES.length)
    ];
    (material.uniforms['uColor1' + target].value as THREE.Color).copy(palette[0]);
    (material.uniforms['uColor2' + target].value as THREE.Color).copy(palette[1]);
    (material.uniforms['uColor3' + target].value as THREE.Color).copy(palette[2]);
  }

  private shuffleStages(): void {
    for (let i = this.stageOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.stageOrder[i], this.stageOrder[j]] = [
        this.stageOrder[j],
        this.stageOrder[i]
      ];
    }
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.ShaderMaterial).dispose();
  }
}

export function createPreset(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  cfg: PresetConfig,
  shaderCode?: string
): BasePreset {
  return new GenerativeDubV2Preset(scene, camera, renderer, cfg);
}