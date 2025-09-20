import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';
import { applyVFX } from './vfx';

export const config: PresetConfig = {
  name: "Abstract Lines Pro",
  description: "Generative abstract lines with procedural math and optimized shaders",
  author: "AudioVisualizer Pro",
  version: "2.0.0",
  category: "abstract",
  tags: ["abstract", "lines", "procedural", "performance", "generative"],
  thumbnail: "abstract_lines_pro_thumb.png",
  note: 55,
  defaultConfig: {
    opacity: 1.0,
    fadeMs: 200,
    geometry: {
      segments: 64,
      thickness: 0.8,
      length: 2.5,
      curvature: 0.4,
      complexity: 3
    },
    flow: {
      speed: 0.5,
      turbulence: 0.3,
      coherence: 0.7,
      evolution: 1.2
    },
    colors: {
      primary: "#E8F4F8",
      secondary: "#F0F8E8", 
      detail: "#F8F0E8",
      accent: "#F8E8F0"
    },
    performance: {
      maxLines: 100,
      cullingDistance: 10.0,
      updateFrequency: 60
    }
  },
  controls: [
    {
      name: "flow.speed",
      type: "slider",
      label: "Flow Speed",
      min: 0.1,
      max: 3.0,
      step: 0.1,
      default: 0.5
    },
    {
      name: "geometry.complexity",
      type: "slider",
      label: "Geometric Complexity",
      min: 1,
      max: 6,
      step: 1,
      default: 3
    },
    {
      name: "flow.turbulence",
      type: "slider",
      label: "Turbulence",
      min: 0.0,
      max: 1.0,
      step: 0.1,
      default: 0.3
    }
  ],
  audioMapping: {
    low: {
      description: "Controls line density and generation",
      frequency: "20-250 Hz", 
      effect: "Spawning and base density"
    },
    mid: {
      description: "Modulates deformation and flow",
      frequency: "250-4000 Hz",
      effect: "Morphing and organic movement"
    },
    high: {
      description: "High-frequency effects and details",
      frequency: "4000+ Hz",
      effect: "Fine details and special effects"
    }
  },
  performance: {
    complexity: "medium",
    recommendedFPS: 60,
    gpuIntensive: false
  }
};

// Clase optimizada para lineas procedurales
class ProceduralLine {
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private mesh: THREE.Line;
  private vertices: Float32Array;
  private colors: Float32Array;
  private uvs: Float32Array;
  
  public age: number = 0;
  public lifespan: number;
  public energy: number = 1.0;
  private noiseOffset: number;
  private evolutionPhase: number;

  constructor(
    segments: number,
    color: THREE.Color,
    thickness: number = 1.0
  ) {
    this.lifespan = 3 + Math.random() * 5;
    this.noiseOffset = Math.random() * 1000;
    this.evolutionPhase = Math.random() * Math.PI * 2;
    
    this.createGeometry(segments);
    this.createMaterial(color, thickness);
    this.mesh = new THREE.Line(this.geometry, this.material);
  }

  private createGeometry(segments: number): void {
    this.vertices = new Float32Array(segments * 3);
    this.colors = new Float32Array(segments * 3);
    this.uvs = new Float32Array(segments * 2);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.vertices, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    
    this.generatePath();
  }

  private createMaterial(color: THREE.Color, thickness: number): void {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 color;
        varying vec3 vColor;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uThickness;
        uniform float uOpacity;
        
        void main() {
          vColor = color;
          vUv = uv;
          
          vec3 pos = position;
          
          // Efectos de grosor dinamico
          float thickness = uThickness * (1.0 + sin(uTime * 2.0 + position.x * 5.0) * 0.2);
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = thickness;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying vec2 vUv;
        uniform float uOpacity;
        uniform float uTime;
        uniform float uEnergy;
        
        void main() {
          // Gradiente a lo largo de la linea
          float alpha = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 2.0);
          
          // Pulso energetico
          float pulse = sin(uTime * 8.0 + vUv.x * 10.0) * 0.3 + 0.7;
          
          // Color con energia
          vec3 finalColor = vColor * uEnergy * pulse;
          
          gl_FragColor = vec4(finalColor, alpha * uOpacity);
        }
      `,
      uniforms: {
        uTime: { value: 0.0 },
        uThickness: { value: thickness },
        uOpacity: { value: 1.0 },
        uEnergy: { value: 1.0 }
      }
    });
  }

  private generatePath(): void {
    const segments = this.vertices.length / 3;
    
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      
      // Matematica procedural para paths organicos
      const x = (t - 0.5) * 4 + Math.sin(t * Math.PI * 3 + this.evolutionPhase) * 0.8;
      const y = Math.sin(t * Math.PI * 2 + this.noiseOffset) * 1.5 + 
                Math.cos(t * Math.PI * 5 + this.evolutionPhase) * 0.3;
      const z = Math.sin(t * Math.PI * 4 + this.noiseOffset) * 0.5;
      
      this.vertices[i * 3] = x;
      this.vertices[i * 3 + 1] = y;
      this.vertices[i * 3 + 2] = z;
      
      // Color gradient
      const intensity = Math.sin(t * Math.PI) * this.energy;
      this.colors[i * 3] = intensity;
      this.colors[i * 3 + 1] = intensity * 0.8;
      this.colors[i * 3 + 2] = intensity * 0.9;
      
      // UV mapping
      this.uvs[i * 2] = t;
      this.uvs[i * 2 + 1] = 0.5;
    }
  }

  public update(deltaTime: number, time: number, audioData: any, config: any): void {
    this.age += deltaTime;
    
    // Actualizar energia basada en audio
    const targetEnergy = 0.5 + (audioData.low + audioData.mid + audioData.high) / 3;
    this.energy += (targetEnergy - this.energy) * deltaTime * 3;
    
    // Evolucion del path
    this.evolutionPhase += deltaTime * config.flow.evolution;
    this.regeneratePath(time, audioData, config);
    
    // Actualizar uniforms
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uEnergy.value = this.energy;
    this.material.uniforms.uOpacity.value = Math.max(0, 1 - this.age / this.lifespan);
    
    // Actualizar geometria
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  private regeneratePath(time: number, audioData: any, config: any): void {
    const segments = this.vertices.length / 3;
    const turbulence = config.flow.turbulence * audioData.mid;
    
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      
      // Flow field matematico
      const flowX = Math.sin(t * Math.PI * 2 + time * config.flow.speed + this.noiseOffset) * turbulence;
      const flowY = Math.cos(t * Math.PI * 3 + time * config.flow.speed * 0.7) * turbulence;
      
      this.vertices[i * 3] += flowX * 0.01;
      this.vertices[i * 3 + 1] += flowY * 0.01;
      
      // Constraint bounds
      this.vertices[i * 3] = Math.max(-5, Math.min(5, this.vertices[i * 3]));
      this.vertices[i * 3 + 1] = Math.max(-3, Math.min(3, this.vertices[i * 3 + 1]));
    }
  }

  public isDead(): boolean {
    return this.age >= this.lifespan;
  }

  public getMesh(): THREE.Line {
    return this.mesh;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// Object Pool para optimizacion de memoria
class LinePool {
  private available: ProceduralLine[] = [];
  private active: ProceduralLine[] = [];
  
  public acquire(segments: number, color: THREE.Color, thickness: number): ProceduralLine {
    let line = this.available.pop();
    if (!line) {
      line = new ProceduralLine(segments, color, thickness);
    }
    
    line.age = 0;
    this.active.push(line);
    return line;
  }
  
  public release(line: ProceduralLine): void {
    const index = this.active.indexOf(line);
    if (index !== -1) {
      this.active.splice(index, 1);
      this.available.push(line);
    }
  }
  
  public getActive(): ProceduralLine[] {
    return this.active;
  }
  
  public dispose(): void {
    [...this.available, ...this.active].forEach(line => line.dispose());
    this.available = [];
    this.active = [];
  }
}

class AbstractLinesPreset extends BasePreset {
  private linePool: LinePool;
  private spawnTimer: number = 0;
  private currentConfig: any;
  private colorPalette: THREE.Color[];
  private frameCount: number = 0;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera, 
    renderer: THREE.WebGLRenderer,
    config: PresetConfig
  ) {
    super(scene, camera, renderer, config);
    
    this.currentConfig = { ...config.defaultConfig };
    this.linePool = new LinePool();
    this.initializeColors();
  }

  private initializeColors(): void {
    this.colorPalette = [
      new THREE.Color(this.currentConfig.colors.primary),
      new THREE.Color(this.currentConfig.colors.secondary),
      new THREE.Color(this.currentConfig.colors.detail),
      new THREE.Color(this.currentConfig.colors.accent)
    ];
  }

  public init(): void {
    // Sin fondo - completamente transparente
    
    // Crear lineas iniciales
    for (let i = 0; i < 20; i++) {
      this.spawnLine();
    }
  }

  private spawnLine(): void {
    const color = this.colorPalette[Math.floor(Math.random() * this.colorPalette.length)];
    const line = this.linePool.acquire(
      this.currentConfig.geometry.segments,
      color,
      this.currentConfig.geometry.thickness
    );
    
    this.scene.add(line.getMesh());
  }

  public update(): void {
    const deltaTime = this.clock.getDelta();
    const time = this.clock.getElapsedTime();
    this.frameCount++;

    // Optimizacion: update solo cada N frames en performance mode
    const shouldUpdate = this.frameCount % Math.max(1, Math.floor(60 / this.currentConfig.performance.updateFrequency)) === 0;
    
    if (shouldUpdate) {
      // Spawn control basado en audio
      this.spawnTimer += deltaTime;
      const spawnRate = 0.5 + this.audioData.low * 2;
      
      if (this.spawnTimer > 1 / spawnRate && 
          this.linePool.getActive().length < this.currentConfig.performance.maxLines) {
        this.spawnLine();
        this.spawnTimer = 0;
      }

      // Update active lines
      const activeLines = this.linePool.getActive();
      for (let i = activeLines.length - 1; i >= 0; i--) {
        const line = activeLines[i];
        line.update(deltaTime, time, this.audioData, this.currentConfig);
        
        if (line.isDead()) {
          this.scene.remove(line.getMesh());
          this.linePool.release(line);
        }
      }
    }

    // Actualizar opacidad global
    this.linePool.getActive().forEach(line => {
      line.getMesh().material.uniforms.uOpacity.value *= this.opacity;
    });

    applyVFX(this.renderer.domElement, this.audioData);
  }

  public updateConfig(newConfig: any): void {
    this.currentConfig = this.deepMerge(this.currentConfig, newConfig);
    
    if (newConfig.colors) {
      this.initializeColors();
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

  public dispose(): void {
    this.linePool.getActive().forEach(line => {
      this.scene.remove(line.getMesh());
    });
    this.linePool.dispose();
  }
}

export function createPreset(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  config: PresetConfig,
  shaderCode?: string
): BasePreset {
  return new AbstractLinesPreset(scene, camera, renderer, config);
}