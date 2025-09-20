import React, { useState, useEffect } from 'react';
import { LoadedPreset } from '../core/PresetLoader';
import { AVAILABLE_EFFECTS } from '../utils/effects';
import { usePresetGrid } from '../hooks/usePresetGrid';
import { getPresetThumbnail } from '../utils/presetThumbnails';
import './LayerGrid.css';
import { VideoResource } from '../types/video';


interface LayerConfig {
  id: string;
  name: string;
  color: string;
  midiChannel: number;
  fadeTime: number;
  opacity: number;
  activePreset: string | null;
  autoJump: boolean;
  jumpDirection: 'right' | 'left' | 'random';
  jumpSync: 'time' | 'beats';
  /**
   * Jump interval in seconds when `jumpSync` is `time` or as a beat
   * fraction (e.g. "2/4") when `jumpSync` is `beats`.
   */
  jumpInterval: number | string;
}

interface LayerGridProps {
  presets: LoadedPreset[];
  videos: VideoResource[];
  onPresetActivate: (layerId: string, presetId: string, velocity?: number) => void;
  onLayerClear: (layerId: string) => void;
  onLayerConfigChange: (layerId: string, config: Partial<LayerConfig>) => void;
  onPresetSelect: (layerId: string, presetId: string) => void;
  clearAllSignal: number;
  externalTrigger?: { layerId: string; presetId: string; velocity: number } | null;
  layerChannels: Record<string, number>;
  onOpenResources: () => void;
  layerEffects: Record<string, { effect: string; alwaysOn: boolean; active: boolean }>;
  onLayerEffectChange: (layerId: string, effect: string) => void;
  onLayerEffectToggle: (layerId: string, alwaysOn: boolean) => void;
  bpm: number | null;
}

const LayerGrid: React.FC<LayerGridProps> = ({
  presets,
  videos,
  onPresetActivate,
  onLayerClear,
  onLayerConfigChange,
  onPresetSelect,
  clearAllSignal,
  externalTrigger,
  layerChannels,
  onOpenResources,
  layerEffects,
  onLayerEffectChange,
  onLayerEffectToggle,
  bpm
}) => {
  const [layers, setLayers] = useState<LayerConfig[]>([
    { id: 'A', name: 'Layer A', color: '#FF6B6B', midiChannel: layerChannels.A || 14, fadeTime: 200, opacity: 100, activePreset: null, autoJump: false, jumpDirection: 'right', jumpSync: 'time', jumpInterval: 1 },
    { id: 'B', name: 'Layer B', color: '#4ECDC4', midiChannel: layerChannels.B || 15, fadeTime: 200, opacity: 100, activePreset: null, autoJump: false, jumpDirection: 'right', jumpSync: 'time', jumpInterval: 1 },
    { id: 'C', name: 'Layer C', color: '#45B7D1', midiChannel: layerChannels.C || 16, fadeTime: 200, opacity: 100, activePreset: null, autoJump: false, jumpDirection: 'right', jumpSync: 'time', jumpInterval: 1 },
  ]);

  useEffect(() => {
    setLayers(prev => prev.map(layer => ({ ...layer, activePreset: null })));
    setClickedCell(null);
  }, [clearAllSignal]);

  const [clickedCell, setClickedCell] = useState<string | null>(null);
  const {
    layerPresets,
    dragTarget,
    handleDragStart,
    handleDragEnd,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop
  } = usePresetGrid();
  const jumpPositions = React.useRef<Record<string, number>>({});

  const handlePresetClick = (
    layerId: string,
    presetId: string,
    index?: number,
    velocity?: number
  ) => {
    if (!presetId) return; // No hacer nada si es un slot vacio

    if (index === undefined) {
      const list = layerPresets[layerId];
      index = list.findIndex(id => id === presetId);
    }

    const cellKey = `${layerId}-${presetId}-${index}`;
    const layer = layers.find(l => l.id === layerId);
    const wasActive = layer?.activePreset === presetId;
    const isVideo = presetId.startsWith('video:');
    const preset = isVideo ? undefined : presets.find(p => p.id === presetId);
    const video = isVideo ? videos.find(v => `video:${v.id}` === presetId) : undefined;
    const isOneShot = preset?.config.category === 'one-shot';
    const opacityFromVelocity = velocity !== undefined
      ? Math.max(1, Math.round((velocity / 127) * 100))
      : undefined;

    setClickedCell(cellKey);
    setTimeout(() => setClickedCell(null), 150);

    setLayers(prev => prev.map(l =>
      l.id === layerId
        ? { ...l, activePreset: presetId, ...(opacityFromVelocity !== undefined ? { opacity: opacityFromVelocity } : {}) }
        : l
    ));

    if (opacityFromVelocity !== undefined) {
      onLayerConfigChange(layerId, { opacity: opacityFromVelocity });
    }

    if (!wasActive || isOneShot) {
      onPresetActivate(layerId, presetId, velocity);
    }
    if (isVideo && !video) {
      return;
    }

    onPresetSelect(layerId, presetId);
  };

  const handleLayerClear = (layerId: string) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId 
        ? { ...layer, activePreset: null }
        : layer
    ));
    onLayerClear(layerId);
    onPresetSelect(layerId, '');
  };

  const handleLayerConfigChange = (layerId: string, field: keyof LayerConfig, value: any) => {
    setLayers(prev => prev.map(layer =>
      layer.id === layerId
        ? { ...layer, [field]: value }
        : layer
    ));

    if (['midiChannel', 'fadeTime', 'opacity'].includes(field)) {
      onLayerConfigChange(layerId, { [field]: value });
    }
  };

  useEffect(() => {
    if (externalTrigger) {
      handlePresetClick(
        externalTrigger.layerId,
        externalTrigger.presetId,
        undefined,
        externalTrigger.velocity
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTrigger]);

  useEffect(() => {
    setLayers(prev => prev.map(layer => ({
      ...layer,
      midiChannel: layerChannels[layer.id] || layer.midiChannel
    })));
  }, [layerChannels]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    layers.forEach(layer => {
      if (!layer.autoJump) return;
      const list = layerPresets[layer.id];
      if (!list.some(p => p)) return;

      let intervalMs: number | null = null;
      if (layer.jumpSync === 'time') {
        const val = typeof layer.jumpInterval === 'number'
          ? layer.jumpInterval
          : parseFloat(layer.jumpInterval as string) || 0;
        intervalMs = val * 1000;
      } else if (layer.jumpSync === 'beats' && bpm) {
        let ratio = 1;
        if (typeof layer.jumpInterval === 'string') {
          const parts = layer.jumpInterval.split('/').map(n => parseFloat(n));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] !== 0) {
            ratio = parts[0] / parts[1];
          }
        } else if (typeof layer.jumpInterval === 'number') {
          ratio = layer.jumpInterval;
        }
        intervalMs = (60 / bpm) * ratio * 1000;
      }

      if (!intervalMs) return;

      const timer = setInterval(() => {
        const currentList = layerPresets[layer.id];
        const valid = currentList.map((p, idx) => ({ p, idx })).filter(v => v.p);
        if (valid.length === 0) return;
        let idx: number;
        if (layer.jumpDirection === 'random') {
          idx = valid[Math.floor(Math.random() * valid.length)].idx;
        } else {
          let cur = jumpPositions.current[layer.id] ?? (layer.jumpDirection === 'right' ? -1 : valid.length);
          const step = layer.jumpDirection === 'right' ? 1 : -1;
          do {
            cur = (cur + step + currentList.length) % currentList.length;
          } while (!currentList[cur]);
          jumpPositions.current[layer.id] = cur;
          idx = cur;
        }
        const presetId = currentList[idx];
        if (presetId) {
          handlePresetClick(layer.id, presetId, idx);
        }
      }, intervalMs);

      timers.push(timer);
    });

    return () => {
      timers.forEach(clearInterval);
    };
  }, [layers, layerPresets, bpm]);

  return (
    <div className="layer-grid">
      {layers.map((layer) => {
        return (
        <div key={layer.id} className="layer-section">
          <div className={`layer-header ${layerEffects[layer.id]?.active ? 'effect-active' : ''}`}>
            <div className="midi-channel-edit">
              <label>MIDI</label>
              <input
                type="number"
                min={1}
                max={16}
                value={layer.midiChannel}
                onChange={(e) =>
                  handleLayerConfigChange(layer.id, 'midiChannel', parseInt(e.target.value))
                }
                className="midi-channel-input"
              />
            </div>
            <span className="control-separator">|</span>
            <select
              value={layerEffects[layer.id]?.effect}
              onChange={(e) => onLayerEffectChange(layer.id, e.target.value)}
            >
              {AVAILABLE_EFFECTS.map((eff) => (
                <option key={eff} value={eff}>
                  {eff}
                </option>
              ))}
            </select>
            <label
              className="effect-always"
              title="Effect always active"
            >
              <input
                type="checkbox"
                checked={layerEffects[layer.id]?.alwaysOn}
                onChange={(e) => onLayerEffectToggle(layer.id, e.target.checked)}
              />
              <span role="img" aria-label="always on">♾️</span>
            </label>
            <span className="control-separator">|</span>
            <div className="jump-controls">
              <label title="Auto jump between presets">
                <input
                  type="checkbox"
                  checked={layer.autoJump}
                  onChange={(e) => handleLayerConfigChange(layer.id, 'autoJump', e.target.checked)}
                />
                <span role="img" aria-label="auto jump">🔀</span>
              </label>
              <select
                value={layer.jumpDirection}
                onChange={(e) =>
                  handleLayerConfigChange(layer.id, 'jumpDirection', e.target.value as any)
                }
              >
                <option value="right">right</option>
                <option value="left">left</option>
                <option value="random">random</option>
              </select>
              <select
                value={layer.jumpSync}
                onChange={(e) => {
                  const val = e.target.value as any;
                  handleLayerConfigChange(layer.id, 'jumpSync', val);
                  if (val === 'time' && typeof layer.jumpInterval === 'string') {
                    const parts = layer.jumpInterval.split('/').map(n => parseFloat(n));
                    const num = parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] !== 0 ? parts[0] / parts[1] : 1;
                    handleLayerConfigChange(layer.id, 'jumpInterval', num);
                  }
                  if (val === 'beats' && typeof layer.jumpInterval === 'number') {
                    handleLayerConfigChange(layer.id, 'jumpInterval', '4/4');
                  }
                }}
              >
                <option value="time">time</option>
                <option value="beats">beats</option>
              </select>
              {layer.jumpSync === 'time' ? (
                <input
                  type="number"
                  min={1}
                  value={layer.jumpInterval as number}
                  onChange={(e) =>
                    handleLayerConfigChange(layer.id, 'jumpInterval', parseInt(e.target.value))
                  }
                  className="jump-interval-input"
                />
              ) : (
                <input
                  type="text"
                  value={layer.jumpInterval as string}
                  onChange={(e) =>
                    handleLayerConfigChange(layer.id, 'jumpInterval', e.target.value)
                  }
                  className="jump-interval-input"
                  placeholder="4/4"
                  pattern="\d+/\d+"
                />
              )}
            </div>
          </div>

          {/* Layer Controls - 100x100 square */}
          <div className="layer-content">
            <div
              className="layer-sidebar"
              style={{ borderLeftColor: layer.color }}
            >
              <div className="layer-letter" style={{ color: layer.color }}>
                {layer.id}
              </div>
              <div className="sidebar-controls">
                <input
                  type="range"
                  value={layer.opacity}
                  onChange={(e) =>
                    handleLayerConfigChange(layer.id, 'opacity', parseInt(e.target.value))
                  }
                  className="opacity-slider"
                  min="0"
                  max="100"
                />
                <div className="fade-control">
                  <input
                    type="number"
                    value={layer.fadeTime}
                    onChange={(e) =>
                      handleLayerConfigChange(
                        layer.id,
                        'fadeTime',
                        parseInt(e.target.value)
                      )
                    }
                    className="fade-input"
                    min="0"
                    max="5000"
                    step="50"
                  />
                  <span className="unit">ms</span>
                </div>
              </div>
            </div>

            {/* Preset Grid con slots fijos */}
            <div className="preset-grid">
              {layerPresets[layer.id].map((presetId, idx) => {
              // Slot vacio
              if (!presetId) {
                const isDragOver = dragTarget?.layerId === layer.id && dragTarget.index === idx;
                return (
                  <div
                    key={`${layer.id}-empty-${idx}`}
                    className={`preset-cell empty-slot ${isDragOver ? 'drag-over' : ''}`}
                    onClick={onOpenResources}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, layer.id, idx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, layer.id, idx)}
                    style={{
                      '--layer-color': layer.color,
                      '--layer-color-alpha': layer.color + '20'
                    } as React.CSSProperties}
                  >
                    <div className="empty-slot-indicator">
                      <div className="empty-slot-icon">+</div>
                    </div>
                  </div>
                );
              }

              // Slot con preset
              const isVideo = presetId.startsWith('video:');
              if (isVideo) {
                const video = videos.find(v => `video:${v.id}` === presetId);
                if (!video) return null;

                const cellKey = `${layer.id}-${presetId}-${idx}`;
                const isActive = layer.activePreset === presetId;
                const isClicked = clickedCell === cellKey;
                const isDragOver = dragTarget?.layerId === layer.id && dragTarget.index === idx;

                return (
                  <div
                    key={cellKey}
                    className={`preset-cell video-cell ${isActive ? 'active' : ''} ${isClicked ? 'clicked' : ''} ${isDragOver ? 'drag-over' : ''}`}
                    onClick={() => handlePresetClick(layer.id, presetId, idx)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, layer.id, idx)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, layer.id, idx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, layer.id, idx)}
                    style={{
                      '--layer-color': layer.color,
                      '--layer-color-alpha': layer.color + '20'
                    } as React.CSSProperties}
                  >
                    <div className="video-thumb-wrapper">
                      {video.width != null && video.height != null && (
                        <span className="video-resolution-badge">
                          {video.width}×{video.height}
                        </span>
                      )}
                      <div className="video-thumb" style={{ backgroundImage: `url(${video.thumbnail})` }} />
                    </div>
                    <div className="preset-info">
                      <div className="preset-name">{video.title}</div>
                      <div className="preset-details">
                        <span className="preset-category">Video · {video.provider}</span>
                      </div>
                    </div>
                    <div className="video-badge">🎬</div>
                    {isActive && (
                      <div
                        className="active-indicator"
                        style={{ backgroundColor: layer.color }}
                      />
                    )}
                  </div>
                );
              }

              const preset = presets.find(p => p.id === presetId);
              if (!preset) return null;

              const cellKey = `${layer.id}-${preset.id}-${idx}`;
              const isActive = layer.activePreset === presetId;
              const isClicked = clickedCell === cellKey;
              const isDragOver = dragTarget?.layerId === layer.id && dragTarget.index === idx;

              return (
                <div
                  key={cellKey}
                  className={`preset-cell ${isActive ? 'active' : ''} ${isClicked ? 'clicked' : ''} ${isDragOver ? 'drag-over' : ''}`}
                  onClick={() => handlePresetClick(layer.id, preset.id, idx)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, layer.id, idx)}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, layer.id, idx)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, layer.id, idx)}
                  style={{
                    '--layer-color': layer.color,
                    '--layer-color-alpha': layer.color + '20'
                  } as React.CSSProperties}
                >
                  {preset.config.note !== undefined && (
                    <div className="preset-note-badge">{preset.config.note}</div>
                  )}
                  <div className="preset-thumbnail">
                    {getPresetThumbnail(preset)}
                  </div>
                  <div className="preset-info">
                    <div className="preset-name">{preset.config.name}</div>
                    <div className="preset-details">
                      <span className="preset-category">{preset.config.category}</span>
                    </div>
                  </div>
                  
                  {isActive && (
                    <div 
                      className="active-indicator"
                      style={{ backgroundColor: layer.color }}
                    />
                  )}
                </div>
              );
            })}
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
};

export default LayerGrid;
