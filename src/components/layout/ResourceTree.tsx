import React, { useEffect, useMemo, useState } from 'react';
import { Dropdown, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { MenuProps } from 'antd';
import {
  ApiOutlined,
  AppstoreOutlined,
  BranchesOutlined,
  ClusterOutlined,
  DeploymentUnitOutlined,
  InboxOutlined,
  MessageOutlined,
  RadarChartOutlined,
  RobotOutlined,
  SettingOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import type { AgentPresenceSummary } from '../../core/agents/presence';
import './ResourceTree.css';

const { DirectoryTree } = Tree;

type WorkspaceTabKey = 'chat' | 'feed' | 'details';

interface ResourceTreeProps {
  activeView: 'chat' | 'repo' | 'canvas';
  activeWorkspaceTab: WorkspaceTabKey;
  onNodeSelect?: (key: string) => void;
  onNodeAction?: (key: string, action: string) => void;
  variant?: 'default' | 'compact';
  presenceSummary: AgentPresenceSummary;
  pendingResponses: number;
}

type ResourceTreeMenuKey = 'open' | 'details' | 'refresh';

interface ResourceNode {
  key: string;
  title: string;
  icon: React.ReactNode;
  badge?: string;
  badgeTone?: 'default' | 'success' | 'warning' | 'processing' | 'error';
  menu?: MenuProps['items'];
  children?: ResourceNode[];
}

const defaultMenu: MenuProps['items'] = [
  { key: 'open', label: 'Abrir' },
  { key: 'details', label: 'Ver detalles' },
];

const agentMenu: MenuProps['items'] = [
  { key: 'open', label: 'Ver agentes' },
  { key: 'refresh', label: 'Actualizar estado' },
];

const baseWorkspaceNodes = (
  pendingResponses: number,
): ResourceNode[] => [
  {
    key: 'workspace',
    title: 'Espacios de trabajo',
    icon: <ClusterOutlined />,
    children: [
      {
        key: 'workspace-chat',
        title: 'Chat Operativo',
        icon: <MessageOutlined />,
        badge: pendingResponses > 0 ? `${pendingResponses}` : 'Live',
        badgeTone: pendingResponses > 0 ? 'warning' : 'processing',
      },
      {
        key: 'workspace-feed',
        title: 'Feed de eventos',
        icon: <RadarChartOutlined />,
        badge: pendingResponses > 0 ? `${pendingResponses}` : undefined,
        badgeTone: pendingResponses > 0 ? 'processing' : undefined,
      },
      {
        key: 'workspace-details',
        title: 'Panel de detalles',
        icon: <ShareAltOutlined />,
      },
      {
        key: 'workspace-repo',
        title: 'Repositorios',
        icon: <BranchesOutlined />,
      },
      {
        key: 'workspace-canvas',
        title: 'Code Canvas',
        icon: <DeploymentUnitOutlined />,
      },
    ],
  },
];

const baseAgentNodes = (summary: AgentPresenceSummary): ResourceNode[] => [
  {
    key: 'agents',
    title: 'Agentes orquestados',
    icon: <RobotOutlined />,
    menu: agentMenu,
    badge: `${summary.totals.online + summary.totals.loading}/${
      summary.totals.online + summary.totals.offline + summary.totals.error + summary.totals.loading
    }`,
    badgeTone: summary.totals.error > 0 ? 'error' : summary.totals.online > 0 ? 'success' : 'default',
    children: [
      {
        key: 'agents-active',
        title: 'Activos',
        icon: <RobotOutlined />,
        badge: `${summary.totals.online}`,
        badgeTone: 'success',
        menu: agentMenu,
      },
      {
        key: 'agents-archived',
        title: 'Archivados',
        icon: <RobotOutlined />,
        badge: `${summary.totals.offline}`,
        badgeTone: summary.totals.offline > 0 ? 'default' : undefined,
        menu: agentMenu,
      },
    ],
  },
];

const baseModelNodes = (): ResourceNode[] => [
  {
    key: 'models',
    title: 'Modelos',
    icon: <AppstoreOutlined />,
    children: [
      {
        key: 'models-local',
        title: 'Modelos locales',
        icon: <InboxOutlined />,
      },
      {
        key: 'models-cloud',
        title: 'Modelos en nube',
        icon: <ApiOutlined />,
      },
    ],
  },
];

const baseProjectNodes = (): ResourceNode[] => [
  {
    key: 'projects',
    title: 'Proyectos',
    icon: <BranchesOutlined />,
    children: [
      {
        key: 'projects-active',
        title: 'Activos',
        icon: <BranchesOutlined />,
      },
      {
        key: 'projects-archive',
        title: 'Histórico',
        icon: <InboxOutlined />,
      },
    ],
  },
];

const basePreferenceNodes = (): ResourceNode[] => [
  {
    key: 'preferences',
    title: 'Preferencias',
    icon: <SettingOutlined />,
    children: [
      {
        key: 'preferences-routing',
        title: 'Rutas inteligentes',
        icon: <ShareAltOutlined />,
      },
      {
        key: 'preferences-workspace',
        title: 'Diseño del workspace',
        icon: <SettingOutlined />,
      },
    ],
  },
];

const baseUtilityNodes = (): ResourceNode[] => [
  {
    key: 'plugins',
    title: 'Plugins y extensiones',
    icon: <DeploymentUnitOutlined />,
  },
  {
    key: 'mcp',
    title: 'Perfiles MCP',
    icon: <ShareAltOutlined />,
  },
  {
    key: 'settings',
    title: 'Ajustes globales',
    icon: <SettingOutlined />,
  },
];

const deriveWorkspaceKey = (
  activeView: 'chat' | 'repo' | 'canvas',
  tab: WorkspaceTabKey,
): string | null => {
  if (activeView === 'chat') {
    return `workspace-${tab}`;
  }
  if (activeView === 'repo') {
    return 'workspace-repo';
  }
  if (activeView === 'canvas') {
    return 'workspace-canvas';
  }
  return null;
};

export const ResourceTree: React.FC<ResourceTreeProps> = ({
  activeView,
  activeWorkspaceTab,
  onNodeSelect,
  onNodeAction,
  variant = 'default',
  presenceSummary,
  pendingResponses,
}) => {
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(['workspace', 'agents', 'models']);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  useEffect(() => {
    const workspaceKey = deriveWorkspaceKey(activeView, activeWorkspaceTab);
    if (!workspaceKey) {
      return;
    }

    setSelectedKeys(current => {
      if (current.length === 0) {
        return [workspaceKey];
      }

      const [currentKey] = current;
      if (typeof currentKey === 'string' && currentKey.startsWith('workspace-') && currentKey !== workspaceKey) {
        return [workspaceKey];
      }

      return current;
    });
  }, [activeView, activeWorkspaceTab]);

  const treeSchema = useMemo(
    () => [
      ...baseWorkspaceNodes(pendingResponses),
      ...baseAgentNodes(presenceSummary),
      ...baseModelNodes(),
      ...baseProjectNodes(),
      ...basePreferenceNodes(),
      ...baseUtilityNodes(),
    ],
    [pendingResponses, presenceSummary],
  );

  const decoratedTreeData = useMemo<DataNode[]>(() => {
    const selectedKeySet = new Set(selectedKeys.map(String));

    const buildNodes = (nodes: ResourceNode[]): DataNode[] =>
      nodes.map(node => {
        const menuItems = node.menu ?? defaultMenu;
        const isActive = selectedKeySet.has(node.key);
        const badgeTone = node.badgeTone ? ` resource-tree-item__badge--${node.badgeTone}` : '';
        const titleContent = (
          <Dropdown
            trigger={['contextMenu']}
            menu={{
              items: menuItems,
              onClick: ({ key }) => onNodeAction?.(node.key, key as ResourceTreeMenuKey),
            }}
          >
            <span className={`resource-tree-item ${isActive ? 'is-active' : ''}`}>
              <span className="resource-tree-item__icon">{node.icon}</span>
              <span className="resource-tree-item__label">{node.title}</span>
              {node.badge ? (
                <span className={`resource-tree-item__badge${badgeTone}`}>{node.badge}</span>
              ) : null}
            </span>
          </Dropdown>
        );

        return {
          key: node.key,
          title: titleContent,
          className: `resource-tree-node ${isActive ? 'resource-tree-node--active' : ''}`,
          children: node.children ? buildNodes(node.children) : undefined,
        } satisfies DataNode;
      });

    return buildNodes(treeSchema);
  }, [onNodeAction, selectedKeys, treeSchema]);

  return (
    <div className={`resource-tree resource-tree--${variant}`}>
      <DirectoryTree
        treeData={decoratedTreeData}
        expandedKeys={expandedKeys}
        onExpand={keys => setExpandedKeys(keys)}
        selectedKeys={selectedKeys}
        onSelect={(keys, info) => {
          setSelectedKeys(keys);
          const targetKey = info.node?.key;
          if (typeof targetKey === 'string') {
            onNodeSelect?.(targetKey);
          }
        }}
        multiple={false}
        showIcon={false}
        blockNode
        height={variant === 'compact' ? undefined : 520}
      />
      <Typography.Paragraph className="resource-tree__hint" type="secondary">
        Click izquierdo para navegar · Click derecho para acciones rápidas
      </Typography.Paragraph>
    </div>
  );
};

export default ResourceTree;
