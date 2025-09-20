import * as THREE from 'three';
import { PresetLoader, LoadedPreset, AudioData } from './src/core/PresetLoader';

export class AudioVisualizerApp {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private presetLoader: PresetLoader;
  private loadedPresets: LoadedPreset[] = [];
  private currentPresetId: string | null = null;

  constructor(container: HTMLElement) {
    this.initThreeJS(container);
    this.presetLoader = new PresetLoader(this.camera, this.renderer);
    this.init();
  }

  private initThreeJS(container: HTMLElement): void {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 3);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Resize handler
    window.addEventListener('resize', () => this.onWindowResize());
  }

  private async init(): Promise<void> {
    try {
      console.log('🔍 Scanning for presets...');
      
      // Automatically load all presets
      this.loadedPresets = await this.presetLoader.loadAllPresets();
      
      console.log(`✅ Found ${this.loadedPresets.length} presets:`);
      this.loadedPresets.forEach(preset => {
        console.log(`  - ${preset.config.name} (${preset.id})`);
      });

      // Activate the first preset by default
      if (this.loadedPresets.length > 0) {
        this.activatePreset(this.loadedPresets[0].id);
      }

      // Setup audio listener
      await this.setupAudioListener();

      // Start render loop
      this.startRenderLoop();

      console.log('🎨 AudioVisualizer initialized successfully!');
      
    } catch (error) {
      console.error('❌ Failed to initialize AudioVisualizer:', error);
    }
  }

  private async setupAudioListener(): Promise<void> {
    try {
      // Detect if running in a Tauri environment
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        console.log('🎵 Tauri environment detected, setting up audio listener...');

        // Dynamic import only if Tauri is available
        const tauriEvent = await import('@tauri-apps/api/event').catch(err => {
          console.warn('Tauri event API not available:', err);
          return null;
        });

        if (tauriEvent) {
          await tauriEvent.listen('audio_data', (event) => {
            const audioData = event.payload as AudioData;
            this.presetLoader.updateAudioData(audioData);
          });
          console.log('🎵 Audio listener setup complete');
        } else {
          console.warn('Tauri event API not available, using fallback');
          this.setupFallbackAudio();
        }
      } else {
        console.log('🎙️ Non-Tauri environment detected, using fallback audio');
        this.setupFallbackAudio();
      }
    } catch (error) {
      console.warn('Failed to setup audio listener:', error);
      this.setupFallbackAudio();
    }
  }

  private setupFallbackAudio(): void {
    // Test audio for environments without Tauri
    const generateTestAudio = () => {
      const time = Date.now() * 0.001;
      const audioData: AudioData = {
        low: 0.3 + 0.2 * Math.sin(time * 2),
        mid: 0.5 + 0.3 * Math.sin(time * 3),
        high: 0.2 + 0.2 * Math.sin(time * 5),
        fft: Array.from({ length: 256 }, (_, i) => 
          0.1 + 0.3 * Math.sin(time + i * 0.1)
        )
      };
      this.presetLoader.updateAudioData(audioData);
    };
    
    // Update test audio every 16ms (~60fps)
    setInterval(generateTestAudio, 16);
    console.log('🎭 Fallback audio data generator started');
  }

  private startRenderLoop(): void {
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Update active presets
      this.presetLoader.updateActivePresets();
      
      // Render scene
      this.renderer.render(this.scene, this.camera);
    };

    animate();
    console.log('🔄 Render loop started');
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Public API methods
  
  /**
   * Get the list of loaded presets
   */
  public getAvailablePresets(): LoadedPreset[] {
    return this.loadedPresets;
  }

  /**
   * Activate a specific preset
   */
  public activatePreset(presetId: string): boolean {
    try {
      // Deactivate current preset
      if (this.currentPresetId) {
        this.presetLoader.deactivatePreset(this.currentPresetId);
      }

      // Activate new preset
      const preset = this.presetLoader.activatePreset(presetId);
      if (preset) {
        this.currentPresetId = presetId;
        console.log(`🎨 Activated preset: ${presetId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`Failed to activate preset ${presetId}:`, error);
      return false;
    }
  }

  /**
   * Deactivate the current preset
   */
  public deactivateCurrentPreset(): void {
    if (this.currentPresetId) {
      this.presetLoader.deactivatePreset(this.currentPresetId);
      this.currentPresetId = null;
      console.log('🗑️ Deactivated current preset');
    }
  }

  /**
   * Get information about the active preset
   */
  public getCurrentPreset(): LoadedPreset | null {
    if (!this.currentPresetId) return null;
    return this.loadedPresets.find(p => p.id === this.currentPresetId) || null;
  }

  /**
   * Change the opacity of the active preset
   */
  public setOpacity(opacity: number): void {
    if (this.currentPresetId) {
      const activePreset = this.presetLoader.getActivePreset(this.currentPresetId);
      if (activePreset) {
        activePreset.setOpacity(opacity);
      }
    }
  }

  /**
   * Update the configuration of the active preset
   */
  public updatePresetConfig(config: any): void {
    if (this.currentPresetId) {
      const activePreset = this.presetLoader.getActivePreset(this.currentPresetId);
      if (activePreset) {
        activePreset.updateConfig(config);
      }
    }
  }

  /**
   * Reload all presets (useful for development)
   */
  public async reloadPresets(): Promise<void> {
    console.log('🔄 Reloading presets...');

    // Clear current presets
    this.presetLoader.dispose();
    this.currentPresetId = null;

    // Reload
    this.loadedPresets = await this.presetLoader.loadAllPresets();

    console.log(`✅ Reloaded ${this.loadedPresets.length} presets`);
  }

  /**
   * Clean up resources when closing the application
   */
  public dispose(): void {
    this.presetLoader.dispose();
    this.renderer.dispose();
    console.log('🧹 App disposed');
  }
}

// Factory function to initialize the app
export async function createAudioVisualizerApp(container: HTMLElement): Promise<AudioVisualizerApp> {
  const app = new AudioVisualizerApp(container);
  return app;
}

// UI Helper to create preset controls
export class PresetUI {
  private app: AudioVisualizerApp;
  private container: HTMLElement;

  constructor(app: AudioVisualizerApp, container: HTMLElement) {
    this.app = app;
    this.container = container;
    this.createUI();
  }

  private createUI(): void {
    const presets = this.app.getAvailablePresets();
    
    // Create preset selector
    const presetSelector = document.createElement('select');
    presetSelector.className = 'preset-selector';
    presetSelector.innerHTML = '<option value="">Select preset...</option>';
    
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = `${preset.config.name} - ${preset.config.description}`;
      presetSelector.appendChild(option);
    });

    presetSelector.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      if (target.value) {
        this.app.activatePreset(target.value);
        this.updateControlsForPreset(target.value);
      } else {
        this.app.deactivateCurrentPreset();
        this.clearControls();
      }
    });

    // Create container for dynamic controls
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'preset-controls';

    // Create global opacity control
    const opacityContainer = document.createElement('div');
    opacityContainer.className = 'control-group';

    const opacityLabel = document.createElement('label');
    opacityLabel.textContent = 'Global Opacity: ';
    
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0';
    opacitySlider.max = '1';
    opacitySlider.step = '0.01';
    opacitySlider.value = '1';
    
    opacitySlider.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.app.setOpacity(parseFloat(target.value));
    });

    opacityContainer.appendChild(opacityLabel);
    opacityContainer.appendChild(opacitySlider);

    // Reload button (useful for development)
    const reloadButton = document.createElement('button');
    reloadButton.textContent = '🔄 Reload Presets';
    reloadButton.addEventListener('click', () => this.app.reloadPresets());

    // Ensamblar UI
    this.container.appendChild(presetSelector);
    this.container.appendChild(opacityContainer);
    this.container.appendChild(controlsContainer);
    this.container.appendChild(reloadButton);
  }

  private updateControlsForPreset(presetId: string): void {
    const presets = this.app.getAvailablePresets();
    const preset = presets.find(p => p.id === presetId);
    
    if (!preset) return;

    const controlsContainer = this.container.querySelector('.preset-controls') as HTMLElement;
    controlsContainer.innerHTML = '';

    // Create controls based on preset configuration
    if (preset.config.controls) {
      preset.config.controls.forEach((control: any) => {
        const controlElement = this.createControl(control);
        controlsContainer.appendChild(controlElement);
      });
    }

    // Show preset information
    const infoElement = document.createElement('div');
    infoElement.className = 'preset-info';
    infoElement.innerHTML = `
      <h3>${preset.config.name}</h3>
      <p>${preset.config.description}</p>
      <small>Author: ${preset.config.author} | Version: ${preset.config.version}</small>
    `;
    controlsContainer.insertBefore(infoElement, controlsContainer.firstChild);
  }

  private createControl(control: any): HTMLElement {
    const container = document.createElement('div');
    container.className = 'control-group';

    const label = document.createElement('label');
    label.textContent = control.label + ': ';

    let input: HTMLInputElement;

    switch (control.type) {
      case 'slider':
        input = document.createElement('input');
        input.type = 'range';
        input.min = control.min?.toString() || '0';
        input.max = control.max?.toString() || '1';
        input.step = control.step?.toString() || '0.01';
        input.value = control.default?.toString() || '0';
        break;

      case 'color':
        input = document.createElement('input');
        input.type = 'color';
        input.value = control.default || '#ffffff';
        break;

      case 'checkbox':
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = control.default || false;
        break;

      default:
        input = document.createElement('input');
        input.type = 'text';
        input.value = control.default?.toString() || '';
    }

    // Add event listener to update configuration
    input.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      let value: any = target.value;
      
      if (control.type === 'slider') {
        value = parseFloat(value);
      } else if (control.type === 'checkbox') {
        value = target.checked;
      }

      // Update configuration using the control path
      const config = this.getNestedConfig(control.name, value);
      this.app.updatePresetConfig(config);
    });

    container.appendChild(label);
    container.appendChild(input);

    return container;
  }

  private getNestedConfig(path: string, value: any): any {
    const keys = path.split('.');
    const config: any = {};
    
    let current = config;
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    
    return config;
  }

  private clearControls(): void {
    const controlsContainer = this.container.querySelector('.preset-controls') as HTMLElement;
    controlsContainer.innerHTML = '';
  }
}