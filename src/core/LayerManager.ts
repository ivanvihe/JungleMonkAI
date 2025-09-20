import * as THREE from 'three';
import { PresetLoader, LoadedPreset } from './PresetLoader';
import { setNestedValue } from '../utils/objectPath';
import {
  VideoResource,
  VideoPlaybackSettings,
  DEFAULT_VIDEO_PLAYBACK_SETTINGS,
} from '../types/video';
import { getCachedVideoUrl, releaseCachedUrl } from '../utils/videoCache';

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export interface LayerState {
  preset: LoadedPreset | null;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  opacity: number;
  fadeTime: number;
  isActive: boolean;
  videoElement: HTMLVideoElement;
  activeVideoId: string | null;
  videoObjectUrl?: string;
  videoSettings: VideoPlaybackSettings;
  videoPlaybackRaf: number | null;
  videoPlaybackDirection: 1 | -1;
  videoReady: boolean;
  videoLoadToken: number;
  videoStallRecoveryTimeout: ReturnType<typeof setTimeout> | null;
}

/**
 * Maneja la creacion, activacion y renderizado de layers.
 */
export class LayerManager {
  private layers: Map<string, LayerState> = new Map();
  private layerOrder: string[] = ['C', 'B', 'A'];
  private videoRegistry: Map<string, VideoResource> = new Map();

  constructor(
    private container: HTMLElement,
    private baseCamera: THREE.PerspectiveCamera,
    private presetLoader: PresetLoader
  ) {
    this.layerOrder.forEach(id => this.createLayer(id));
  }

  private createLayer(id: string): void {
    const scene = new THREE.Scene();
    scene.background = null;
    scene.overrideMaterial = null;

    const camera = this.baseCamera.clone() as THREE.PerspectiveCamera;

    const canvas = document.createElement('canvas');
    canvas.className = `layer-canvas layer-${id}`;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const zIndex = this.layerOrder.indexOf(id) + 1;
    canvas.style.zIndex = zIndex.toString();
    canvas.style.pointerEvents = 'none';
    canvas.style.opacity = '0';
    this.container.appendChild(canvas);

    const video = document.createElement('video');
    video.className = `layer-video layer-${id}`;
    video.style.position = 'absolute';
    video.style.top = '0';
    video.style.left = '0';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.style.zIndex = zIndex.toString();
    video.style.mixBlendMode = 'normal';
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.controls = false;
    video.defaultPlaybackRate = 1;
    if ('disablePictureInPicture' in video) {
      try {
        (video as HTMLVideoElement & { disablePictureInPicture?: boolean }).disablePictureInPicture = true;
      } catch {
        /* ignore */
      }
    }
    if ('disableRemotePlayback' in video) {
      try {
        (video as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;
      } catch {
        /* ignore */
      }
    }
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    this.container.appendChild(video);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const layerState: LayerState = {
      preset: null,
      scene,
      camera,
      renderer,
      opacity: 1.0,
      fadeTime: 1000,
      isActive: false,
      videoElement: video,
      activeVideoId: null,
      videoSettings: { ...DEFAULT_VIDEO_PLAYBACK_SETTINGS },
      videoPlaybackRaf: null,
      videoPlaybackDirection: 1,
      videoReady: false,
      videoLoadToken: 0,
      videoStallRecoveryTimeout: null,
    };

    this.layers.set(id, layerState);
    const recoverPlayback = () => this.handleVideoStall(layerState);
    const clearRecovery = () => this.clearVideoRecovery(layerState);
    video.addEventListener('waiting', recoverPlayback);
    video.addEventListener('stalled', recoverPlayback);
    video.addEventListener('error', recoverPlayback);
    video.addEventListener('playing', clearRecovery);
    video.addEventListener('canplay', clearRecovery);
    video.addEventListener('canplaythrough', clearRecovery);
    video.addEventListener('loadeddata', clearRecovery);
    console.log(`🔧 Layer ${id} creado con canvas propio`);
  }

  public setVideoRegistry(videos: VideoResource[]): void {
    this.videoRegistry.clear();
    videos.forEach(video => this.videoRegistry.set(video.id, video));
  }

  private clearVideoRecovery(layer: LayerState): void {
    if (layer.videoStallRecoveryTimeout !== null) {
      clearTimeout(layer.videoStallRecoveryTimeout);
      layer.videoStallRecoveryTimeout = null;
    }
  }

  private stopVideoPlayback(layer: LayerState): void {
    const video = layer.videoElement;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.style.opacity = '0';
    video.style.mixBlendMode = 'normal';
    this.stopCustomVideoPlayback(layer);
    this.clearVideoRecovery(layer);
    if (layer.videoObjectUrl) {
      releaseCachedUrl(layer.videoObjectUrl);
      layer.videoObjectUrl = undefined;
    }
    layer.activeVideoId = null;
    layer.videoReady = false;
    layer.videoLoadToken++;
  }

  private stopCustomVideoPlayback(layer: LayerState): void {
    if (layer.videoPlaybackRaf !== null) {
      cancelAnimationFrame(layer.videoPlaybackRaf);
      layer.videoPlaybackRaf = null;
    }
  }

  private startNativeVideoPlayback(layer: LayerState): void {
    const video = layer.videoElement;
    this.clearVideoRecovery(layer);
    const playResult = video.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(err => console.warn('Unable to start video playback', err));
    }
  }

  private handleVideoStall(layer: LayerState): void {
    if (!layer.activeVideoId || !layer.videoReady) {
      return;
    }
    if (layer.videoPlaybackRaf !== null) {
      return;
    }
    if (layer.videoSettings.reverse || layer.videoSettings.loopMode === 'pingpong') {
      return;
    }
    const video = layer.videoElement;
    if (video.ended) {
      return;
    }

    const attemptResume = () => {
      const playResult = video.play();
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(err => console.warn('Unable to resume stalled video', err));
      }
    };

    if (layer.videoStallRecoveryTimeout !== null) {
      clearTimeout(layer.videoStallRecoveryTimeout);
      layer.videoStallRecoveryTimeout = null;
    }

    if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      attemptResume();
    }

    layer.videoStallRecoveryTimeout = window.setTimeout(() => {
      layer.videoStallRecoveryTimeout = null;
      if (!layer.activeVideoId || !layer.videoReady) {
        return;
      }
      if (layer.videoPlaybackRaf !== null) {
        return;
      }
      if (layer.videoSettings.reverse || layer.videoSettings.loopMode === 'pingpong') {
        return;
      }
      if (video.ended) {
        return;
      }

      if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA && !video.seeking) {
        try {
          if (typeof (video as any).fastSeek === 'function') {
            (video as HTMLVideoElement & { fastSeek?: (time: number) => void }).fastSeek?.(video.currentTime);
          } else {
            const duration = video.duration || 0;
            const clamped = Math.min(Math.max(video.currentTime, 0), duration > 0 ? duration - 0.001 : 0);
            video.currentTime = clamped;
          }
        } catch {
          /* ignore seek errors */
        }
      }

      attemptResume();
    }, 200);
  }

  private waitForVideoReady(
    layer: LayerState,
    video: HTMLVideoElement,
    loadToken: number
  ): Promise<void> {
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        video.removeEventListener('canplaythrough', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('error', onError);
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      };

      const onReady = () => {
        if (settled || layer.videoLoadToken !== loadToken) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      };

      const onError = () => {
        if (settled || layer.videoLoadToken !== loadToken) {
          return;
        }
        settled = true;
        cleanup();
        const mediaError = video.error;
        reject(mediaError || new Error('Video playback error'));
      };

      video.addEventListener('canplaythrough', onReady);
      video.addEventListener('canplay', onReady);
      video.addEventListener('loadeddata', onReady);
      video.addEventListener('error', onError);

      timeoutId = setTimeout(() => {
        if (settled || layer.videoLoadToken !== loadToken) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      }, 4000);
    });
  }

  private startCustomVideoPlayback(layer: LayerState): void {
    const settings = layer.videoSettings;
    const video = layer.videoElement;
    if (!settings.reverse && settings.loopMode !== 'pingpong') {
      return;
    }

    if (!layer.videoReady) {
      return;
    }

    this.stopCustomVideoPlayback(layer);

    const step = (time: number, lastTime: number, direction: 1 | -1) => {
      if (!layer.activeVideoId) {
        return;
      }
      const delta = (time - lastTime) / 1000;
      if (video.readyState < 1) {
        layer.videoPlaybackRaf = requestAnimationFrame(next =>
          step(next, time, direction)
        );
        return;
      }

      let current = video.currentTime + delta * settings.speed * direction;
      const duration = video.duration || 0;
      if (duration <= 0) {
        layer.videoPlaybackRaf = requestAnimationFrame(next =>
          step(next, time, direction)
        );
        return;
      }

      let nextDirection: 1 | -1 = direction;
      if (current <= 0) {
        if (!settings.loop) {
          video.currentTime = 0;
          return;
        }
        if (settings.loopMode === 'pingpong') {
          current = Math.max(0, -current);
          nextDirection = 1;
        } else {
          current = duration;
        }
      } else if (current >= duration) {
        if (!settings.loop) {
          video.currentTime = duration;
          return;
        }
        if (settings.loopMode === 'pingpong') {
          current = Math.max(0, duration - (current - duration));
          nextDirection = -1;
        } else {
          current = 0;
        }
      }

      video.currentTime = current;
      layer.videoPlaybackDirection = nextDirection;
      layer.videoPlaybackRaf = requestAnimationFrame(next =>
        step(next, time, nextDirection)
      );
    };

    video.pause();
    const initialDirection: 1 | -1 = settings.reverse ? -1 : 1;
    layer.videoPlaybackDirection = initialDirection;
    const start = performance.now();
    layer.videoPlaybackRaf = requestAnimationFrame(next =>
      step(next, start, initialDirection)
    );
  }

  private applyVideoSettings(layer: LayerState): void {
    const video = layer.videoElement;
    const settings = layer.videoSettings;

    if (!layer.activeVideoId) {
      this.stopCustomVideoPlayback(layer);
      this.clearVideoRecovery(layer);
      video.style.opacity = '0';
      return;
    }

    video.loop = settings.loop && !settings.reverse && settings.loopMode === 'restart';
    video.playbackRate = Math.abs(settings.speed);

    if (settings.blackAlpha > 0) {
      video.style.mixBlendMode = 'screen';
      const brightness = 1 + settings.blackAlpha * 0.4;
      const contrast = 1 + settings.blackAlpha * 0.6;
      video.style.filter = `brightness(${brightness}) contrast(${contrast})`;
    } else {
      video.style.mixBlendMode = 'normal';
      video.style.filter = 'none';
    }

    video.style.opacity = layer.opacity.toString();

    this.stopCustomVideoPlayback(layer);
    if (!layer.videoReady) {
      return;
    }

    if (settings.reverse || settings.loopMode === 'pingpong') {
      this.startCustomVideoPlayback(layer);
    } else {
      this.startNativeVideoPlayback(layer);
    }
  }

  private async activateVideoPreset(layerId: string, presetId: string): Promise<boolean> {
    const layer = this.layers.get(layerId);
    if (!layer) {
      console.error(`Layer ${layerId} no encontrado`);
      return false;
    }

    const videoId = presetId.replace(/^video:/, '');
    const videoResource = this.videoRegistry.get(videoId);
    if (!videoResource) {
      console.error(`Video ${videoId} no encontrado en registry`);
      return false;
    }

    if (layer.preset) {
      this.presetLoader.deactivatePreset(`${layerId}-${layer.preset.id}`);
      layer.scene.clear();
      layer.preset = null;
    }

    if (layer.activeVideoId) {
      this.stopVideoPlayback(layer);
    }

    let sourceUrl: string = videoResource.previewUrl;
    try {
      const cachedUrl = await getCachedVideoUrl(videoResource);
      sourceUrl = cachedUrl;
      if (cachedUrl.startsWith('blob:')) {
        layer.videoObjectUrl = cachedUrl;
      }
    } catch (error) {
      console.warn(`Falling back to remote URL for video ${videoId}`, error);
    }

    const videoEl = layer.videoElement;
    const loadToken = ++layer.videoLoadToken;
    layer.videoReady = false;
    videoEl.src = sourceUrl;
    videoEl.muted = true;
    videoEl.currentTime = 0;
    videoEl.preload = 'auto';
    videoEl.load();
    videoEl.style.opacity = layer.opacity.toString();
    videoEl.style.visibility = 'visible';

    layer.activeVideoId = videoResource.id;
    layer.isActive = true;
    layer.renderer.domElement.style.opacity = '0';

    try {
      await this.waitForVideoReady(layer, videoEl, loadToken);
    } catch (error) {
      console.warn(`Video ${videoId} did not reach ready state`, error);
    }

    if (layer.videoLoadToken !== loadToken) {
      return true;
    }

    layer.videoReady = videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    this.applyVideoSettings(layer);

    return true;
  }

  public renderLayers(): void {
    this.layers.forEach(layer => {
      layer.renderer.setClearColor(0x000000, 0);
      layer.renderer.clear(true, true, true);
      if (layer.isActive && layer.preset) {
        layer.renderer.render(layer.scene, layer.camera);
      }
    });

    this.presetLoader.updateActivePresets();
  }

  public updateSize(width: number, height: number, pixelRatio: number): void {
    this.layers.forEach(layer => {
      layer.renderer.setSize(width, height, false);
      layer.renderer.setPixelRatio(pixelRatio);
      layer.camera.aspect = width / height;
      layer.camera.updateProjectionMatrix();
    });
  }

  public async activateLayerPreset(layerId: string, presetId: string): Promise<boolean> {
    if (presetId.startsWith('video:')) {
      return this.activateVideoPreset(layerId, presetId);
    }

    const layer = this.layers.get(layerId);
    if (!layer) {
      console.error(`Layer ${layerId} no encontrado`);
      return false;
    }

    try {
      if (layer.activeVideoId) {
        this.stopVideoPlayback(layer);
      }
      if (layer.preset) {
        this.presetLoader.deactivatePreset(`${layerId}-${layer.preset.id}`);
        layer.scene.clear();
      }

      const canvas = layer.renderer.domElement;
      Array.from(canvas.classList).forEach(cls => {
        if (cls.startsWith('vfx-') || cls.startsWith('effect-')) {
          canvas.classList.remove(cls);
        }
      });

      const loadedPreset = this.presetLoader.getLoadedPresets().find(p => p.id === presetId);
      if (!loadedPreset) {
        console.error(`Loaded preset ${presetId} no encontrado`);
        return false;
      }

        const savedConfig = await this.loadLayerPresetConfig(presetId, layerId);
        const loadedPresetConfig = JSON.parse(JSON.stringify(loadedPreset.config));
        loadedPresetConfig.defaultConfig = deepMerge(
          loadedPresetConfig.defaultConfig,
          savedConfig
        );

      const presetInstance = this.presetLoader.activatePreset(
        presetId,
        layer.scene,
        `${layerId}-${presetId}`,
        loadedPresetConfig,
        layer.camera,
        layer.renderer
      );
      if (!presetInstance) {
        console.error(`No se pudo activar preset ${presetId}`);
        return false;
      }

      layer.preset = { ...loadedPreset, config: loadedPresetConfig };
      layer.isActive = true;
      layer.renderer.domElement.style.opacity = layer.opacity.toString();
      layer.videoElement.style.opacity = '0';
      console.log(`✅ Layer ${layerId} activado con preset ${presetId}`);
      return true;
    } catch (error) {
      console.error(`Error activando preset ${presetId} en layer ${layerId}:`, error);
      return false;
    }
  }

  public deactivateLayerPreset(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    if (layer.preset) {
      this.presetLoader.deactivatePreset(`${layerId}-${layer.preset.id}`);
      layer.scene.clear();
      layer.preset = null;
    }

    if (layer.activeVideoId) {
      this.stopVideoPlayback(layer);
    }

    layer.isActive = false;
    layer.renderer.clear();
    layer.renderer.domElement.style.opacity = '0';
    layer.videoElement.style.opacity = '0';
    console.log(`🗑️ Layer ${layerId} desactivado`);
  }

  public updateLayerConfig(layerId: string, config: any): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    if (config.opacity !== undefined) {
      layer.opacity = config.opacity / 100;
      layer.renderer.domElement.style.opacity = layer.isActive
        ? layer.opacity.toString()
        : '0';
      if (layer.activeVideoId) {
        layer.videoElement.style.opacity = layer.opacity.toString();
      }
    }

    if (config.fadeTime !== undefined) {
      layer.fadeTime = config.fadeTime;
    }
  }

  public triggerVFX(layerId: string, effect: string): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    const target = layer.activeVideoId ? layer.videoElement : layer.renderer.domElement;
    target.classList.add(`effect-${effect}`);
    setTimeout(() => target.classList.remove(`effect-${effect}`), 300);
  }

  public setVFX(layerId: string, effect: string, enabled: boolean): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    const target = layer.activeVideoId ? layer.videoElement : layer.renderer.domElement;
    target.classList.toggle(`vfx-${effect}`, enabled);
    const staticEffects = ['blur', 'distortion', 'pixelate', 'invert', 'sepia', 'noise', 'scanlines'];
    if (staticEffects.includes(effect)) {
      target.classList.toggle(`effect-${effect}`, enabled);
    }
  }

  private getLayerConfigPath(presetId: string, layerId: string): string {
    const loaded = this.presetLoader.getLoadedPresets().find(p => p.id === presetId);
    const folder = loaded?.folderPath ?? `${this.presetLoader.getBasePath()}/${presetId}`;
    const variantMatch = presetId.match(/-(\d+)$/);
    const variantSuffix = variantMatch ? `-${variantMatch[1]}` : '';
    return `${folder}/layers/${layerId}${variantSuffix}.json`;
  }

  private async loadLayerPresetConfig(presetId: string, layerId: string): Promise<any> {
    try {
      const cfgPath = this.getLayerConfigPath(presetId, layerId);
      if (typeof window !== 'undefined') {
        if ((window as any).__TAURI__) {
          const { exists, readTextFile } = await import(
            /* @vite-ignore */ '@tauri-apps/api/fs'
          );
          if (await exists(cfgPath)) {
            return JSON.parse(await readTextFile(cfgPath));
          }
        } else if ((window as any).electronAPI) {
          const api = (window as any).electronAPI;
          if (typeof api.exists === 'function' && (await api.exists(cfgPath))) {
            const reader = api.readTextFile;
            if (typeof reader === 'function') {
              const content = await reader(cfgPath);
              return JSON.parse(content);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Could not load config for ${presetId} layer ${layerId}:`, err);
    }
    return {};
  }

  private async saveLayerPresetConfig(
    presetId: string,
    layerId: string,
    cfg: any
  ): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        const cfgPath = this.getLayerConfigPath(presetId, layerId);
        const dir = cfgPath.substring(0, cfgPath.lastIndexOf('/'));
        if ((window as any).__TAURI__) {
          const { createDir, writeFile } = await import(
            /* @vite-ignore */ '@tauri-apps/api/fs'
          );
          await createDir(dir, { recursive: true });
          await writeFile({ path: cfgPath, contents: JSON.stringify(cfg, null, 2) });
        } else if ((window as any).electronAPI) {
          const api = (window as any).electronAPI;
          if (typeof api.createDir === 'function') {
            await api.createDir(dir);
          }
          if (typeof api.writeTextFile === 'function') {
            await api.writeTextFile(cfgPath, JSON.stringify(cfg, null, 2));
          }
        }
      }
    } catch (err) {
      console.warn(`Could not save config for ${presetId} layer ${layerId}:`, err);
    }
  }

  public async getLayerPresetConfig(layerId: string, presetId: string): Promise<any> {
    const saved = await this.loadLayerPresetConfig(presetId, layerId);
    if (Object.keys(saved).length > 0) return saved;
    const loaded = this.presetLoader.getLoadedPresets().find(p => p.id === presetId);
    return loaded ? JSON.parse(JSON.stringify(loaded.config.defaultConfig)) : {};
  }

  public updateLayerPresetConfig(layerId: string, pathKey: string, value: any): void {
    const layer = this.layers.get(layerId);
    if (!layer || !layer.preset) return;

    setNestedValue(layer.preset.config.defaultConfig, pathKey, value);

    const activePreset = this.presetLoader.getActivePreset(`${layerId}-${layer.preset.id}`);
    if (activePreset && activePreset.updateConfig) {
      activePreset.updateConfig(layer.preset.config.defaultConfig);
    }
    this.saveLayerPresetConfig(layer.preset.id, layerId, layer.preset.config.defaultConfig).catch(
      err =>
        console.warn(
          `Could not save config for ${layer.preset?.id} layer ${layerId}:`,
          err
        )
    );
  }

  public getLayerStatus(): Record<string, { active: boolean; preset: string | null }> {
    const status: Record<string, { active: boolean; preset: string | null }> = {};

    this.layers.forEach((layer, layerId) => {
      status[layerId] = {
        active: layer.isActive,
        preset: layer.preset?.id || null
      };
    });

    return status;
  }

  public getLayerCanvas(layerId: string): HTMLCanvasElement | undefined {
    return this.layers.get(layerId)?.renderer.domElement;
  }

  public clearAll(): void {
    this.layers.forEach(layer => {
      layer.renderer.setClearColor(0x000000, 0);
      layer.renderer.clear(true, true, true);
      if (layer.activeVideoId) {
        this.stopVideoPlayback(layer);
      }
    });
  }

  public updateBpm(bpm: number): void {
    this.layers.forEach((layer, layerId) => {
      if (!layer.preset) return;
      const active = this.presetLoader.getActivePreset(`${layerId}-${layer.preset.id}`);
      active?.setBpm(bpm);
    });
  }

  public triggerBeat(): void {
    this.layers.forEach((layer, layerId) => {
      if (!layer.preset) return;
      const active = this.presetLoader.getActivePreset(`${layerId}-${layer.preset.id}`);
      active?.onBeat();
    });
  }

  public dispose(): void {
    this.layers.forEach((layer, layerId) => {
      if (layer.preset) {
        this.presetLoader.deactivatePreset(`${layerId}-${layer.preset.id}`);
      }
      layer.scene.clear();
      layer.renderer.dispose();
      layer.renderer.domElement.remove();
      this.stopVideoPlayback(layer);
      layer.videoElement.remove();
    });
  }

  public updateLayerVideoSettings(layerId: string, settings: Partial<VideoPlaybackSettings>): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    layer.videoSettings = {
      ...layer.videoSettings,
      ...settings,
    };
    this.applyVideoSettings(layer);
  }
}

