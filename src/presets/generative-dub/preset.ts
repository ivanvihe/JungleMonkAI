import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';
import { applyVFX } from './vfx';

export const config: PresetConfig = {
  name: 'Generative Dub',
  description: 'Generative fractals, mandelbrots and abstract puzzles that evolve forever',
  author: 'AudioVisualizer',
  version: '1.1.0',
  category: 'generative',
  tags: [
    'auto',
    'infinite',
    'dub',
    'abstract',
    'audio-reactive',
    'fractal',
    'particles',
    'mandelbrot',
    'puzzle'
  ],
  thumbnail: 'generative_dub_thumb.png',
  defaultConfig: {
    opacity: 1.0
  },
  controls: [],
  audioMapping: {
    low: {
      description: 'Influences color warmth',
      frequency: '20-250 Hz',
      effect: 'Color shift'
    },
    mid: {
      description: 'Changes movement speed',
      frequency: '250-4000 Hz',
      effect: 'Motion intensity'
    },
    high: {
      description: 'Adds detail',
      frequency: '4000+ Hz',
      effect: 'Texture'
    }
  },
  performance: { complexity: 'medium', recommendedFPS: 60, gpuIntensive: true }
};

class GenerativeDubPreset extends BasePreset {
  private mesh!: THREE.Mesh;
  private currentConfig: any;
  private lastChange = 0;
  private changeInterval = 60 + Math.random() * 60;

  private audioLow = 0;
  private audioMid = 0;
  private audioHigh = 0;
  private readonly audioSensitivity = 1.5;
  private readonly audioSmoothing = 0.1;

  private currentPattern = 0;
  private nextPattern = 0;
  private transitionStart = 0;
  private transitionDuration = 8;
  private timeOffset = Math.random() * 1000;

  private static readonly PATTERN_COUNT = 15;

  private static readonly PALETTES = [
    ['#0e0e0e', '#3a506b', '#5bc0be'],
    ['#000000', '#1b262c', '#0f4c75'],
    ['#000000', '#ffffff', '#88c0d0'],
    ['#0d1b2a', '#1b263b', '#415a77'],
    ['#222831', '#393e46', '#00adb5']
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

    this.currentPattern = Math.floor(
      Math.random() * GenerativeDubPreset.PATTERN_COUNT
    );
    this.nextPattern = this.currentPattern;
    
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
            return fbm(uv + uTime * params.z);
          } else if(id < 1.5){
            vec2 p = uv;
            float ang = uTime * 0.2;
            p = vec2(cos(ang) * p.x - sin(ang) * p.y, sin(ang) * p.x + cos(ang) * p.y);
            return fbm(p * (1.0 + uAudioMid * 2.0));
          } else if(id < 2.5){
            float n = fbm(uv);
            return step(0.5 + 0.3 * sin(uTime + uAudioHigh * 5.0), n);
          } else if(id < 3.5){
            vec2 p = uv;
            p = abs(fract(p) - 0.5);
            return fbm(p * 3.0 + uTime * 0.5);
          } else if(id < 4.5){
            vec2 p = uv * 2.0 - 1.0;
            float ang = uTime * 0.1;
            p = vec2(cos(ang) * p.x - sin(ang) * p.y, sin(ang) * p.x + cos(ang) * p.y);
            for(int i=0;i<3;i++){ p=abs(p)/dot(p,p)-vec2(0.5); }
            return length(p);
          } else if(id < 5.5){
            vec2 p = uv + noise(uv*4.0 + uTime);
            return fract(p.x + p.y);
          } else if(id < 6.5){
            vec2 p = uv*10.0 + uTime;
            float n = fract(sin(dot(floor(p), vec2(12.9898,78.233)))*43758.5453);
            return step(0.98, n);
          } else if(id < 7.5){
            vec2 p = uv - 0.5;
            float r = length(p);
            float a = atan(p.y,p.x);
            return sin(6.2831*r + a*3.0 + uTime);
          } else if(id < 8.5){
            vec2 p = uv*3.0;
            p += vec2(fbm(p+uTime), fbm(p-uTime));
            return fbm(p);
          } else if(id < 9.5){
            vec2 p = uv*5.0;
            float n = fbm(p+uTime);
            return step(0.85, n);
          } else if(id < 10.5){
            vec2 c = (uv - 0.5) * (3.0 + 0.5*sin(uTime*0.1));
            c += vec2(0.3*sin(uTime*0.1),0.3*cos(uTime*0.1));
            vec2 z = vec2(0.0);
            float m = 0.0;
            for(int i=0;i<32;i++){
              z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
              if(dot(z,z) > 4.0) break;
              m += 1.0;
            }
            return m/32.0;
          } else if(id < 11.5){
            vec2 p = uv*4.0 + uTime*0.3;
            vec2 ip = floor(p);
            vec2 fp = fract(p);
            float j = step(0.5, sin(ip.x + ip.y));
            float edge = smoothstep(0.3,0.32,max(abs(fp.x-0.5),abs(fp.y-0.5)));
            return j*edge;
          } else if(id < 12.5){
            vec2 p = uv*6.0 + uTime*0.2;
            vec2 ip = floor(p);
            vec2 fp = fract(p);
            float checker = mod(ip.x + ip.y, 2.0);
            float d = checker > 0.5 ? fp.x : 1.0 - fp.x;
            return step(fp.y, d);
          } else if(id < 13.5){
            vec2 p = uv*5.0 + vec2(uTime*0.2, uTime*0.3);
            vec2 i = floor(p);
            vec2 f = fract(p);
            float res = 8.0;
            for(int y=-1;y<=1;y++){
              for(int x=-1;x<=1;x++){
                vec2 g = vec2(float(x), float(y));
                vec2 o = vec2(hash(i+g), hash(i+g+vec2(1.23,4.56)));
                vec2 r = g + o - f;
                res = min(res, dot(r,r));
              }
            }
            return sqrt(res);
          } else {
            vec2 p = uv - 0.5;
            float r = length(p);
            float a = atan(p.y,p.x);
            return fract(r*3.0 + sin(a*8.0 + uTime));
          }
        }

        void main(){
          vec2 uvA = vUv * uParamsA.x;
          vec2 uvB = vUv * uParamsB.x;
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
    let newPattern = this.currentPattern;
    while (newPattern === this.currentPattern) {
      newPattern = Math.floor(Math.random() * GenerativeDubPreset.PATTERN_COUNT);
    }
    this.nextPattern = newPattern;
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

    mat.uniforms.uAudioLow.value = this.audioLow;
    mat.uniforms.uAudioMid.value = this.audioMid;
    mat.uniforms.uAudioHigh.value = this.audioHigh;
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
    const palette = GenerativeDubPreset.PALETTES[
      Math.floor(Math.random() * GenerativeDubPreset.PALETTES.length)
    ];
    (material.uniforms['uColor1' + target].value as THREE.Color).copy(palette[0]);
    (material.uniforms['uColor2' + target].value as THREE.Color).copy(palette[1]);
    (material.uniforms['uColor3' + target].value as THREE.Color).copy(palette[2]);
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
  return new GenerativeDubPreset(scene, camera, renderer, cfg);
}