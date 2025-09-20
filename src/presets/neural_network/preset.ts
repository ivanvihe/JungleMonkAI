import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';
import { applyVFX } from './vfx';

export const config: PresetConfig = {
  name: 'Infinite Neural Journey',
  description: 'Endless stream of connected nodes forming a neural network starfield.',
  author: 'AudioVisualizer',
  version: '1.0.0',
  category: 'ai',
  tags: ['neural', 'network', 'infinite', 'starfield'],
  thumbnail: 'neural_network_thumb.png',
  note: 54,
  defaultConfig: {
    speed: 5,
    nodeSize: 0.05,
    colors: {
      node: '#8e44ad',
      connection: '#3498db'
    }
  },
  controls: [
    {
      name: 'speed',
      type: 'slider',
      label: 'Travel Speed',
      min: 1,
      max: 20,
      step: 0.5,
      default: 5
    },
    {
      name: 'nodeSize',
      type: 'slider',
      label: 'Node Size',
      min: 0.02,
      max: 0.2,
      step: 0.01,
      default: 0.05
    },
    {
      name: 'colors.node',
      type: 'color',
      label: 'Node Color',
      default: '#8e44ad'
    },
    {
      name: 'colors.connection',
      type: 'color',
      label: 'Connection Color',
      default: '#3498db'
    }
  ],
  audioMapping: {
    low: {
      description: 'Controls node pulsing',
      frequency: '20-250 Hz',
      effect: 'Node scale'
    },
    mid: {
      description: 'Controls connection brightness',
      frequency: '250-4000 Hz',
      effect: 'Line opacity'
    },
    high: {
      description: 'Controls travel speed',
      frequency: '4000+ Hz',
      effect: 'Camera velocity'
    }
  },
  performance: {
    complexity: 'medium',
    recommendedFPS: 60,
    gpuIntensive: false
  }
};

class Node {
  public mesh: THREE.Mesh;
  public position: THREE.Vector3;

  constructor(position: THREE.Vector3, material: THREE.MeshBasicMaterial, size: number) {
    const geometry = new THREE.SphereGeometry(size, 8, 8);
    this.mesh = new THREE.Mesh(geometry, material);
    this.position = this.mesh.position;
    this.position.copy(position);
  }

  update(audio: number, time: number): void {
    const pulse = 1 + Math.sin(time * 5 + this.position.x) * 0.3 * audio;
    this.mesh.scale.setScalar(pulse);
  }

  setColor(color: THREE.Color): void {
    (this.mesh.material as THREE.MeshBasicMaterial).color.copy(color);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

class Connection {
  public line: THREE.Line;
  constructor(public a: Node, public b: Node, material: THREE.LineBasicMaterial) {
    const geometry = new THREE.BufferGeometry().setFromPoints([a.position, b.position]);
    this.line = new THREE.Line(geometry, material);
  }

  update(audio: number): void {
    this.line.geometry.setFromPoints([this.a.position, this.b.position]);
    (this.line.material as THREE.LineBasicMaterial).opacity = 0.3 + audio * 0.7;
  }

  setColor(color: THREE.Color): void {
    (this.line.material as THREE.LineBasicMaterial).color.copy(color);
  }

  dispose(): void {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}

export class InfiniteNeuralNetwork extends BasePreset {
  private nodes: Node[] = [];
  private connections: Connection[] = [];
  private currentConfig: any;
  // Track next negative Z position where a node will be spawned so we can
  // simulate traveling inward along the network
  private nextSpawnZ = 0;
  private initialCameraPosition = new THREE.Vector3();
  private initialCameraQuaternion = new THREE.Quaternion();
  private originalBackground: THREE.Color | THREE.Texture | null = null;
  private originalOverrideMaterial: THREE.Material | null = null;

  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, config: PresetConfig) {
    super(scene, camera, renderer, config);
    this.currentConfig = JSON.parse(JSON.stringify(config.defaultConfig));
  }

  init(): void {
    // Guardar estado inicial de la escena y camara
    this.originalBackground = this.scene.background;
    this.originalOverrideMaterial = this.scene.overrideMaterial;
    this.initialCameraPosition.copy(this.camera.position);
    this.initialCameraQuaternion.copy(this.camera.quaternion);

    // Asegurar scene transparente
    this.scene.background = null;
    this.scene.overrideMaterial = null;

    // Colocar camara en origen mirando al eje X
    // this.camera.position.set(0, 0, 0);
    // this.camera.lookAt(1, 0, 0);

    // Generar nodos iniciales delante de la camara
    while (this.nextSpawnZ > -50) {
      this.spawnNode();
    }
  }

  private spawnNode(): void {
    const size = this.currentConfig.nodeSize;

    // Reduce spacing between nodes for higher density
    // Instead of moving along the X axis we spawn nodes further down
    // the negative Z axis so the network appears to approach the camera
    const z = this.nextSpawnZ - Math.random() * 1 - 0.5;
    const x = (Math.random() - 0.5) * 4;
    const y = (Math.random() - 0.5) * 4;
    const node = new Node(new THREE.Vector3(x, y, z), this.createNodeMaterial(), size);
    this.scene.add(node.mesh);
    this.nodes.push(node);

    // Connect to several previous nodes to create a denser network
    if (this.nodes.length > 1) {
      const prev = this.nodes[this.nodes.length - 2];
      const connection = new Connection(prev, node, this.createConnectionMaterial());
      this.scene.add(connection.line);
      this.connections.push(connection);

      // Add additional random connections for richer structure
      const connectionCount = Math.min(2, this.nodes.length - 2);
      for (let i = 0; i < connectionCount; i++) {
        const randomIndex = Math.floor(Math.random() * (this.nodes.length - 2));
        const randomNode = this.nodes[randomIndex];
        const extraConn = new Connection(randomNode, node, this.createConnectionMaterial());
        this.scene.add(extraConn.line);
        this.connections.push(extraConn);
      }
    }

    // Record last spawn position (more negative)
    this.nextSpawnZ = z;
  }

  // CORRECCION: Metodos para crear materiales con configuracion correcta
  private createNodeMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.currentConfig.colors.node),
      transparent: true,
      opacity: 0.9, // Casi opaco pero con algo de transparencia
      blending: THREE.NormalBlending, // Cambiar de AdditiveBlending a NormalBlending
      depthWrite: false, // Importante para transparencia
      depthTest: true
    });
  }

  private createConnectionMaterial(): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({
      color: new THREE.Color(this.currentConfig.colors.connection),
      transparent: true,
      opacity: 0.7,
      blending: THREE.NormalBlending, // Cambiar de AdditiveBlending
      linewidth: 1
    });
  }

  private removeNode(node: Node): void {
    this.scene.remove(node.mesh);
    node.dispose();
    this.connections = this.connections.filter(conn => {
      if (conn.a === node || conn.b === node) {
        this.scene.remove(conn.line);
        conn.dispose();
        return false;
      }
      return true;
    });
  }

  update(): void {
    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();
    const audioIntensity = (this.audioData.low + this.audioData.mid + this.audioData.high) / 3;

    const speed = this.currentConfig.speed * (0.5 + this.audioData.high);
    // Move the entire scene content instead of the camera
    // Move the scene forward on Z so the viewer travels inward
    this.scene.position.z += delta * speed;
    // Continuously spawn nodes ahead of the camera
    while (this.nextSpawnZ > -50 - this.scene.position.z) {
      this.spawnNode();
    }

    // Remove nodes that are far behind the camera to keep memory usage stable
    while (this.nodes.length && this.nodes[0].position.z + this.scene.position.z > 20) {
      const old = this.nodes.shift()!;
      this.removeNode(old);
    }

    this.nodes.forEach(n => n.update(audioIntensity, time));
    this.connections.forEach(c => c.update(this.audioData.mid));

    applyVFX(this.renderer.domElement, this.audioData);
  }

  updateConfig(newConfig: any): void {
    this.currentConfig = this.deepMerge(this.currentConfig, newConfig);
    
    // Recrear materiales con nueva configuracion
    const nodeMaterial = this.createNodeMaterial();
    const connMaterial = this.createConnectionMaterial();
    const nodeColor = new THREE.Color(this.currentConfig.colors.node);
    const connColor = new THREE.Color(this.currentConfig.colors.connection);
    this.nodes.forEach(n => n.setColor(nodeColor));
    this.connections.forEach(c => c.setColor(connColor));
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

  dispose(): void {
    this.nodes.forEach(n => {
      this.scene.remove(n.mesh);
      n.dispose();
    });
    this.connections.forEach(c => {
      this.scene.remove(c.line);
      c.dispose();
    });
    this.nodes = [];
    this.connections = [];

    // Restaurar estado original de escena y camara
    // this.scene.background = this.originalBackground;
    // this.scene.overrideMaterial = this.originalOverrideMaterial;
    // this.camera.position.copy(this.initialCameraPosition);
    // this.camera.quaternion.copy(this.initialCameraQuaternion);
  }
}

export function createPreset(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  config: PresetConfig
): BasePreset {
  return new InfiniteNeuralNetwork(scene, camera, renderer, config);
}

