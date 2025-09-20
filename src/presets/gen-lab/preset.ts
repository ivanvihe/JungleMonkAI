import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';

export const config: PresetConfig = {
  name: 'Gen Lab',
  description: 'Advanced generative laboratory with atmospheric effects',
  author: 'AudioVisualizer',
  version: '1.0.0',
  category: 'generative',
  tags: ['cloud', 'vapor', 'skybox', 'noise', 'audio-reactive'],
  thumbnail: 'gen_lab_thumb.png',
  defaultConfig: {
    opacity: 1.0,
    algorithm: 'perlin',
    variant: 'fog',
    noiseScale: 2.0,
    speed: 0.5,
    turbulence: 0.3,
    density: 0.6,
    flow: 0.4,
    color1: '#ff8a00',
    color2: '#4e00ff',
    color3: '#00ff8a',
    colorMix: 0.5,
    radialBlur: 0.4,
    uvDistort: 0.2,
    timeWarp: 0.1,
    brightness: 1.0,
    contrast: 1.2,
    saturation: 1.1
  },
  controls: [
    { name: 'algorithm', type: 'select', label: 'Algorithm', options: ['perlin', 'simplex', 'ridged', 'billow', 'fbm'], default: 'perlin' },
    { name: 'variant', type: 'select', label: 'Variant', options: ['fog', 'smoke', 'clouds', 'vapor', 'plasma', 'mist', 'storm'], default: 'fog' },
    { name: 'noiseScale', type: 'slider', label: 'Noise Scale', min: 0.1, max: 10.0, step: 0.1, default: 2.0 },
    { name: 'speed', type: 'slider', label: 'Speed', min: 0.0, max: 3.0, step: 0.01, default: 0.5 },
    { name: 'turbulence', type: 'slider', label: 'Turbulence', min: 0.0, max: 2.0, step: 0.01, default: 0.3 },
    { name: 'density', type: 'slider', label: 'Density', min: 0.0, max: 1.0, step: 0.01, default: 0.6 },
    { name: 'flow', type: 'slider', label: 'Flow', min: 0.0, max: 1.0, step: 0.01, default: 0.4 },
    { name: 'color1', type: 'color', label: 'Color 1', default: '#ff8a00' },
    { name: 'color2', type: 'color', label: 'Color 2', default: '#4e00ff' },
    { name: 'color3', type: 'color', label: 'Color 3', default: '#00ff8a' },
    { name: 'colorMix', type: 'slider', label: 'Color Mix', min: 0.0, max: 1.0, step: 0.01, default: 0.5 },
    { name: 'radialBlur', type: 'slider', label: 'Radial Blur', min: 0.0, max: 1.0, step: 0.01, default: 0.4 },
    { name: 'uvDistort', type: 'slider', label: 'UV Distortion', min: 0.0, max: 2.0, step: 0.01, default: 0.2 },
    { name: 'timeWarp', type: 'slider', label: 'Time Warp', min: 0.0, max: 1.0, step: 0.01, default: 0.1 },
    { name: 'brightness', type: 'slider', label: 'Brightness', min: 0.0, max: 3.0, step: 0.01, default: 1.0 },
    { name: 'contrast', type: 'slider', label: 'Contrast', min: 0.0, max: 3.0, step: 0.01, default: 1.2 },
    { name: 'saturation', type: 'slider', label: 'Saturation', min: 0.0, max: 3.0, step: 0.01, default: 1.1 }
  ],
  audioMapping: {
    low: { description: 'Controls density and turbulence', frequency: '20-250 Hz', effect: 'Atmospheric density' },
    mid: { description: 'Flow patterns and distortion', frequency: '250-4000 Hz', effect: 'Movement & distortion' },
    high: { description: 'Color mixing and brightness', frequency: '4000+ Hz', effect: 'Color dynamics' }
  },
  performance: { complexity: 'medium', recommendedFPS: 60, gpuIntensive: false }
};

class GenLabPreset extends BasePreset {
  private mesh!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private currentConfig: any;
  private shaderCode?: string;
  private timeOffset = Math.random() * 10000;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    config: PresetConfig,
    shaderCode?: string
  ) {
    super(scene, camera, renderer, config);
    this.shaderCode = shaderCode;
  }

  public init(): void {
    this.currentConfig = JSON.parse(JSON.stringify(this.config.defaultConfig));
    const geometry = new THREE.PlaneGeometry(2, 2);

    const defaultFragmentShader = `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uAudioLow;
      uniform float uAudioMid;
      uniform float uAudioHigh;
      uniform int uAlgorithm;
      uniform int uVariant;
      uniform float uNoiseScale;
      uniform float uSpeed;
      uniform float uTurbulence;
      uniform float uDensity;
      uniform float uFlow;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      uniform float uColorMix;
      uniform float uRadialBlur;
      uniform float uUvDistort;
      uniform float uTimeWarp;
      uniform float uBrightness;
      uniform float uContrast;
      uniform float uSaturation;

      varying vec2 vUv;

      // Hash functions for noise
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      // Improved noise functions
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i), b = hash(i + vec2(1., 0.));
        float c = hash(i + vec2(0., 1.)), d = hash(i + vec2(1., 1.));
        vec2 u = f * f * (3. - 2. * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1. - u.x) + (d - b) * u.x * u.y;
      }

      // Simplex noise approximation
      float simplex(vec2 p) {
        const float F2 = 0.3660254037844386;
        const float G2 = 0.21132486540518713;
        float s = (p.x + p.y) * F2;
        vec2 i = floor(p + s);
        float t = (i.x + i.y) * G2;
        vec2 P0 = i - t;
        vec2 p0 = p - P0;
        vec2 i1 = (p0.x > p0.y) ? vec2(1., 0.) : vec2(0., 1.);
        vec2 p1 = p0 - i1 + G2;
        vec2 p2 = p0 - 1. + 2. * G2;
        float n0 = max(0., 0.5 - dot(p0, p0)) * hash(i);
        float n1 = max(0., 0.5 - dot(p1, p1)) * hash(i + i1);
        float n2 = max(0., 0.5 - dot(p2, p2)) * hash(i + 1.);
        return 70. * (n0 + n1 + n2);
      }

      // Ridged noise
      float ridged(vec2 p) {
        return 1. - abs(noise(p));
      }

      // Billow noise
      float billow(vec2 p) {
        return abs(noise(p));
      }

      // Fractal Brownian Motion
      float fbm(vec2 p) {
        float v = 0., a = 0.5;
        float lacunarity = 2.0 + uTurbulence;

        for(int i = 0; i < 6; i++) {
          if(uAlgorithm == 0) v += a * noise(p);          // Perlin
          else if(uAlgorithm == 1) v += a * simplex(p);    // Simplex
          else if(uAlgorithm == 2) v += a * ridged(p);     // Ridged
          else if(uAlgorithm == 3) v += a * billow(p);     // Billow
          else v += a * noise(p);                          // Default to Perlin

          p *= lacunarity;
          a *= 0.5;
        }
        return v;
      }

      // Color space conversions
      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
      }

      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      void main() {
        vec2 uv = vUv * 0.5 + 0.5;

        // Time manipulation without looping
        float time = uTime * (uSpeed + uTimeWarp);

        // Variant-specific UV transformations
        if(uVariant == 0) { // fog
          uv += vec2(time * 0.1, sin(time) * 0.05);
        } else if(uVariant == 1) { // smoke
          uv.y += time * 0.3;
          uv.x += sin(uv.y * 8.0 + time) * 0.03;
        } else if(uVariant == 2) { // clouds
          uv += vec2(time * 0.05, time * 0.02);
        } else if(uVariant == 3) { // vapor
          uv.x += time * 0.2;
          uv.y += sin(uv.x * 10.0 + time) * 0.02;
        } else if(uVariant == 4) { // plasma
          vec2 p = uv * 2.0 - 1.0;
          float r = length(p);
          float theta = atan(p.y, p.x);
          uv = vec2(theta / 6.28318 + 0.5 + time * 0.1, r + sin(time) * 0.1);
        } else if(uVariant == 5) { // mist
          uv += vec2(sin(time * 0.7) * 0.02, cos(time * 0.5) * 0.03);
        } else if(uVariant == 6) { // storm
          uv += vec2(sin(time * 2.0) * 0.05, cos(time * 1.7) * 0.08);
        }

        // Audio-reactive distortion
        uv += (uv - 0.5) * uAudioMid * uUvDistort;

        // Flow effects
        vec2 flowUv = uv + vec2(cos(time + uv.y * 5.0), sin(time + uv.x * 5.0)) * uFlow * 0.1;

        // Generate noise
        float n1 = fbm(flowUv * uNoiseScale);
        float n2 = fbm((flowUv + vec2(100.0)) * uNoiseScale * 0.7);
        float n3 = fbm((flowUv + vec2(200.0)) * uNoiseScale * 1.3);

        // Combine noise layers with density control
        float n = mix(n1, n2 * n3, uDensity) * (1.0 + uAudioLow * 0.5);

        // Radial falloff
        float r = length(uv - 0.5);
        n *= 1.0 - r * uRadialBlur;

        // Color mixing
        vec3 col1 = mix(uColor1, uColor2, n + uAudioHigh * 0.3);
        vec3 col2 = mix(uColor2, uColor3, n2 + sin(time) * 0.2);
        vec3 col = mix(col1, col2, uColorMix + uAudioMid * 0.2);

        // Color adjustments
        vec3 hsv = rgb2hsv(col);
        hsv.y *= uSaturation;
        hsv.z *= uBrightness;
        col = hsv2rgb(hsv);

        // Contrast adjustment
        col = (col - 0.5) * uContrast + 0.5;

        // Final alpha with improved falloff
        float alpha = smoothstep(0.0, 0.3, n) * smoothstep(1.0, 0.7, r) * uOpacity;

        gl_FragColor = vec4(col, alpha);
      }
    `;
    const fragmentShaderCode = this.shaderCode ?? defaultFragmentShader;

    const material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: this.currentConfig.opacity },
        uAudioLow: { value: 0.0 },
        uAudioMid: { value: 0.0 },
        uAudioHigh: { value: 0.0 },
        uAlgorithm: { value: 0 },
        uVariant: { value: 0 },
        uNoiseScale: { value: this.currentConfig.noiseScale },
        uSpeed: { value: this.currentConfig.speed },
        uTurbulence: { value: this.currentConfig.turbulence },
        uDensity: { value: this.currentConfig.density },
        uFlow: { value: this.currentConfig.flow },
        uColor1: { value: new THREE.Color(this.currentConfig.color1) },
        uColor2: { value: new THREE.Color(this.currentConfig.color2) },
        uColor3: { value: new THREE.Color(this.currentConfig.color3) },
        uColorMix: { value: this.currentConfig.colorMix },
        uRadialBlur: { value: this.currentConfig.radialBlur },
        uUvDistort: { value: this.currentConfig.uvDistort },
        uTimeWarp: { value: this.currentConfig.timeWarp },
        uBrightness: { value: this.currentConfig.brightness },
        uContrast: { value: this.currentConfig.contrast },
        uSaturation: { value: this.currentConfig.saturation }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: fragmentShaderCode
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);

    if (this.shaderCode) {
      this.renderer.compile(this.scene, this.camera);
      const gl = this.renderer.getContext();
      const program = (material as any).program?.program;
      const isLinked = program ? gl.getProgramParameter(program, gl.LINK_STATUS) : false;
      if (!isLinked) {
        console.error(
          'Shader program failed to link:',
          program ? gl.getProgramInfoLog(program) : 'No program generated'
        );
        material.fragmentShader = defaultFragmentShader;
        material.needsUpdate = true;
        this.renderer.compile(this.scene, this.camera);
      }
    }
  }

  public update(): void {
    const t = this.clock.getElapsedTime() + this.timeOffset;
    const mat = this.mesh.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value = t;
    mat.uniforms.uAudioLow.value = this.audioData.low;
    mat.uniforms.uAudioMid.value = this.audioData.mid;
    mat.uniforms.uAudioHigh.value = this.audioData.high;
    mat.uniforms.uOpacity.value = this.opacity;
    
    // Update algorithm
    const algorithm = this.currentConfig.algorithm || 'perlin';
    let algIdx = 0;
    if (algorithm === 'simplex') algIdx = 1;
    else if (algorithm === 'ridged') algIdx = 2;
    else if (algorithm === 'billow') algIdx = 3;
    else if (algorithm === 'fbm') algIdx = 4;
    mat.uniforms.uAlgorithm.value = algIdx;
    
    // Update variant
    const variant = this.currentConfig.variant || 'fog';
    let varIdx = 0;
    if (variant === 'smoke') varIdx = 1;
    else if (variant === 'clouds') varIdx = 2;
    else if (variant === 'vapor') varIdx = 3;
    else if (variant === 'plasma') varIdx = 4;
    else if (variant === 'mist') varIdx = 5;
    else if (variant === 'storm') varIdx = 6;
    mat.uniforms.uVariant.value = varIdx;
  }

  public updateConfig(newConfig: any): void {
    this.currentConfig = { ...this.currentConfig, ...newConfig };
    const mat = this.mesh.material as THREE.ShaderMaterial;
    
    if (newConfig.algorithm !== undefined) {
      // Algorithm will be updated in the next update() call
    }
    if (newConfig.color1) mat.uniforms.uColor1.value = new THREE.Color(newConfig.color1);
    if (newConfig.color2) mat.uniforms.uColor2.value = new THREE.Color(newConfig.color2);
    if (newConfig.color3) mat.uniforms.uColor3.value = new THREE.Color(newConfig.color3);
    if (newConfig.noiseScale !== undefined) mat.uniforms.uNoiseScale.value = newConfig.noiseScale;
    if (newConfig.speed !== undefined) mat.uniforms.uSpeed.value = newConfig.speed;
    if (newConfig.turbulence !== undefined) mat.uniforms.uTurbulence.value = newConfig.turbulence;
    if (newConfig.density !== undefined) mat.uniforms.uDensity.value = newConfig.density;
    if (newConfig.flow !== undefined) mat.uniforms.uFlow.value = newConfig.flow;
    if (newConfig.colorMix !== undefined) mat.uniforms.uColorMix.value = newConfig.colorMix;
    if (newConfig.radialBlur !== undefined) mat.uniforms.uRadialBlur.value = newConfig.radialBlur;
    if (newConfig.uvDistort !== undefined) mat.uniforms.uUvDistort.value = newConfig.uvDistort;
    if (newConfig.timeWarp !== undefined) mat.uniforms.uTimeWarp.value = newConfig.timeWarp;
    if (newConfig.brightness !== undefined) mat.uniforms.uBrightness.value = newConfig.brightness;
    if (newConfig.contrast !== undefined) mat.uniforms.uContrast.value = newConfig.contrast;
    if (newConfig.saturation !== undefined) mat.uniforms.uSaturation.value = newConfig.saturation;
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
  return new GenLabPreset(scene, camera, renderer, cfg, shaderCode);
}
