import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';
import { applyVFX } from './vfx';

// Config para ROBOTICA Cinematic Intro
export const config: PresetConfig = {
  name: "ROBOTICA Cinematic Intro",
  description: "Cinematic title 'ROBOTICA' with letter-by-letter appearance and glow effects",
  author: "AudioVisualizer Pro",
  version: "1.0.0",
  category: "text",
  tags: ["text", "intro", "robotica", "cinematic", "title"],
  thumbnail: "robotica_cinematic_thumb.png",
  note: 61,
  defaultConfig: {
    opacity: 1.0,
    fadeMs: 200,
    text: {
      content: "ROBOTICA",
      fontSize: 180,
      fontFamily: "Arial Black, Helvetica, sans-serif",
      letterSpacing: 0.15,
      scale: 1.0
    },
    animation: {
      duration: 15.0,
      letterDelay: 0.8,
      fadeInDuration: 2.0,
      glowIntensity: 2.5,
      pulseSpeed: 1.5,
      // Orden de aparicion: R-O-B-O-T-I-C-A (indices 0-7)
      // Aparicion desordenada: O(1), A(7), B(2), T(4), R(0), I(5), C(6), O(3)
      animationOrder: [1, 7, 2, 4, 0, 5, 6, 3]
    },
    colors: {
      text: "#FFFFFF",
      glow: "#88CCFF",
      accent: "#FFAA44"
    },
    effects: {
      enableGlow: true,
      enablePulse: true,
      enableSparkle: true,
      enableCinematicFade: true
    }
  }
};

// Clase para manejar letras individuales con canvas
class CinematicLetter {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private texture: THREE.Texture;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.PlaneGeometry;
  private mesh: THREE.Mesh;
  
  public letter: string;
  public alpha: number = 0;
  public targetAlpha: number = 0;
  public startTime: number | null = null;
  public sparkleTimer: number = 0;
  public pulseOffset: number;
  public isVisible: boolean = false;

  constructor(
    letter: string,
    fontSize: number,
    fontFamily: string,
    position: THREE.Vector3
  ) {
    this.letter = letter;
    this.pulseOffset = Math.random() * Math.PI * 2;
    
    this.createCanvas(fontSize, fontFamily);
    this.createMaterial();
    this.createMesh();
    
    this.mesh.position.copy(position);
  }

  private createCanvas(fontSize: number, fontFamily: string): void {
    this.canvas = document.createElement('canvas');
    // Canvas mas grande para mejor calidad
    this.canvas.width = fontSize * 1.5;
    this.canvas.height = fontSize * 1.5;
    
    this.context = this.canvas.getContext('2d')!;
    this.context.font = `bold ${fontSize}px ${fontFamily}`;
    this.context.textAlign = 'center';
    this.context.textBaseline = 'middle';
    
    this.updateCanvasContent();
    
    this.texture = new THREE.Texture(this.canvas);
    this.texture.needsUpdate = true;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
  }

  private updateCanvasContent(): void {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Dibujar letra en blanco solido
    this.context.fillStyle = '#FFFFFF';
    this.context.fillText(
      this.letter,
      this.canvas.width / 2,
      this.canvas.height / 2
    );
  }

  private createMaterial(): void {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTexture: { value: this.texture },
        uTime: { value: 0.0 },
        uOpacity: { value: 0.0 },
        uGlowIntensity: { value: 0.0 },
        uColorText: { value: new THREE.Color(0xffffff) },
        uColorGlow: { value: new THREE.Color(0x88ccff) },
        uColorAccent: { value: new THREE.Color(0xffaa44) },
        uPulsePhase: { value: this.pulseOffset },
        uSparkle: { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uGlowIntensity;
        
        void main() {
          vUv = uv;
          vec3 pos = position;
          
          // Ligero movimiento breathing
          pos.y += sin(uTime * 0.5) * 0.02 * uGlowIntensity;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform float uTime;
        uniform float uOpacity;
        uniform float uGlowIntensity;
        uniform vec3 uColorText;
        uniform vec3 uColorGlow;
        uniform vec3 uColorAccent;
        uniform float uPulsePhase;
        uniform float uSparkle;
        
        void main() {
          vec4 textSample = texture2D(uTexture, vUv);
          
          if (textSample.a < 0.1) {
            discard;
          }
          
          // Color base del texto
          vec3 baseColor = uColorText;
          
          // Efecto de pulso
          float pulse = sin(uTime * 1.5 + uPulsePhase) * 0.3 + 0.7;
          
          // Gradiente desde el centro
          vec2 center = vec2(0.5, 0.5);
          float distFromCenter = distance(vUv, center);
          float gradient = 1.0 - smoothstep(0.1, 0.8, distFromCenter);
          
          // Mezclar colores
          vec3 finalColor = mix(baseColor, uColorGlow, gradient * 0.3);
          finalColor = mix(finalColor, uColorAccent, pulse * 0.2);
          
          // Efecto glow
          float glowMask = textSample.a;
          finalColor *= (1.0 + uGlowIntensity * glowMask * pulse);
          
          // Efecto sparkle
          if (uSparkle > 0.5) {
            float sparkleNoise = fract(sin(dot(vUv * 50.0, vec2(12.9898,78.233))) * 43758.5453);
            if (sparkleNoise > 0.95) {
              finalColor += vec3(1.0) * (uSparkle - 0.5) * 2.0;
            }
          }
          
          gl_FragColor = vec4(finalColor, textSample.a * uOpacity);
        }
      `
    });
  }

  private createMesh(): void {
    // Tamano basado en el canvas
    const width = this.canvas.width / 100; // Escalar para Three.js
    const height = this.canvas.height / 100;
    
    this.geometry = new THREE.PlaneGeometry(width, height);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
  }

  public update(deltaTime: number, currentTime: number, config: any, audioData: any): void {
    // Controlar aparicion
    if (this.startTime !== null && currentTime >= this.startTime && !this.isVisible) {
      this.isVisible = true;
    }
    
    if (this.isVisible && this.startTime !== null) {
      // Fade in cinematografico
      const fadeProgress = Math.min(1.0, (currentTime - this.startTime) / config.animation.fadeInDuration);
      // Curva de easing suave
      this.targetAlpha = this.easeOutCubic(fadeProgress);
    }

    // Interpolacion suave del alpha
    this.alpha += (this.targetAlpha - this.alpha) * deltaTime * 4;

    // Efectos basados en audio y config
    let pulse = 1.0;
    if (config.effects?.enablePulse) {
      const pulseSpeed = config.animation?.pulseSpeed ?? 1.5;
      pulse = 0.7 + 0.3 * Math.sin(currentTime * pulseSpeed + this.pulseOffset);
    }

    // Efectos de sparkle
    let sparkle = 0.0;
    if (config.effects?.enableSparkle && this.alpha > 0.5) {
      this.sparkleTimer += deltaTime;
      if (this.sparkleTimer > 1.5 + Math.random() * 2) {
        this.sparkleTimer = 0;
      }
      if (this.sparkleTimer < 0.3) {
        sparkle = Math.sin(this.sparkleTimer * Math.PI / 0.3);
      }
    }

    // Intensidad de glow basada en audio
    const glowIntensity = config.effects?.enableGlow ? 
      (config.animation?.glowIntensity ?? 2.5) * (0.5 + audioData.mid * 0.5) : 0.0;

    // Actualizar uniforms
    this.material.uniforms.uTime.value = currentTime;
    this.material.uniforms.uOpacity.value = this.alpha * pulse;
    this.material.uniforms.uGlowIntensity.value = glowIntensity;
    this.material.uniforms.uSparkle.value = sparkle;
    
    // Actualizar colores
    this.material.uniforms.uColorText.value.setStyle(config.colors.text);
    this.material.uniforms.uColorGlow.value.setStyle(config.colors.glow);
    this.material.uniforms.uColorAccent.value.setStyle(config.colors.accent);
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  public setStartTime(time: number): void {
    this.startTime = time;
  }

  public resetAnimation(): void {
    this.alpha = 0;
    this.targetAlpha = 0;
    this.startTime = null;
    this.sparkleTimer = 0;
    this.isVisible = false;
  }

  public getMesh(): THREE.Mesh {
    return this.mesh;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

class RoboticaCinematicPreset extends BasePreset {
  private letters: CinematicLetter[] = [];
  private animationStartTime: number | null = null;
  private currentConfig: any;
  private textGroup: THREE.Group;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    config: PresetConfig
  ) {
    super(scene, camera, renderer, config);
    this.currentConfig = { ...config.defaultConfig };
    this.textGroup = new THREE.Group();
  }

  public init(): void {
    this.createCinematicText();
    this.scene.add(this.textGroup);
  }

  private createCinematicText(): void {
    const rawText = this.currentConfig.text.content;
    const letters = rawText.replace(/\s+/g, '').split('');
    const fontSize = this.currentConfig.text.fontSize;
    const fontFamily = this.currentConfig.text.fontFamily;
    const scale = this.currentConfig.text.scale;

    const letterWidth = fontSize * 0.8; // Aproximacion del ancho de cada letra en px
    const availableWidth = (this.currentConfig.width || 1920) * 0.9375; // Usar el 94% del ancho
    const spacing = (availableWidth - letterWidth) / Math.max(letters.length - 1, 1);
    const startX = -availableWidth / 2 + letterWidth / 2;

    for (let i = 0; i < letters.length; i++) {
      const char = letters[i];
      const x = startX + i * spacing;
      // Escalar coordenadas desde pixeles a unidades de Three.js
      const position = new THREE.Vector3((x / 100) * scale, 0, 0);

      const letter = new CinematicLetter(char, fontSize, fontFamily, position);
      this.letters.push(letter);
      this.textGroup.add(letter.getMesh());
    }

    // Posicionar el grupo en el centro de la pantalla
    this.textGroup.position.set(0, 0, 0);
  }

  private initializeAnimation(): void {
    if (this.animationStartTime === null) {
      this.animationStartTime = this.clock.getElapsedTime();
      
      // Configurar tiempos de inicio segun el orden de animacion
      const animationOrder = this.currentConfig.animation.animationOrder;
      const letterDelay = this.currentConfig.animation.letterDelay;

      animationOrder.forEach((letterIdx: number, orderIdx: number) => {
        if (letterIdx < this.letters.length) {
          const delay = orderIdx * letterDelay;
          const startTime = this.animationStartTime! + delay;
          this.letters[letterIdx].setStartTime(startTime);
        }
      });
    }
  }

  public update(): void {
    const deltaTime = this.clock.getDelta();
    const currentTime = this.clock.getElapsedTime();

    this.initializeAnimation();

    // Actualizar todas las letras
    this.letters.forEach(letter => {
      letter.update(deltaTime, currentTime, this.currentConfig, this.audioData);
    });

    // Escala global basada en audio (sutil)
    const audioIntensity = (this.audioData.low + this.audioData.mid + this.audioData.high) / 3;
    const globalScale = this.currentConfig.text.scale * (1 + audioIntensity * 0.05);
    this.textGroup.scale.setScalar(globalScale);

    // Aplicar opacidad global
    this.textGroup.children.forEach(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
        const currentOpacity = child.material.uniforms.uOpacity.value;
        child.material.uniforms.uOpacity.value = currentOpacity * this.opacity;
      }
    });

    applyVFX(this.renderer.domElement, this.audioData);
  }

  public updateConfig(newConfig: any): void {
    this.currentConfig = this.deepMerge(this.currentConfig, newConfig);
    
    // Si cambio configuracion importante, recrear
    if (newConfig.text) {
      this.recreateText();
    }
  }

  private recreateText(): void {
    // Limpiar texto existente
    this.letters.forEach(letter => {
      this.textGroup.remove(letter.getMesh());
      letter.dispose();
    });
    this.letters = [];
    this.animationStartTime = null;

    // Recrear texto
    this.createCinematicText();
  }

  public resetAnimation(): void {
    this.animationStartTime = null;
    this.letters.forEach(letter => letter.resetAnimation());
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

  public dispose(): void {
    this.letters.forEach(letter => {
      this.textGroup.remove(letter.getMesh());
      letter.dispose();
    });
    this.scene.remove(this.textGroup);
    this.letters = [];
  }
}

export function createPreset(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  config: PresetConfig,
  shaderCode?: string
): BasePreset {
  return new RoboticaCinematicPreset(scene, camera, renderer, config);
}