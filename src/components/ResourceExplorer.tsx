import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Collapse,
  Divider,
  Empty,
  Input,
  List,
  Segmented,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Tree,
  Typography,
} from 'antd';
import type { TreeDataNode } from 'antd/es/tree';
import {
  AppstoreOutlined,
  ClockCircleOutlined,
  FolderOpenOutlined,
  HighlightOutlined,
  LockOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StarFilled,
  StarOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
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

type ResourceFilter = 'all' | 'favorites' | 'recent' | 'locked';

type ActiveTab = 'presets' | 'videos' | 'collections';

const PANEL_MIN_WIDTH = 260;

const escapeRegExp = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightText = (text: string, term: string): React.ReactNode => {
  if (!term.trim()) {
    return text;
  }

  const regex = new RegExp(`(${escapeRegExp(term)})`, 'ig');
  const parts = text.split(regex);
  const lowerTerm = term.toLowerCase();

  return parts.map((part, index) =>
    part.toLowerCase() === lowerTerm ? (
      <mark key={`${part}-${index}`} className="resource-highlight">
        {part}
      </mark>
    ) : (
      part
    ),
  );
};

const ResourceExplorer: React.FC<ResourceExplorerProps> = ({
  width,
  presets,
  videos,
  onOpenLibrary,
  onRefreshVideos,
  isRefreshingVideos = false,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(['presets', 'main-presets', 'custom-presets', 'videos']),
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('presets');
  const [filter, setFilter] = useState<ResourceFilter>('all');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);

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
              .slice()
              .sort((a, b) => a.config.name.localeCompare(b.config.name))
              .map<ResourceNode>(preset => ({
                id: preset.id,
                label: preset.config.name,
                kind: 'preset',
                preset,
              })),
          },
          {
            id: 'custom-presets',
            label: 'Custom presets',
            kind: 'folder',
            children: customPresets
              .slice()
              .sort((a, b) => a.config.name.localeCompare(b.config.name))
              .map<ResourceNode>(preset => ({
                id: preset.id,
                label: preset.config.name,
                kind: 'preset',
                preset,
              })),
          },
        ],
      },
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
            video,
          })),
      });
    }

    return nodes;
  }, [mainPresets, customPresets, videos]);

  const matches = useMemo(() => {
    if (!searchTerm.trim()) {
      return [] as ResourceNode[];
    }
    const term = searchTerm.trim().toLowerCase();
    const presetMatches = presets
      .filter(preset => preset.config.name.toLowerCase().includes(term))
      .map<ResourceNode>(preset => ({
        id: preset.id,
        label: preset.config.name,
        kind: 'preset',
        preset,
      }));
    const videoMatches = videos
      .filter(video => video.title.toLowerCase().includes(term))
      .map<ResourceNode>(video => ({
        id: `video-${video.id}`,
        label: video.title,
        kind: 'video',
        video,
      }));
    return [...presetMatches, ...videoMatches];
  }, [presets, videos, searchTerm]);

  const createGhostPreview = (label: string, icon: React.ReactNode) => {
    const ghost = document.createElement('div');
    ghost.className = 'resource-drag-ghost';
    ghost.innerHTML = `<span class="resource-drag-ghost__icon">${typeof icon === 'string' ? icon : ''}</span><span class="resource-drag-ghost__label">${label}</span>`;
    document.body.appendChild(ghost);
    dragGhostRef.current = ghost;
    return ghost;
  };

  const clearGhostPreview = () => {
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
  };

  useEffect(() => () => clearGhostPreview(), []);

  const toggleFavorite = (nodeId: string) => {
    setFavoriteIds(previous => {
      const next = new Set(previous);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const toggleLocked = (nodeId: string) => {
    setLockedIds(previous => {
      const next = new Set(previous);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const registerRecent = (nodeId: string) => {
    setRecentIds(previous => {
      const filtered = previous.filter(id => id !== nodeId);
      return [nodeId, ...filtered].slice(0, 12);
    });
  };

  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    node: ResourcePresetNode | ResourceVideoNode,
  ) => {
    if (node.kind === 'preset') {
      event.dataTransfer.setData('text/plain', node.preset.id);
    } else {
      event.dataTransfer.setData('text/plain', `video:${node.video.id}`);
    }
    event.dataTransfer.effectAllowed = 'copy';
    registerRecent(node.id);

    const icon = node.kind === 'preset' ? getPresetThumbnail(node.preset) : '🎬';
    const ghost = createGhostPreview(node.label, icon);
    const rect = ghost.getBoundingClientRect();
    event.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);

    document.body.classList.add('preset-dragging');
  };

  const handleDragEnd = () => {
    document.body.classList.remove('preset-dragging');
    clearGhostPreview();
  };

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

  const passesFilter = (node: ResourceNode): boolean => {
    if (filter === 'all') {
      return true;
    }

    if (filter === 'favorites') {
      return favoriteIds.has(node.id);
    }

    if (filter === 'locked') {
      return lockedIds.has(node.id);
    }

    if (filter === 'recent') {
      return recentIds.includes(node.id);
    }

    return true;
  };

  const filteredMatches = useMemo(
    () => matches.filter(node => passesFilter(node)),
    [matches, filter, favoriteIds, lockedIds, recentIds],
  );

  const flattenedNodes = useMemo(() => {
    const collect: ResourceNode[] = [];
    const visit = (nodes: ResourceNode[]) => {
      nodes.forEach(node => {
        if (node.kind === 'folder') {
          visit(node.children);
        } else {
          collect.push(node);
        }
      });
    };
    visit(tree);
    return collect;
  }, [tree]);

  const collectionSource = useMemo(() => {
    if (searchTerm) {
      return filteredMatches;
    }
    return flattenedNodes.filter(node => passesFilter(node));
  }, [filteredMatches, flattenedNodes, searchTerm, filter, favoriteIds, lockedIds, recentIds]);

  const renderNode = (node: ResourceNode, depth = 0): React.ReactNode => {
    if (node.kind === 'folder') {
      const isExpanded = expanded.has(node.id);
      const hasChildren = node.children.length > 0;
      return (
        <div key={node.id} className="resource-node" style={{ paddingInlineStart: depth * 14 }}>
          <Button
            type="text"
            className="resource-node__label"
            onClick={() => hasChildren && toggleExpand(node.id)}
            icon={isExpanded ? <FolderOpenOutlined /> : <AppstoreOutlined />}
            aria-expanded={isExpanded}
          >
            {node.label}
            <Badge count={node.children.length} size="small" color="rgba(255,255,255,0.45)" className="resource-node__badge" />
          </Button>
          {isExpanded && hasChildren && (
            <div className="resource-node__children" role="group">
              {node.children.map(child => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const dragId = node.kind === 'preset' ? node.preset.id : `video:${node.video.id}`;
    const icon = node.kind === 'preset' ? getPresetThumbnail(node.preset) : '🎬';
    const isFavorite = favoriteIds.has(node.id);
    const isLocked = lockedIds.has(node.id);
    const isRecent = recentIds.includes(node.id);

    if (!passesFilter(node)) {
      return null;
    }

    return (
      <div
        key={node.id}
        className="resource-node resource-node--item"
        style={{ paddingInlineStart: depth * 14 }}
        draggable={!isLocked}
        onDragStart={event => !isLocked && handleDragStart(event, node)}
        onDragEnd={handleDragEnd}
        data-drag-id={dragId}
        role="button"
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            registerRecent(node.id);
          }
        }}
        aria-disabled={isLocked}
        aria-pressed={isFavorite}
      >
        <div className="resource-node__item">
          <span className="resource-node__icon" aria-hidden="true">
            {icon}
          </span>
          <span className="resource-node__title">{highlightText(node.label, searchTerm)}</span>
          <Space>
            {isRecent && <Tag color="geekblue" bordered={false} icon={<ClockCircleOutlined />}>Reciente</Tag>}
            {isFavorite && <Tag color="gold" bordered={false} icon={<StarFilled />}>Favorito</Tag>}
            {isLocked && <Tag color="volcano" bordered={false} icon={<LockOutlined />}>Bloqueado</Tag>}
          </Space>
        </div>
        <div className="resource-node__actions">
          <Tooltip title={isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}>
            <Button
              type="text"
              icon={isFavorite ? <StarFilled /> : <StarOutlined />}
              onClick={() => toggleFavorite(node.id)}
              aria-pressed={isFavorite}
              tabIndex={-1}
            />
          </Tooltip>
          <Tooltip title={isLocked ? 'Desbloquear recurso' : 'Bloquear recurso para evitar arrastres'}>
            <Button
              type="text"
              icon={<LockOutlined style={{ opacity: isLocked ? 1 : 0.4 }} />}
              onClick={() => toggleLocked(node.id)}
              aria-pressed={isLocked}
              tabIndex={-1}
            />
          </Tooltip>
        </div>
      </div>
    );
  };

  const treeData: TreeDataNode[] = useMemo(() => {
    const buildTreeData = (nodes: ResourceNode[]): TreeDataNode[] =>
      nodes.map(node => {
        if (node.kind === 'folder') {
          return {
            key: node.id,
            title: (
              <span className="resource-tree-title">
                <FolderOpenOutlined /> {node.label}
              </span>
            ),
            children: buildTreeData(node.children),
          };
        }

        return {
          key: node.id,
          title: (
            <span className="resource-tree-title">
              {node.kind === 'preset' ? getPresetThumbnail(node.preset) : <VideoCameraOutlined />} {node.label}
            </span>
          ),
          isLeaf: true,
        };
      });

    return buildTreeData(tree);
  }, [tree]);

  const presetPanels = [
    {
      key: 'preset-tree',
      label: 'Árbol de presets',
      children: (
        <Tree
          className="resource-tree"
          treeData={treeData.filter(node => node.key === 'presets')}
          defaultExpandAll
          selectable={false}
          showIcon
        />
      ),
    },
    {
      key: 'preset-list',
      label: 'Listado detallado',
      children: <div className="resource-explorer__tree">{tree[0]?.children.map(child => renderNode(child))}</div>,
    },
  ];

  const videoPanels = [
    {
      key: 'video-tree',
      label: 'Galería jerárquica',
      children: (
        <Tree
          className="resource-tree"
          treeData={treeData.filter(node => node.key === 'videos')}
          defaultExpandAll
          selectable={false}
          showIcon
        />
      ),
    },
    {
      key: 'video-grid',
      label: 'Tarjetas de video',
      children: (
        <List
          grid={{ gutter: 12, column: 2 }}
          dataSource={tree
            .find(node => node.id === 'videos')?.children.filter(child => passesFilter(child)) ?? []}
          locale={{ emptyText: <Empty description="No hay videos disponibles" /> }}
          renderItem={item => (
            <List.Item key={item.id}>
              <Card
                hoverable
                className="resource-card"
                aria-label={item.label}
                onMouseDown={() => registerRecent(item.id)}
                actions={[
                  <Tooltip
                    key="drag"
                    title={lockedIds.has(item.id) ? 'Video bloqueado' : 'Arrastra para usar'}
                  >
                    <PlayCircleOutlined />
                  </Tooltip>,
                ]}
              >
                <Card.Meta
                  avatar={<span className="resource-card__avatar">🎬</span>}
                  title={highlightText(item.label, searchTerm)}
                  description={item.kind === 'video' ? item.video.description ?? 'Recurso de video' : undefined}
                />
                <div className="resource-card__tags">
                  {recentIds.includes(item.id) && <Tag color="geekblue">Reciente</Tag>}
                  {favoriteIds.has(item.id) && <Tag color="gold">Favorito</Tag>}
                  {lockedIds.has(item.id) && <Tag color="volcano">Bloqueado</Tag>}
                </div>
              </Card>
            </List.Item>
          )}
        />
      ),
    },
  ];

  const collectionPanels = [
    {
      key: 'collection-grid',
      label: 'Recursos destacados',
      children: (
        <List
          grid={{ gutter: 16, column: 2 }}
          dataSource={collectionSource}
          locale={{ emptyText: <Empty description="Sin coincidencias" /> }}
          renderItem={item => (
            <List.Item key={item.id}>
              <Card className="resource-card" hoverable>
                <Card.Meta
                  avatar={
                    <span className="resource-card__avatar">
                      {item.kind === 'preset' ? getPresetThumbnail(item.preset) : '🎬'}
                    </span>
                  }
                  title={highlightText(item.label, searchTerm)}
                  description={item.kind === 'preset' ? 'Preset visual' : 'Recurso de video'}
                />
                <div className="resource-card__tags">
                  {favoriteIds.has(item.id) && <Tag color="gold">Favorito</Tag>}
                  {lockedIds.has(item.id) && <Tag color="volcano">Bloqueado</Tag>}
                  {recentIds.includes(item.id) && <Tag color="geekblue">Reciente</Tag>}
                </div>
              </Card>
            </List.Item>
          )}
        />
      ),
    },
  ];

  const tabItems = [
    {
      key: 'presets',
      label: 'Presets',
      children: <Collapse items={presetPanels} bordered={false} ghost />,
    },
    {
      key: 'videos',
      label: 'Videos',
      children: <Collapse items={videoPanels} bordered={false} ghost />,
    },
    {
      key: 'collections',
      label: 'Colecciones',
      children: <Collapse items={collectionPanels} bordered={false} ghost />,
    },
  ];

  return (
    <aside
      className="resource-explorer"
      style={{
        width: Math.max(width, PANEL_MIN_WIDTH),
        minWidth: Math.max(width, PANEL_MIN_WIDTH),
      }}
      role="complementary"
      aria-label="Explorador de recursos"
    >
      <div className="resource-explorer__content">
        <div className="resource-explorer__header">
          <Space direction="vertical" size={0}>
            <Typography.Title level={4}>Recursos</Typography.Title>
            <Typography.Text type="secondary">
              Gestiona presets, videos y colecciones en un solo lugar.
            </Typography.Text>
          </Space>
          <Space>
            <Tooltip title="Abrir biblioteca completa">
              <Button
                type="default"
                shape="circle"
                icon={<HighlightOutlined />}
                onClick={onOpenLibrary}
                aria-label="Abrir biblioteca"
              />
            </Tooltip>
            <Tooltip title="Actualizar videos">
              <Button
                type="default"
                shape="circle"
                icon={<ReloadOutlined spin={isRefreshingVideos} />}
                onClick={onRefreshVideos}
                disabled={isRefreshingVideos}
                aria-label="Actualizar videos"
              />
            </Tooltip>
          </Space>
        </div>

        <div className="resource-explorer__search">
          <Input.Search
            placeholder="Buscar presets o videos"
            allowClear
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            onSearch={value => setSearchTerm(value)}
            enterButton
            aria-label="Buscar recursos"
          />
        </div>

        <Segmented
          className="resource-explorer__filters"
          value={filter}
          onChange={value => setFilter(value as ResourceFilter)}
          options={[
            { label: 'Todos', value: 'all', icon: <AppstoreOutlined /> },
            { label: 'Favoritos', value: 'favorites', icon: <StarFilled /> },
            { label: 'Recientes', value: 'recent', icon: <ClockCircleOutlined /> },
            { label: 'Bloqueados', value: 'locked', icon: <LockOutlined /> },
          ]}
          aria-label="Filtrar recursos"
        />

        {searchTerm && (
          <div className="resource-explorer__results" role="region" aria-live="polite">
            <Typography.Text type="secondary">
              {filteredMatches.length} coincidencia(s) para "{searchTerm}"
            </Typography.Text>
            <List
              className="resource-explorer__matches"
              dataSource={filteredMatches}
              locale={{ emptyText: <Empty description="Sin resultados" /> }}
              renderItem={match => (
                <List.Item key={match.id} className="resource-match">
                  <div
                    className="resource-match__item"
                    draggable={!lockedIds.has(match.id)}
                    onDragStart={event =>
                      !lockedIds.has(match.id) && handleDragStart(event, match as ResourcePresetNode | ResourceVideoNode)
                    }
                    onDragEnd={handleDragEnd}
                    role="button"
                    tabIndex={0}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        registerRecent(match.id);
                      }
                    }}
                  >
                    <span className="resource-node__icon" aria-hidden="true">
                      {match.kind === 'preset' ? getPresetThumbnail((match as ResourcePresetNode).preset) : '🎬'}
                    </span>
                    <span className="resource-node__title">{highlightText(match.label, searchTerm)}</span>
                    <Space size="small">
                      {favoriteIds.has(match.id) && <Tag color="gold">Favorito</Tag>}
                      {recentIds.includes(match.id) && <Tag color="geekblue">Reciente</Tag>}
                    </Space>
                  </div>
                </List.Item>
              )}
            />
            <Divider />
          </div>
        )}

        <Tabs
          activeKey={activeTab}
          onChange={key => setActiveTab(key as ActiveTab)}
          items={tabItems}
          className="resource-explorer__tabs"
        />

        <div className="resource-explorer__hint">
          Arrastra cualquier recurso al grid para asignarlo a un slot. También puedes abrir el gestor de modelos con el
          botón 🤗 de la barra superior.
        </div>
      </div>
    </aside>
  );
};

export default ResourceExplorer;
