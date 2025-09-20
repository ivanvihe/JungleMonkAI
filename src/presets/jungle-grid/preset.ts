import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';
import { triggerClipFlash, applyVFX } from './vfx';

// Interfaz para la información de tracks
interface TrackInfo {
  name: string;
  index: number;
  clips: Array<{
    name: string;
    index: number;
    isPlaying: boolean;
    color?: string;
  }>;
  color?: string;
}

// Cliente WebSocket mejorado para comunicación con Ableton
class AbletonRemoteClient {
  private ws: WebSocket | null = null;
  private connectionPromise: Promise<void> | null = null;
  private reconnectTimeout: number | null = null;
  private isConnecting = false;
  private connectionAttempts = 0;
  private maxReconnectAttempts = 10;
  private hasAnnouncedConnection = false;

  constructor() {
    this.connect();
  }

  private async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return this.connectionPromise || Promise.resolve();
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.isConnecting = true;
    this.connectionAttempts++;
    
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket('ws://127.0.0.1:9888');
        
        this.ws.onopen = () => {
          if (!this.hasAnnouncedConnection) {
            console.log('Ableton remote connected');
            this.hasAnnouncedConnection = true;
          }
          this.isConnecting = false;
          this.connectionAttempts = 0;

          if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
          }
          resolve();
        };

        this.ws.onerror = (error) => {
          console.error('JungleGrid: WebSocket error:', error);
          this.isConnecting = false;
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.hasAnnouncedConnection = false;
          this.ws = null;
          this.connectionPromise = null;
          this.isConnecting = false;

          if (this.connectionAttempts < this.maxReconnectAttempts && !this.reconnectTimeout) {
            const delay = Math.min(5000 + (this.connectionAttempts * 2000), 30000);
            this.reconnectTimeout = window.setTimeout(() => {
              this.reconnectTimeout = null;
              this.connect();
            }, delay);
          } else if (this.connectionAttempts >= this.maxReconnectAttempts) {
            console.error('JungleGrid: Maximum reconnection attempts reached');
          }
        };

        this.ws.onmessage = () => {};

        // Timeout de conexión más largo
        setTimeout(() => {
          if (this.isConnecting) {
            console.error('JungleGrid: ⏱️ Timeout de conexión (15s)');
            this.isConnecting = false;
            if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
              this.ws.close();
            }
            reject(new Error('Connection timeout'));
          }
        }, 15000);

      } catch (error) {
        console.error('JungleGrid: Error creando WebSocket:', error);
        this.isConnecting = false;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  async getTracksInfo(): Promise<TrackInfo[]> {
    try {
      await this.connect();
      
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return [];
      }

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.ws?.removeEventListener('message', onMessage);
          resolve([]);
        }, 10000);

        const onMessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            
            // Manejar diferentes tipos de respuesta del remote script
            if (data.status === 'ok' &&
                (data.type === 'tracks_info' ||
                 data.tracks ||
                 data.result ||
                 (data.session && data.session.tracks) ||
                 (data.project && data.project.tracks))) {
              
              clearTimeout(timeout);
              this.ws?.removeEventListener('message', onMessage);
              
              // Extraer tracks de diferentes formatos de respuesta
              let tracks: TrackInfo[] = [];
              
              if (data.tracks && Array.isArray(data.tracks)) {
                tracks = data.tracks;
              } else if (data.session && Array.isArray(data.session.tracks)) {
                tracks = data.session.tracks;
              } else if (data.project && Array.isArray(data.project.tracks)) {
                tracks = data.project.tracks;
              } else if (data.result && Array.isArray(data.result)) {
                tracks = data.result;
              } else if (Array.isArray(data)) {
                tracks = data;
              }
              

              
              resolve(tracks);
            } else if (data.status === 'error') {
              console.error('JungleGrid: ❌ Error del servidor:', data.message);
              clearTimeout(timeout);
              this.ws?.removeEventListener('message', onMessage);
              resolve([]);
            }
          } catch (error) {
            console.error('JungleGrid: Error parsing respuesta:', error);
            console.error('JungleGrid: Raw data:', event.data);
            clearTimeout(timeout);
            this.ws?.removeEventListener('message', onMessage);
            resolve([]);
          }
        };

        this.ws.addEventListener('message', onMessage);
        
        // Enviar múltiples formatos de solicitud
        const requests = [
          { type: 'get_tracks_info' },
          { action: 'get_tracks' },
          { command: 'tracks_info' },
          { type: 'session_info' }
        ];
        
        requests.forEach((request, index) => {
          setTimeout(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify(request));
            }
          }, index * 200); // Más tiempo entre solicitudes
        });
      });

    } catch (error) {
      console.error('JungleGrid: Error obteniendo tracks info:', error);
      return [];
    }
  }

  async getTempo(): Promise<number | null> {
    try {
      await this.connect();

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return null;
      }

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.ws?.removeEventListener('message', onMessage);
          resolve(null);
        }, 5000);

        const onMessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            let tempo: number | null = null;

            if (typeof data.tempo === 'number') {
              tempo = data.tempo;
            } else if (data.result && typeof data.result.tempo === 'number') {
              tempo = data.result.tempo;
            } else if (typeof data.bpm === 'number') {
              tempo = data.bpm;
            } else if (data.song_tempo && typeof data.song_tempo === 'number') {
              tempo = data.song_tempo;
            }

            if (tempo !== null) {
              clearTimeout(timeout);
              this.ws?.removeEventListener('message', onMessage);
              resolve(tempo);
            }
          } catch (err) {
            // Ignore parse errors
          }
        };

        this.ws.addEventListener('message', onMessage);

        // Try a single, standard command first.
        const request = { command: 'get_tempo' };
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(request));
        }
      });
    } catch (error) {
      console.error('JungleGrid: Error obteniendo tempo:', error);
      return null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getConnectionStatus(): string {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'closed';
      default: return 'unknown';
    }
  }

  resetConnection(): void {
    this.connectionAttempts = 0;
    this.disconnect();
    setTimeout(() => this.connect(), 1000);
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connectionPromise = null;
    this.isConnecting = false;
  }
}

interface GridCell {
  mesh: THREE.Line;
  material: THREE.LineBasicMaterial;
  trackIndex: number;
  clipIndex: number;
  label: THREE.Sprite | null;
}

function createClipLabel(text: string, width: number, height: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.font = '48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, height, 1);
  (sprite as any).userData = { text };
  return sprite;
}

class JungleGridPreset extends BasePreset {
  private client: AbletonRemoteClient;
  private tracks: TrackInfo[] = [];
  private lastFetch = 0;
  private gridGroup: THREE.Group;
  private gridCells: GridCell[] = [];
  private blinkPhase = 0;
  private connectionStatus = 'connecting';
  private statusUpdateInterval: number | null = null;
  private lastTrackCountLogged = -1;
  private cellWidth = 0.8;
  private cellHeight = 0.8;

  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, config: PresetConfig) {
    super(scene, camera, renderer, config);

    this.client = new AbletonRemoteClient();
    this.gridGroup = new THREE.Group();
    this.scene.add(this.gridGroup);
  }

  init() {
    // Set camera position to view the grid
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.position.set(0, 0, 10);
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix();
    }
    
    // Start with empty grid
    this.createGrid();

    // Status update interval
    this.statusUpdateInterval = window.setInterval(() => {
      this.updateConnectionStatus();
    }, 2000);

  }

  private updateConnectionStatus(): void {
    const connected = this.client.isConnected();
    const newStatus = connected ? 'connected' : 'disconnected';

    if (newStatus !== this.connectionStatus) {
      this.connectionStatus = newStatus;
      if (connected) {
        console.log(`JungleGrid: connected (${this.tracks.length} tracks)`);
      } else {
        console.log('JungleGrid: disconnected. Trying to reconnect...');
      }
    }
  }

  async update() {
    const timeMs = performance.now();
    const period = this.bpm ? (60 / this.bpm) * 1000 : this.config.defaultConfig.blink.periodMs;
    this.blinkPhase = (this.blinkPhase + this.clock.getDelta() * 1000) % period;

    await this.fetchDataIfNeeded(timeMs);
    this.updateGrid();

    // Mantener cámara perpendicular al grid
    this.camera.position.x = 0;

    applyVFX(this.renderer.domElement, this.audioData);
  }

  async fetchDataIfNeeded(timeMs: number) {
    if (timeMs - this.lastFetch >= 50) { // Faster updates
      this.lastFetch = timeMs;
      
      try {
        const [tracks, tempo] = await Promise.all([
          this.client.getTracksInfo(),
          this.client.getTempo()
        ]);

        const tracksStr = JSON.stringify(tracks);
        const currentStr = JSON.stringify(this.tracks);

        if (tracksStr !== currentStr) {
          this.tracks = Array.isArray(tracks) ? tracks : [];
          this.createGrid();

          if (this.tracks.length !== this.lastTrackCountLogged) {
            console.log(`JungleGrid: ${this.tracks.length} tracks detectados`);
            this.lastTrackCountLogged = this.tracks.length;
          }
        }

        if (typeof tempo === 'number' && !isNaN(tempo)) {
          this.setBpm(tempo);
        }
      } catch (error) {
        console.error('JungleGrid: Error fetching data:', error);
      }
    }
  }

  private createGrid(): void {
    // Limpiar grid existente
    this.gridCells.forEach(cell => {
      this.gridGroup.remove(cell.mesh);
      cell.mesh.geometry.dispose();
      cell.material.dispose();
      if (cell.label) {
        this.gridGroup.remove(cell.label);
        cell.label.material.map?.dispose();
        (cell.label.material as THREE.SpriteMaterial).dispose();
      }
    });
    this.gridCells = [];

    if (this.tracks.length === 0) {
      this.createEmptyGrid();
      return;
    }
    
    const maxTracks = Math.min(this.tracks.length, 8);
    const maxClips = 8;
    const cellWidth = this.cellWidth;
    const cellHeight = this.cellHeight;
    const spacing = 0.1;

    for (let trackIndex = 0; trackIndex < maxTracks; trackIndex++) {
      const track = this.tracks[trackIndex];
      
      for (let clipIndex = 0; clipIndex < maxClips; clipIndex++) {
        const x = (trackIndex - maxTracks / 2) * (cellWidth + spacing);
        const y = (maxClips - clipIndex - 1 - maxClips / 2) * (cellHeight + spacing);

        // Crear cell border
        const geometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(cellWidth, cellHeight));
        const material = new THREE.LineBasicMaterial({
          color: this.config.defaultConfig.grid.stroke,
          linewidth: this.config.defaultConfig.grid.strokeWidth,
          transparent: true,
          opacity: 0.6
        });

        const mesh = new THREE.LineSegments(geometry, material);
        mesh.position.set(x, y, 0);
        mesh.rotation.set(0, 0, 0);
        this.gridGroup.add(mesh);

        const clip = track && track.clips ? track.clips[clipIndex] : null;
        const label = clip ? createClipLabel(clip.name || '', cellWidth, cellHeight) : createClipLabel('', cellWidth, cellHeight);
        label.position.set(x, y, 0.01);
        label.visible = !!clip;
        this.gridGroup.add(label);

        this.gridCells.push({
          mesh: mesh as THREE.Line,
          material,
          trackIndex,
          clipIndex,
          label
        });
      }
    }

  }

  private createEmptyGrid(): void {
    const gridSize = 8;
    const cellWidth = 0.8;
    const cellHeight = 0.8;
    const spacing = 0.1;

    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        const posX = (x - gridSize / 2) * (cellWidth + spacing);
        const posY = (gridSize - y - 1 - gridSize / 2) * (cellHeight + spacing);

        const geometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(cellWidth, cellHeight));
        const material = new THREE.LineBasicMaterial({
          color: '#333333',
          linewidth: 1,
          transparent: true,
          opacity: 0.5
        });

        const mesh = new THREE.LineSegments(geometry, material);
        mesh.position.set(posX, posY, 0);
        this.gridGroup.add(mesh);

        const label = createClipLabel('', cellWidth, cellHeight);
        label.position.set(posX, posY, 0.01);
        label.visible = false;
        this.gridGroup.add(label);

        this.gridCells.push({
          mesh: mesh as THREE.Line,
          material,
          trackIndex: -1,
          clipIndex: -1,
          label
        });
      }
    }
  }

  private updateGrid(): void {
    this.gridCells.forEach(cell => {
      if (cell.trackIndex >= 0 && cell.trackIndex < this.tracks.length) {
        const track = this.tracks[cell.trackIndex];
        const clip = track.clips && track.clips[cell.clipIndex];

        if (clip) {
          if (cell.label) {
            const current = (cell.label as any).userData?.text || '';
            if (current !== clip.name) {
              this.gridGroup.remove(cell.label);
              cell.label.material.map?.dispose();
              const newLabel = createClipLabel(clip.name || '', this.cellWidth, this.cellHeight);
              newLabel.position.copy(cell.label.position);
              this.gridGroup.add(newLabel);
              cell.label = newLabel;
            }
            cell.label.visible = true;
          }

          if (clip.isPlaying) {
            cell.material.color.setHex(parseInt(this.config.defaultConfig.colors.clipActive.replace('#', ''), 16));
            cell.material.opacity = 1.0; // Always bright
            triggerClipFlash(this.renderer.domElement);
          } else {
            cell.material.color.setHex(parseInt(this.config.defaultConfig.colors.clipIdle.replace('#', ''), 16));
            cell.material.opacity = 0.7; // Slightly dimmer
          }
        } else {
          if (cell.label) cell.label.visible = false;
          cell.material.color.setHex(0x333333);
          cell.material.opacity = 0.5; // Brighter empty cells
        }
      } else {
        if (cell.label) cell.label.visible = false;
        cell.material.color.setHex(0x222222);
        cell.material.opacity = 0.5; // Brighter empty grid
      }
    });
  }

  updateConfig(newConfig: any): void {
    // Actualizar configuración si es necesario
    if (newConfig.refreshMs !== undefined) {
    }
  }

  dispose(): void {
    
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = null;
    }
    
    this.gridCells.forEach(cell => {
      this.gridGroup.remove(cell.mesh);
      cell.mesh.geometry.dispose();
      cell.material.dispose();
      if (cell.label) {
        this.gridGroup.remove(cell.label);
        cell.label.material.map?.dispose();
        (cell.label.material as THREE.SpriteMaterial).dispose();
      }
    });
    
    this.scene.remove(this.gridGroup);
    this.client.disconnect();
    
  }
}

export function createPreset(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  cfg: PresetConfig,
  shaderCode?: string
): BasePreset {
  return new JungleGridPreset(scene, camera, renderer, cfg);
}