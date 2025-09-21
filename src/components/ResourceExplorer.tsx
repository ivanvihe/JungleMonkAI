import React, { useMemo, useState } from 'react';
import { LoadedPreset } from '../core/PresetLoader';
import { VideoResource } from '../types/video';
import { getPresetThumbnail } from '../utils/presetThumbnails';
import './ResourceExplorer.css';

interface ResourceExplorerProps {
  width: number;
  presets: LoadedPreset[];
  videos: VideoResource[];
  onOpenLibrary: () => void;
  onRefreshVideos?: () => void;
  isRefreshingVideos?: boolean;
}

type ResourceNodeKind = 'folder' | 'preset' | 'video';

interface ResourceNodeBase {
  id: string;
  label: string;
  kind: ResourceNodeKind;
}

interface ResourceFolderNode extends ResourceNodeBase {
  kind: 'folder';
  children: ResourceNode[];
}

interface ResourcePresetNode extends ResourceNodeBase {
  kind: 'preset';
  preset: LoadedPreset;
}

interface ResourceVideoNode extends ResourceNodeBase {
  kind: 'video';
  video: VideoResource;
}

type ResourceNode = ResourceFolderNode | ResourcePresetNode | ResourceVideoNode;

const PANEL_MIN_WIDTH = 240;

const ResourceExplorer: React.FC<ResourceExplorerProps> = ({
  width,
  presets,
  videos,
  onOpenLibrary,
  onRefreshVideos,
  isRefreshingVideos = false
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(['presets', 'main-presets', 'custom-presets', 'videos'])
  );
  const [searchTerm, setSearchTerm] = useState('');

  const { mainPresets, customPresets } = useMemo(() => {
    const main: LoadedPreset[] = [];
    const custom: LoadedPreset[] = [];
    presets.forEach(preset => {
      if (
        preset.id.startsWith('custom-glitch-text') ||
        preset.id.startsWith('gen-lab-') ||
        preset.id.startsWith('fractal-lab-')
      ) {
        custom.push(preset);
      } else {
        main.push(preset);
      }
    });
    return { mainPresets: main, customPresets: custom };
  }, [presets]);

  const tree = useMemo<ResourceNode[]>(() => {
    const nodes: ResourceNode[] = [
      {
        id: 'presets',
        label: 'Visual presets',
        kind: 'folder',
        children: [
          {
            id: 'main-presets',
            label: 'Main presets',
            kind: 'folder',
            children: mainPresets
              .sort((a, b) => a.config.name.localeCompare(b.config.name))
              .map<ResourceNode>(preset => ({
                id: preset.id,
                label: preset.config.name,
                kind: 'preset',
                preset
              }))
          },
          {
            id: 'custom-presets',
            label: 'Custom presets',
            kind: 'folder',
            children: customPresets
              .sort((a, b) => a.config.name.localeCompare(b.config.name))
              .map<ResourceNode>(preset => ({
                id: preset.id,
                label: preset.config.name,
                kind: 'preset',
                preset
              }))
          }
        ]
      }
    ];

    if (videos.length > 0) {
      nodes.push({
        id: 'videos',
        label: 'Video gallery',
        kind: 'folder',
        children: videos
          .slice()
          .sort((a, b) => a.title.localeCompare(b.title))
          .map<ResourceNode>(video => ({
            id: `video-${video.id}`,
            label: video.title,
            kind: 'video',
            video
          }))
      });
    }

    return nodes;
  }, [mainPresets, customPresets, videos]);

  const matches = useMemo(() => {
    if (!searchTerm.trim()) {
      return [];
    }
    const term = searchTerm.trim().toLowerCase();
    const presetMatches = presets
      .filter(preset => preset.config.name.toLowerCase().includes(term))
      .map<ResourceNode>(preset => ({
        id: preset.id,
        label: preset.config.name,
        kind: 'preset',
        preset
      }));
    const videoMatches = videos
      .filter(video => video.title.toLowerCase().includes(term))
      .map<ResourceNode>(video => ({
        id: `video-${video.id}`,
        label: video.title,
        kind: 'video',
        video
      }));
    return [...presetMatches, ...videoMatches];
  }, [presets, videos, searchTerm]);

  const toggleExpand = (nodeId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    node: ResourcePresetNode | ResourceVideoNode
  ) => {
    if (node.kind === 'preset') {
      event.dataTransfer.setData('text/plain', node.preset.id);
    } else {
      event.dataTransfer.setData('text/plain', `video:${node.video.id}`);
    }
    event.dataTransfer.effectAllowed = 'copy';
    document.body.classList.add('preset-dragging');
  };

  const handleDragEnd = () => {
    document.body.classList.remove('preset-dragging');
  };

  const renderNode = (node: ResourceNode, depth = 0) => {
    if (node.kind === 'folder') {
      const isExpanded = expanded.has(node.id);
      const hasChildren = node.children.length > 0;
      return (
        <div key={node.id} className="resource-node" style={{ paddingLeft: depth * 14 }}>
          <button
            type="button"
            className="resource-node__label"
            onClick={() => hasChildren && toggleExpand(node.id)}
          >
            <span className="resource-node__icon">{isExpanded ? '▼' : '▶'}</span>
            <span>{node.label}</span>
          </button>
          {isExpanded && hasChildren && (
            <div className="resource-node__children">
              {node.children.map(child => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const dragId = node.kind === 'preset' ? node.preset.id : `video:${node.video.id}`;
    const icon = node.kind === 'preset' ? getPresetThumbnail(node.preset) : '🎬';

    return (
      <div
        key={node.id}
        className="resource-node resource-node--item"
        style={{ paddingLeft: depth * 14 }}
        draggable
        onDragStart={event => handleDragStart(event, node)}
        onDragEnd={handleDragEnd}
        data-drag-id={dragId}
      >
        <div className="resource-node__item">
          <span className="resource-node__icon">{icon}</span>
          <span className="resource-node__title">{node.label}</span>
        </div>
      </div>
    );
  };

  return (
    <aside
      className="resource-explorer"
      style={{
        width: Math.max(width, PANEL_MIN_WIDTH),
        minWidth: Math.max(width, PANEL_MIN_WIDTH)
      }}
    >
      <div className="resource-explorer__content">
        <div className="resource-explorer__header">
          <h2>Recursos</h2>
          <div className="resource-explorer__actions">
            <button type="button" onClick={onOpenLibrary} className="resource-explorer__action">
              🗂️
            </button>
            <button
              type="button"
              onClick={onRefreshVideos}
              className="resource-explorer__action"
              disabled={isRefreshingVideos}
              title="Actualizar videos"
            >
              {isRefreshingVideos ? '⏳' : '🔄'}
            </button>
          </div>
        </div>
        <div className="resource-explorer__search">
          <input
            type="search"
            placeholder="Buscar presets o videos"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
          />
        </div>
        <div className="resource-explorer__body">
          {searchTerm ? (
            matches.length > 0 ? (
              <div className="resource-explorer__matches">
                {matches.map(match => (
                  <div
                    key={match.id}
                    className="resource-match"
                    draggable
                    onDragStart={event => handleDragStart(event, match as ResourcePresetNode | ResourceVideoNode)}
                    onDragEnd={handleDragEnd}
                  >
                    <span className="resource-node__icon">
                      {match.kind === 'preset' ? getPresetThumbnail((match as ResourcePresetNode).preset) : '🎬'}
                    </span>
                    <span className="resource-node__title">{match.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="resource-explorer__empty">Sin resultados</div>
            )
          ) : (
            <div className="resource-explorer__tree">
              {tree.map(node => renderNode(node))}
            </div>
          )}
        </div>
        <div className="resource-explorer__hint">
          Arrastra cualquier recurso al grid para asignarlo a un slot. También puedes abrir el gestor de modelos con el botón 🤗 de la barra superior.
        </div>
      </div>
    </aside>
  );
};

export default ResourceExplorer;
