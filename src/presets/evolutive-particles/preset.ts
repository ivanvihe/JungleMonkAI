import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';
import { applyVFX } from './vfx';

// Configuracion del preset Evolutive Particles
export const config: PresetConfig = {
  name: "Evolutive Particles",
  description: "Sistema de particulas evolutivo que forma estructuras complejas y se adapta al audio",
  author: "AudioVisualizer",
  version: "1.0.0",
  category: "particles",
  tags: ["particles", "evolution", "organic", "complex", "adaptive", "swarm"],
  thumbnail: "evolutive_particles_thumb.png",
  note: 56,
  defaultConfig: {
    opacity: 1.0,
    fadeMs: 250,
    particleCount: {
      initial: 200,
      base: 800,
      evolved: 1200,
      maximum: 2000
    },
    colors: {
      birth: "#FF6B9D",      // Rosa nacimiento
      juvenile: "#4ECDC4",   // Turquesa joven
      mature: "#45B7D1",     // Azul maduro
      elder: "#96CEB4",      // Verde anciano
      death: "#FECA57",      // Dorado muerte
      connections: "#A8E6CF"  // Verde conexiones
    },
    evolution: {
      lifespanBase: 8.0,
      mutationRate: 0.3,
      adaptationSpeed: 1.5,
      complexityGrowth: 0.8,
      socialBehavior: 0.6,
      emergenceThreshold: 0.7
    },
    behavior: {
      attraction: 0.4,
      repulsion: 0.2,
      alignment: 0.5,
      cohesion: 0.3,
      exploration: 0.6,
      collaboration: 0.4
    },
    physics: {
      gravity: 0.1,
      friction: 0.95,
      elasticity: 0.8,
      turbulence: 0.3
    },
    effects: {
      enableTrails: true,
      enableConnections: true,
      enableEvolution: true,
      enableEmergence: true,
      enableGlow: true
    }
  },
  controls: [
    {
      name: "particleCount.initial",
      type: "slider",
      label: "Initial Particles",
      min: 0,
      max: 1000,
      step: 50,
      default: 200
    },
    {
      name: "evolution.lifespanBase",
      type: "slider",
      label: "Base Particle Lifespan",
      min: 2.0,
      max: 20.0,
      step: 0.5,
      default: 8.0
    },
    {
      name: "evolution.mutationRate",
      type: "slider",
      label: "Mutation Rate",
      min: 0.0,
      max: 1.0,
      step: 0.1,
      default: 0.3
    },
    {
      name: "evolution.adaptationSpeed",
      type: "slider",
      label: "Adaptation Speed",
      min: 0.1,
      max: 3.0,
      step: 0.1,
      default: 1.5
    },
    {
      name: "evolution.complexityGrowth",
      type: "slider",
      label: "Complexity Growth",
      min: 0.0,
      max: 2.0,
      step: 0.1,
      default: 0.8
    },
    {
      name: "behavior.attraction",
      type: "slider",
      label: "Attraction Strength",
      min: 0.0,
      max: 1.0,
      step: 0.1,
      default: 0.4
    },
    {
      name: "behavior.socialBehavior",
      type: "slider",
      label: "Social Behavior",
      min: 0.0,
      max: 1.0,
      step: 0.1,
      default: 0.6
    },
    {
      name: "physics.turbulence",
      type: "slider",
      label: "Turbulence",
      min: 0.0,
      max: 1.0,
      step: 0.1,
      default: 0.3
    },
    {
      name: "effects.enableTrails",
      type: "checkbox",
      label: "Particle Trails",
      default: true
    },
    {
      name: "effects.enableConnections",
      type: "checkbox",
      label: "Dynamic Connections",
      default: true
    },
    {
      name: "effects.enableEvolution",
      type: "checkbox",
      label: "Active Evolution",
      default: true
    },
    {
      name: "effects.enableEmergence",
      type: "checkbox",
      label: "Emergent Behavior",
      default: true
    },
    {
      name: "colors.birth",
      type: "color",
      label: "Birth Color",
      default: "#FF6B9D"
    },
    {
      name: "colors.juvenile",
      type: "color",
      label: "Juvenile Color",
      default: "#4ECDC4"
    },
    {
      name: "colors.mature",
      type: "color",
      label: "Mature Color",
      default: "#45B7D1"
    },
    {
      name: "colors.elder",
      type: "color",
      label: "Elder Color",
      default: "#96CEB4"
    }
  ],
  audioMapping: {
    low: {
      description: "Controls particle birth and basic behavior",
      frequency: "20-250 Hz",
      effect: "Generation of new particles and fundamental movements"
    },
    mid: {
      description: "Influye en la evolucion y complejidad del sistema",
      frequency: "250-4000 Hz",
      effect: "Mutations, adaptations and social behaviors"
    },
    high: {
      description: "Desencadena eventos de emergencia y efectos avanzados",
      frequency: "4000+ Hz",
      effect: "Emergent behaviors and complex visual effects"
    }
  },
  performance: {
    complexity: "high",
    recommendedFPS: 60,
    gpuIntensive: true
  }
};

enum ParticleState {
  BIRTH = 0,
  JUVENILE = 1,
  MATURE = 2,
  ELDER = 3,
  DEATH = 4
}

class EvolutiveParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  mesh!: THREE.Mesh;
  trailMesh!: THREE.Line;
  
  age: number = 0;
  lifespan: number;
  state: ParticleState = ParticleState.BIRTH;
  
  // Propiedades evolutivas
  adaptability: number;
  socialTendency: number;
  explorationDrive: number;
  energyLevel: number;
  complexity: number;
  
  // Historial de posiciones para estelas
  trailPositions: THREE.Vector3[] = [];
  maxTrailLength: number = 20;
  
  // Conexiones con otras particulas
  connections: EvolutiveParticle[] = [];
  connectionStrength: number[] = [];
  
  constructor(position: THREE.Vector3, lifespan: number) {
    this.position = position.clone();
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.1
    );
    this.acceleration = new THREE.Vector3();
    this.lifespan = lifespan;
    
    // Propiedades evolutivas aleatorias
    this.adaptability = Math.random();
    this.socialTendency = Math.random();
    this.explorationDrive = Math.random();
    this.energyLevel = 0.5 + Math.random() * 0.5;
    this.complexity = 0.1 + Math.random() * 0.2;
    
    this.createMesh();
    this.createTrail();
  }
  
  private createMesh(): void {
    const size = 0.02 + this.complexity * 0.03;
    const geometry = new THREE.SphereGeometry(size, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: this.getStateColor(),
      transparent: true,
      opacity: 0.8
    });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(this.position);
  }
  
  private createTrail(): void {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color: this.getStateColor(),
      transparent: true,
      opacity: 0.3
    });
    
    this.trailMesh = new THREE.Line(geometry, material);
  }
  
  public getStateColor(): THREE.Color {
    const colors = {
      [ParticleState.BIRTH]: new THREE.Color("#FF6B9D"),
      [ParticleState.JUVENILE]: new THREE.Color("#4ECDC4"),
      [ParticleState.MATURE]: new THREE.Color("#45B7D1"),
      [ParticleState.ELDER]: new THREE.Color("#96CEB4"),
      [ParticleState.DEATH]: new THREE.Color("#FECA57")
    };
    
    return colors[this.state] || colors[ParticleState.BIRTH];
  }
  
  evolve(deltaTime: number, config: any): void {
    this.age += deltaTime;
    const ageRatio = this.age / this.lifespan;
    
    // Cambio de estado basado en edad
    if (ageRatio < 0.1) this.state = ParticleState.BIRTH;
    else if (ageRatio < 0.3) this.state = ParticleState.JUVENILE;
    else if (ageRatio < 0.7) this.state = ParticleState.MATURE;
    else if (ageRatio < 0.9) this.state = ParticleState.ELDER;
    else this.state = ParticleState.DEATH;
    
    // Evolucion de propiedades
    if (config.effects?.enableEvolution) {
      this.adaptability += (Math.random() - 0.5) * config.evolution.mutationRate * deltaTime;
      this.complexity += config.evolution.complexityGrowth * deltaTime * 0.1;
      this.energyLevel = Math.max(0.1, this.energyLevel - deltaTime * 0.05);
    }
    
    // Actualizar color
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    material.color.copy(this.getStateColor());
    
    // Actualizar tamano basado en complejidad
    const scale = 0.5 + this.complexity * 1.5 + this.energyLevel * 0.5;
    this.mesh.scale.setScalar(scale);
  }
  
  applyForces(forces: THREE.Vector3, config: any): void {
    // Aplicar fuerzas fisicas
    this.acceleration.copy(forces);
    
    // Turbulencia
    const turbulence = new THREE.Vector3(
      (Math.random() - 0.5) * config.physics.turbulence,
      (Math.random() - 0.5) * config.physics.turbulence,
      (Math.random() - 0.5) * config.physics.turbulence
    );
    this.acceleration.add(turbulence);
    
    // Integracion de movimiento
    this.velocity.add(this.acceleration.clone().multiplyScalar(1/60));
    this.velocity.multiplyScalar(config.physics.friction);
    this.position.add(this.velocity);
    
    // Actualizar posicion del mesh
    this.mesh.position.copy(this.position);
    
    // Actualizar estela
    this.updateTrail(config);
  }
  
  private updateTrail(config: any): void {
    if (!config.effects?.enableTrails) return;
    
    this.trailPositions.unshift(this.position.clone());
    if (this.trailPositions.length > this.maxTrailLength) {
      this.trailPositions.pop();
    }
    
    if (this.trailPositions.length > 1) {
      const newGeometry = new THREE.BufferGeometry().setFromPoints(this.trailPositions);
      this.trailMesh.geometry.dispose();
      this.trailMesh.geometry = newGeometry;

      const trailMaterial = this.trailMesh.material as THREE.LineBasicMaterial;
      trailMaterial.opacity = this.energyLevel * 0.3;
      trailMaterial.color.copy(this.getStateColor());
    }
  }
  
  socialInteraction(others: EvolutiveParticle[], config: any): THREE.Vector3 {
    const force = new THREE.Vector3();
    
    if (!config.effects?.enableEmergence) return force;
    
    others.forEach(other => {
      if (other === this) return;
      
      const distance = this.position.distanceTo(other.position);
      const direction = new THREE.Vector3().subVectors(other.position, this.position).normalize();
      
      // Atraccion social
      if (distance < 1.0 && this.socialTendency > 0.5) {
        const attraction = direction.clone().multiplyScalar(
          config.behavior.attraction * this.socialTendency * (1 / distance)
        );
        force.add(attraction);
      }
      
      // Repulsion para evitar aglomeraciones
      if (distance < 0.5) {
        const repulsion = direction.clone().multiplyScalar(
          -config.behavior.repulsion * (0.5 / distance)
        );
        force.add(repulsion);
      }
      
      // Alineamiento con vecinos
      if (distance < 0.8) {
        const alignment = other.velocity.clone().normalize().multiplyScalar(
          config.behavior.alignment * 0.1
        );
        force.add(alignment);
      }
    });
    
    return force;
  }
  
  isDead(): boolean {
    return this.age >= this.lifespan || this.energyLevel <= 0;
  }
  
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.trailMesh.geometry.dispose();
    (this.trailMesh.material as THREE.Material).dispose();
  }
}

class ParticleConnectionSystem {
  connections: THREE.Line[] = [];
  
  update(particles: EvolutiveParticle[], config: any, scene: THREE.Scene): void {
    // Limpiar conexiones anteriores
    this.connections.forEach(connection => {
      scene.remove(connection);
      connection.geometry.dispose();
      (connection.material as THREE.Material).dispose();
    });
    this.connections = [];
    
    if (!config.effects?.enableConnections) return;
    
    // Crear nuevas conexiones
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const p1 = particles[i];
        const p2 = particles[j];
        const distance = p1.position.distanceTo(p2.position);
        
        // Conectar particulas cercanas con alta afinidad social
        if (distance < 0.8 && p1.socialTendency > 0.6 && p2.socialTendency > 0.6) {
          const geometry = new THREE.BufferGeometry().setFromPoints([
            p1.position,
            p2.position
          ]);
          
          const material = new THREE.LineBasicMaterial({
            color: new THREE.Color(config.colors.connections),
            transparent: true,
            opacity: (1 - distance / 0.8) * 0.3
          });
          
          const connection = new THREE.Line(geometry, material);
          this.connections.push(connection);
          scene.add(connection);
        }
      }
    }
  }
  
  dispose(scene: THREE.Scene): void {
    this.connections.forEach(connection => {
      scene.remove(connection);
      connection.geometry.dispose();
      (connection.material as THREE.Material).dispose();
    });
    this.connections = [];
  }
}

class EvolutiveParticlesPreset extends BasePreset {
  private particles: EvolutiveParticle[] = [];
  private connectionSystem: ParticleConnectionSystem;
  private spawnTimer: number = 0;
  private currentSpawnRate: number = 0.5;
  private emergenceTimer: number = 0;
  private currentConfig: any;
  private attractors: THREE.Vector3[] = [];
  
  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    config: PresetConfig,
    private shaderCode?: string
  ) {
    super(scene, camera, renderer, config);
    
    this.currentConfig = { ...config.defaultConfig };
    this.connectionSystem = new ParticleConnectionSystem();
    this.initializeAttractors();
  }
  
  private initializeAttractors(): void {
    // Crear puntos de atraccion dinamicos
    for (let i = 0; i < 5; i++) {
      this.attractors.push(new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 2
      ));
    }
  }
  
  public init(): void {
    this.createInitialParticles();
  }
  
  private createInitialParticles(): void {
    const count = this.currentConfig.particleCount.initial ?? this.currentConfig.particleCount.base;

    for (let i = 0; i < count; i++) {
      this.spawnParticle();
    }
  }
  
  private spawnParticle(): void {
    const position = new THREE.Vector3(
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 1
    );
    
    const lifespan = this.currentConfig.evolution.lifespanBase * (0.5 + Math.random());
    const particle = new EvolutiveParticle(position, lifespan);
    
    this.particles.push(particle);
    this.scene.add(particle.mesh);
    this.scene.add(particle.trailMesh);
  }
  
  public update(): void {
    const deltaTime = this.clock.getDelta();
    const time = this.clock.getElapsedTime();
    
    // Actualizar atractores dinamicos
    this.updateAttractors(time);
    
    // Spawn dinamico basado en audio con suavizado
    const targetCount = Math.floor(
      THREE.MathUtils.lerp(
        this.currentConfig.particleCount.base,
        this.currentConfig.particleCount.evolved,
        this.audioData.low
      )
    );
    const maxCount = this.currentConfig.particleCount.maximum;
    const limitedTarget = Math.min(targetCount, maxCount);

    const targetSpawnRate = 0.5 + this.audioData.low * 2;
    this.currentSpawnRate = THREE.MathUtils.lerp(this.currentSpawnRate, targetSpawnRate, 0.1);

    this.spawnTimer += deltaTime;
    while (this.spawnTimer > 1 / this.currentSpawnRate && this.particles.length < limitedTarget) {
      this.spawnTimer -= 1 / this.currentSpawnRate;
      this.spawnParticle();
    }
    
    // Eventos de emergencia
    this.emergenceTimer += deltaTime;
    if (this.emergenceTimer > 2.0 && this.audioData.high > 0.7) {
      this.triggerEmergenceEvent();
      this.emergenceTimer = 0;
    }
    
    // Actualizar particulas
    this.particles.forEach(particle => {
      // Evolucion
      particle.evolve(deltaTime, this.currentConfig);
      
      // Fuerzas
      const forces = this.calculateForces(particle);
      particle.applyForces(forces, this.currentConfig);
    });
    
    // Remover particulas muertas
    this.particles = this.particles.filter(particle => {
      if (particle.isDead()) {
        this.scene.remove(particle.mesh);
        this.scene.remove(particle.trailMesh);
        particle.dispose();
        return false;
      }
      return true;
    });
    
    // Actualizar conexiones
    this.connectionSystem.update(this.particles, this.currentConfig, this.scene);

    applyVFX(this.renderer.domElement, this.audioData);
  }
  
  private updateAttractors(time: number): void {
    this.attractors.forEach((attractor, index) => {
      const offset = index * Math.PI * 0.4;
      attractor.x = Math.sin(time * 0.3 + offset) * 2;
      attractor.y = Math.cos(time * 0.2 + offset) * 1.5;
      attractor.z = Math.sin(time * 0.1 + offset) * 0.5;
    });
  }
  
  private calculateForces(particle: EvolutiveParticle): THREE.Vector3 {
    const totalForce = new THREE.Vector3();
    
    // Atraccion hacia puntos dinamicos
    this.attractors.forEach(attractor => {
      const distance = particle.position.distanceTo(attractor);
      if (distance > 0.1) {
        const attraction = new THREE.Vector3()
          .subVectors(attractor, particle.position)
          .normalize()
          .multiplyScalar(this.currentConfig.behavior.attraction * particle.adaptability / distance);
        totalForce.add(attraction);
      }
    });
    
    // Fuerzas sociales
    const socialForce = particle.socialInteraction(this.particles, this.currentConfig);
    totalForce.add(socialForce);
    
    // Respuesta al audio
    const audioForce = new THREE.Vector3(
      this.audioData.low * 0.1,
      this.audioData.mid * 0.1,
      this.audioData.high * 0.1
    );
    totalForce.add(audioForce);
    
    // Gravedad
    totalForce.y -= this.currentConfig.physics.gravity * 0.01;
    
    return totalForce;
  }
  
  private triggerEmergenceEvent(): void {
    if (!this.currentConfig.effects?.enableEmergence) return;
    
    // Aumentar energia de todas las particulas
    this.particles.forEach(particle => {
      particle.energyLevel = Math.min(1.0, particle.energyLevel + 0.3);
      particle.complexity += 0.1;
    });
    
    // Crear nuevas conexiones temporales
    const connectionsToAdd = Math.floor(this.particles.length * 0.1);
    for (let i = 0; i < connectionsToAdd; i++) {
      this.spawnParticle();
    }
  }
  
  public updateConfig(newConfig: any): void {
    this.currentConfig = this.deepMerge(this.currentConfig, newConfig);
    
    if (newConfig.colors) {
      this.updateColors();
    }
  }
  
  private updateColors(): void {
    this.particles.forEach(particle => {
      const material = particle.mesh.material as THREE.MeshBasicMaterial;
      material.color.copy(particle.getStateColor());
    });
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
    this.particles.forEach(particle => {
      this.scene.remove(particle.mesh);
      this.scene.remove(particle.trailMesh);
      particle.dispose();
    });
    
    this.connectionSystem.dispose(this.scene);
    this.particles = [];
  }
}

export function createPreset(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  config: PresetConfig,
  shaderCode?: string
): BasePreset {
  return new EvolutiveParticlesPreset(scene, camera, renderer, config, shaderCode);
}