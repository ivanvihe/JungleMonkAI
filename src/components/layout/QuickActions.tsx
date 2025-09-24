import React from 'react';
import { Button, Divider, Space, Tooltip, Typography } from 'antd';
import {
  ApiOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  ClusterOutlined,
  ControlOutlined,
  PlusCircleOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { ProSectionCard } from '../pro';
import './QuickActions.css';

export interface QuickActionsProps {
  onOpenSettings: () => void;
  onOpenPlugins: () => void;
  onOpenMcp: () => void;
  onOpenModelManager: () => void;
  onOpenStats: () => void;
  onRefreshPresence: () => void;
  onOpenAgentQuickConfig: () => void;
  onOpenModelQuickConfig: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onOpenSettings,
  onOpenPlugins,
  onOpenMcp,
  onOpenModelManager,
  onOpenStats,
  onRefreshPresence,
  onOpenAgentQuickConfig,
  onOpenModelQuickConfig,
}) => {
  return (
    <ProSectionCard
      className="quick-actions"
      title={
        <Space align="center" size={6} className="quick-actions__title">
          <ControlOutlined />
          <Typography.Text strong>Acciones rápidas</Typography.Text>
        </Space>
      }
      extra={
        <Tooltip title="Refrescar estado de agentes">
          <Button
            type="text"
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={onRefreshPresence}
            aria-label="Refrescar estado"
          />
        </Tooltip>
      }
      bordered
      aria-label="Accesos rápidos"
    >
      <div className="quick-actions__grid">
        <Button block icon={<PlusCircleOutlined />} onClick={onOpenStats}>
          Task history
        </Button>
        <Button block icon={<AppstoreOutlined />} onClick={onOpenPlugins}>
          Plugins
        </Button>
        <Button block icon={<ApiOutlined />} onClick={onOpenMcp}>
          Perfiles MCP
        </Button>
        <Button block icon={<ClusterOutlined />} onClick={onOpenAgentQuickConfig}>
          Agentes
        </Button>
        <Button block icon={<BarChartOutlined />} onClick={onOpenModelQuickConfig}>
          Modelos rápidos
        </Button>
        <Button block icon={<SettingOutlined />} onClick={onOpenModelManager}>
          Gestor avanzado
        </Button>
      </div>

      <Divider className="quick-actions__divider" />

      <Button block type="primary" icon={<SettingOutlined />} onClick={onOpenSettings}>
        Preferencias globales
      </Button>
    </ProSectionCard>
  );
};

export default QuickActions;
