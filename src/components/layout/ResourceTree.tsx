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
import './ResourceTree.css';

const { DirectoryTree } = Tree;

type WorkspaceTabKey = 'chat' | 'feed' | 'details';

interface ResourceTreeProps {
  activeView: 'chat' | 'repo' | 'canvas';
  activeWorkspaceTab: WorkspaceTabKey;
  onNodeSelect?: (key: string) => void;
  onNodeAction?: (key: string, action: string) => void;
  variant?: 'default' | 'compact';
}

type ResourceTreeMenuKey = 'open' | 'details' | 'refresh';

interface ResourceNode {
  key: string;
  title: string;
  icon: React.ReactNode;
  badge?: string;
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

const treeSchema: ResourceNode[] = [
  {
    key: 'workspace',
    title: 'Espacios de trabajo',
    icon: <ClusterOutlined />, 
    children: [
      {
        key: 'workspace-chat',
        title: 'Chat Operativo',
        icon: <MessageOutlined />,
        badge: 'Live',
      },
      {
        key: 'workspace-feed',
        title: 'Feed de eventos',
        icon: <RadarChartOutlined />,
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
  {
    key: 'agents',
    title: 'Agentes orquestados',
    icon: <RobotOutlined />,
    menu: agentMenu,
    children: [
      {
        key: 'agents-active',
        title: 'Activos',
        icon: <RobotOutlined />,
        badge: 'Auto',
        menu: agentMenu,
      },
      {
        key: 'agents-archived',
        title: 'Archivados',
        icon: <RobotOutlined />,
        menu: agentMenu,
      },
    ],
  },
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

  const decoratedTreeData = useMemo<DataNode[]>(() => {
    const selectedKeySet = new Set(selectedKeys.map(String));

    const buildNodes = (nodes: ResourceNode[]): DataNode[] =>
      nodes.map(node => {
        const menuItems = node.menu ?? defaultMenu;
        const isActive = selectedKeySet.has(node.key);
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
              {node.badge ? <span className="resource-tree-item__badge">{node.badge}</span> : null}
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
  }, [onNodeAction, selectedKeys]);

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
