import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';

export const config: PresetConfig = {
  name: 'Fractal Lab',
  description: 'Advanced fractal generator with mathematical patterns',
  author: 'AudioVisualizer',
  version: '1.0.0',
  category: 'fractal',
  tags: ['mandelbrot', 'julia', 'sierpinski', 'mathematical', 'audio-reactive'],
  thumbnail: 'fractal_lab_thumb.png',
  defaultConfig: {
    opacity: 1.0,
    fractalType: 'mandelbrot',
    iterations: 50,
    zoom: 1.0,
    centerX: 0.0,
    centerY: 0.0,
    colorScheme: 'rainbow',
    escapeRadius: 2.0,
    power: 2.0,
    julia_cx: -0.7,
    julia_cy: 0.27015,
    rotation: 0.0,
    brightness: 1.0,
    contrast: 1.0,
    saturation: 1.0
  },
  controls: [
    { name: 'fractalType', type: 'select', label: 'Fractal Type', options: ['mandelbrot', 'julia', 'burning_ship', 'sierpinski'], default: 'mandelbrot' },
    { name: 'iterations', type: 'slider', label: 'Iterations', min: 10, max: 200, step: 1, default: 50 },
    { name: 'zoom', type: 'slider', label: 'Zoom', min: 0.1, max: 100.0, step: 0.1, default: 1.0 },
    { name: 'centerX', type: 'slider', label: 'Center X', min: -2.0, max: 2.0, step: 0.01, default: 0.0 },
    { name: 'centerY', type: 'slider', label: 'Center Y', min: -2.0, max: 2.0, step: 0.01, default: 0.0 },
    { name: 'colorScheme', type: 'select', label: 'Color Scheme', options: ['rainbow', 'fire', 'ice', 'electric', 'cosmic'], default: 'rainbow' },
    { name: 'escapeRadius', type: 'slider', label: 'Escape Radius', min: 1.0, max: 10.0, step: 0.1, default: 2.0 },
    { name: 'power', type: 'slider', label: 'Power', min: 1.0, max: 8.0, step: 0.1, default: 2.0 },
    { name: 'julia_cx', type: 'slider', label: 'Julia C Real', min: -2.0, max: 2.0, step: 0.001, default: -0.7 },
    { name: 'julia_cy', type: 'slider', label: 'Julia C Imaginary', min: -2.0, max: 2.0, step: 0.001, default: 0.27015 },
    { name: 'rotation', type: 'slider', label: 'Rotation', min: 0.0, max: 6.28, step: 0.01, default: 0.0 },
    { name: 'brightness', type: 'slider', label: 'Brightness', min: 0.0, max: 3.0, step: 0.01, default: 1.0 },
    { name: 'contrast', type: 'slider', label: 'Contrast', min: 0.0, max: 3.0, step: 0.01, default: 1.0 },
    { name: 'saturation', type: 'slider', label: 'Saturation', min: 0.0, max: 3.0, step: 0.01, default: 1.0 }
  ],
  audioMapping: {
    low: { description: 'Controls zoom and escape radius', frequency: '20-250 Hz', effect: 'Zoom & detail' },
    mid: { description: 'Influences rotation and power', frequency: '250-4000 Hz', effect: 'Rotation & complexity' },
    high: { description: 'Modulates iterations and color', frequency: '4000+ Hz', effect: 'Iteration count & color dynamics' }
  },
  performance: { complexity: 'high', recommendedFPS: 60, gpuIntensive: true }
};

class FractalLabPreset extends BasePreset {
  private mesh!: THREE.Mesh;
  private currentConfig: any;

  public init(): void {
    this.currentConfig = JSON.parse(JSON.stringify(this.config.defaultConfig));
    const width = (this.currentConfig.width || 1920) / 100;
    const height = (this.currentConfig.height || 1080) / 100;
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0.0 },
        uResolution: { value: new THREE.Vector2(this.currentConfig.width || 1920, this.currentConfig.height || 1080) },
        uOpacity: { value: this.opacity },
        uFractalType: { value: 0 },
        uIterations: { value: 50 },
        uZoom: { value: 1.0 },
        uCenter: { value: new THREE.Vector2(0.0, 0.0) },
        uColorScheme: { value: 0 },
        uEscapeRadius: { value: 2.0 },
        uPower: { value: 2.0 },
        uJuliaC: { value: new THREE.Vector2(-0.7, 0.27015) },
        uRotation: { value: 0.0 },
        uBrightness: { value: 1.0 },
        uContrast: { value: 1.0 },
        uSaturation: { value: 1.0 },
        uAudioLow: { value: 0.0 },
        uAudioMid: { value: 0.0 },
        uAudioHigh: { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uOpacity;
        uniform int uFractalType;
        uniform int uIterations;
        uniform float uZoom;
        uniform vec2 uCenter;
        uniform int uColorScheme;
        uniform float uEscapeRadius;
        uniform float uPower;
        uniform vec2 uJuliaC;
        uniform float uRotation;
        uniform float uBrightness;
        uniform float uContrast;
        uniform float uSaturation;
        uniform float uAudioLow;
        uniform float uAudioMid;
        uniform float uAudioHigh;
        varying vec2 vUv;

        vec2 rotate(vec2 p, float a) {
          return vec2(cos(a) * p.x - sin(a) * p.y, sin(a) * p.x + cos(a) * p.y);
        }

        vec3 hsv2rgb(vec3 c) {
          vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
          vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
          return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        vec3 getColor(float t) {
          if (uColorScheme == 0) {
            return hsv2rgb(vec3(t * 0.8 + uTime * 0.1, 0.8, 1.0));
          } else if (uColorScheme == 1) {
            return mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 1.0, 0.0), t);
          } else if (uColorScheme == 2) {
            return mix(vec3(0.0, 0.5, 1.0), vec3(1.0, 1.0, 1.0), t);
          } else if (uColorScheme == 3) {
            return mix(vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 1.0), t);
          } else {
            return mix(vec3(0.1, 0.0, 0.3), vec3(1.0, 0.5, 0.0), t);
          }
        }

        void main() {
          vec2 uv = (vUv - 0.5) * 2.0;
          uv.x *= uResolution.x / uResolution.y;
          uv = rotate(uv, uRotation + uAudioMid * 0.5);
          uv = uv / (uZoom + uAudioLow * 2.0) + uCenter;
          int iterations = uIterations + int(uAudioHigh * 50.0);
          float escape = 0.0;
          if (uFractalType == 0) {
            vec2 z = vec2(0.0);
            vec2 c = uv;
            for (int i = 0; i < 200; i++) {
              if (i >= iterations) break;
              if (dot(z, z) > uEscapeRadius) {
                escape = float(i) / float(iterations);
                break;
              }
              float r = length(z);
              float theta = atan(z.y, z.x) * uPower;
              z = pow(r, uPower) * vec2(cos(theta), sin(theta)) + c;
            }
          } else if (uFractalType == 1) {
            vec2 z = uv;
            vec2 c = uJuliaC + vec2(sin(uTime * 0.1) * 0.1, cos(uTime * 0.1) * 0.1);
            for (int i = 0; i < 200; i++) {
              if (i >= iterations) break;
              if (dot(z, z) > uEscapeRadius) {
                escape = float(i) / float(iterations);
                break;
              }
              float r = length(z);
              float theta = atan(z.y, z.x) * uPower;
              z = pow(r, uPower) * vec2(cos(theta), sin(theta)) + c;
            }
          } else if (uFractalType == 2) {
            vec2 z = vec2(0.0);
            vec2 c = uv;
            for (int i = 0; i < 200; i++) {
              if (i >= iterations) break;
              if (dot(z, z) > uEscapeRadius) {
                escape = float(i) / float(iterations);
                break;
              }
              z = vec2(z.x * z.x - z.y * z.y, 2.0 * abs(z.x * z.y)) + c;
            }
          }
          vec3 color = getColor(escape);
          color *= uBrightness;
          color = (color - 0.5) * uContrast + 0.5;
          float gray = dot(color, vec3(0.299, 0.587, 0.114));
          color = mix(vec3(gray), color, uSaturation);
          float alpha = escape > 0.0 ? uOpacity : uOpacity * 0.5;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);
  }

  public update(): void {
    const t = this.clock.getElapsedTime();
    const mat = this.mesh.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value = t;
    mat.uniforms.uAudioLow.value = this.audioData.low;
    mat.uniforms.uAudioMid.value = this.audioData.mid;
    mat.uniforms.uAudioHigh.value = this.audioData.high;
    mat.uniforms.uOpacity.value = this.opacity;
    const fractalType = this.currentConfig.fractalType || 'mandelbrot';
    let typeIdx = 0;
    if (fractalType === 'julia') typeIdx = 1;
    else if (fractalType === 'burning_ship') typeIdx = 2;
    else if (fractalType === 'sierpinski') typeIdx = 3;
    mat.uniforms.uFractalType.value = typeIdx;
    const colorScheme = this.currentConfig.colorScheme || 'rainbow';
    let schemeIdx = 0;
    if (colorScheme === 'fire') schemeIdx = 1;
    else if (colorScheme === 'ice') schemeIdx = 2;
    else if (colorScheme === 'electric') schemeIdx = 3;
    else if (colorScheme === 'cosmic') schemeIdx = 4;
    mat.uniforms.uColorScheme.value = schemeIdx;
  }

  public updateConfig(newConfig: any): void {
    this.currentConfig = { ...this.currentConfig, ...newConfig };
    const mat = this.mesh.material as THREE.ShaderMaterial;
    if (newConfig.iterations !== undefined) mat.uniforms.uIterations.value = newConfig.iterations;
    if (newConfig.zoom !== undefined) mat.uniforms.uZoom.value = newConfig.zoom;
    if (newConfig.centerX !== undefined || newConfig.centerY !== undefined) {
      mat.uniforms.uCenter.value = new THREE.Vector2(
        newConfig.centerX ?? this.currentConfig.centerX,
        newConfig.centerY ?? this.currentConfig.centerY
      );
    }
    if (newConfig.escapeRadius !== undefined) mat.uniforms.uEscapeRadius.value = newConfig.escapeRadius;
    if (newConfig.power !== undefined) mat.uniforms.uPower.value = newConfig.power;
    if (newConfig.julia_cx !== undefined || newConfig.julia_cy !== undefined) {
      mat.uniforms.uJuliaC.value = new THREE.Vector2(
        newConfig.julia_cx ?? this.currentConfig.julia_cx,
        newConfig.julia_cy ?? this.currentConfig.julia_cy
      );
    }
    if (newConfig.rotation !== undefined) mat.uniforms.uRotation.value = newConfig.rotation;
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
  return new FractalLabPreset(scene, camera, renderer, cfg);
}
