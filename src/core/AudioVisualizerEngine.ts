import * as THREE from 'three';
import { PresetLoader, LoadedPreset, AudioData } from './PresetLoader';
import { LayerManager } from './LayerManager';
import { VideoResource, VideoPlaybackSettings } from '../types/video';


export class AudioVisualizerEngine {
  private camera: THREE.PerspectiveCamera;
  private presetLoader: PresetLoader;
  private layerManager: LayerManager;
  private animationId: number | null = null;
  private isRunning = false;
  private multiMonitorMode = false;
  private currentBpm: number = 120;
  private maxFps = 60;

    constructor(
      private container: HTMLElement,
      options: { glitchTextPads?: number; visualsPath?: string } = {}
    ) {
      this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

      this.presetLoader = new PresetLoader(
        this.camera,
        options.glitchTextPads ?? 1,
        options.visualsPath
      );
      this.layerManager = new LayerManager(this.container, this.camera, this.presetLoader);

      this.setupScene();
      this.setupEventListeners();
    }

  private setupScene(): void {
    this.camera.position.set(0, 0, 3);
    this.camera.lookAt(0, 0, 0);
    this.updateSize();
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', () => this.updateSize());
  }

  private updateSize(): void {
    const width = 1920;
    const height = 1080;
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    const visualScale = parseFloat(localStorage.getItem('visualScale') || '1');
    const scaledWidth = width * visualScale;
    const scaledHeight = height * visualScale;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.layerManager.updateSize(scaledWidth, scaledHeight, pixelRatio);
  }

  public async initialize(): Promise<void> {
    await this.presetLoader.loadAllPresets();
    this.startRenderLoop();
  }

  private startRenderLoop(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const frameInterval = 1000 / this.maxFps;
    let last = performance.now();

    const animate = (time: number) => {
      if (!this.isRunning) return;
      this.animationId = requestAnimationFrame(animate);
      if (time - last < frameInterval) return;
      last = time;

      this.layerManager.renderLayers();
    };

    this.animationId = requestAnimationFrame(animate);
    console.log('🔄 Render loop started con layers independientes');
  }

  public setMaxFps(fps: number): void {
    this.maxFps = fps;
  }

  public setMultiMonitorMode(active: boolean): void {
    this.multiMonitorMode = active;
  }

  public activateLayerPreset(layerId: string, presetId: string): Promise<boolean> {
    return this.layerManager.activateLayerPreset(layerId, presetId);
  }

  public deactivateLayerPreset(layerId: string): void {
    this.layerManager.deactivateLayerPreset(layerId);
  }

  public updateLayerConfig(layerId: string, config: any): void {
    this.layerManager.updateLayerConfig(layerId, config);
  }

  public updateLayerVideoSettings(layerId: string, settings: Partial<VideoPlaybackSettings>): void {
    this.layerManager.updateLayerVideoSettings(layerId, settings);
  }

  public getLayerPresetConfig(layerId: string, presetId: string): Promise<any> {
    return this.layerManager.getLayerPresetConfig(layerId, presetId);
  }

  public updateLayerPresetConfig(layerId: string, pathKey: string, value: any): void {
    this.layerManager.updateLayerPresetConfig(layerId, pathKey, value);
  }

  public getAvailablePresets(): LoadedPreset[] {
    return this.presetLoader.getLoadedPresets();
  }

  public async updateGlitchPadCount(count: number): Promise<LoadedPreset[]> {
    this.presetLoader.setGlitchTextPads(count);
    await this.presetLoader.loadAllPresets();
    return this.presetLoader.getLoadedPresets();
  }

  public async updateCustomTextTemplates(count: number, texts: string[]): Promise<LoadedPreset[]> {
    this.presetLoader.setCustomTextInstances(count, texts);
    await this.presetLoader.loadAllPresets();
    return this.presetLoader.getLoadedPresets();
  }

  public async updateEmptyTemplates(count: number): Promise<LoadedPreset[]> {
    this.presetLoader.setEmptyPresetCount(count);
    await this.presetLoader.loadAllPresets();
    return this.presetLoader.getLoadedPresets();
  }

  public async updateGenLabPresets(presets: { name: string; config: any }[]): Promise<LoadedPreset[]> {
    this.presetLoader.setGenLabPresets(presets);
    await this.presetLoader.loadAllPresets();
    return this.presetLoader.getLoadedPresets();
  }

  public getGenLabBasePreset(): LoadedPreset | null {
    return this.presetLoader.getGenLabBasePreset();
  }

  public async updateFractalLabPresets(presets: { name: string; config: any }[]): Promise<LoadedPreset[]> {
    this.presetLoader.setFractalLabPresets(presets);
    await this.presetLoader.loadAllPresets();
    return this.presetLoader.getLoadedPresets();
  }

  public getFractalLabBasePreset(): LoadedPreset | null {
    return this.presetLoader.getFractalLabBasePreset();
  }

  public updateAudioData(audioData: AudioData): void {
    this.presetLoader.updateAudioData(audioData);
  }

  public getLayerStatus(): Record<string, { active: boolean; preset: string | null }> {
    return this.layerManager.getLayerStatus();
  }

  public getLayerCanvas(layerId: string): HTMLCanvasElement | undefined {
    return this.layerManager.getLayerCanvas(layerId);
  }

  public setVideoRegistry(videos: VideoResource[]): void {
    this.layerManager.setVideoRegistry(videos);
  }

  public clearRenderer(): void {
    this.layerManager.clearAll();
  }

  public triggerLayerVFX(layerId: string, effect: string): void {
    this.layerManager.triggerVFX(layerId, effect);
  }

  public setLayerVFX(layerId: string, effect: string, enabled: boolean): void {
    this.layerManager.setVFX(layerId, effect, enabled);
  }

  public updateBpm(bpm: number): void {
    this.currentBpm = bpm;
    this.layerManager.updateBpm(bpm);
  }

  public triggerBeat(): void {
    this.layerManager.triggerBeat();
  }

  public dispose(): void {
    this.isRunning = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    this.layerManager.dispose();
    this.presetLoader.dispose();

    console.log('🧹 Engine disposed');
  }
}

