import React from 'react';
import { Button, Divider, Tooltip, Typography } from 'antd';
import {
  ApiOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  PlusCircleOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import './QuickActions.css';

export interface QuickActionsProps {
  onOpenSettings: () => void;
  onOpenPlugins: () => void;
  onOpenMcp: () => void;
  onOpenModelManager: () => void;
  onOpenStats: () => void;
  onRefreshPresence: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onOpenSettings,
  onOpenPlugins,
  onOpenMcp,
  onOpenModelManager,
  onOpenStats,
  onRefreshPresence,
}) => {
  return (
    <section className="quick-actions" aria-label="Accesos rápidos">
      <header className="quick-actions__header">
        <Typography.Text type="secondary">Acciones rápidas</Typography.Text>
        <Tooltip title="Refrescar estado de agentes">
          <Button
            type="text"
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={onRefreshPresence}
            aria-label="Refrescar estado"
          />
        </Tooltip>
      </header>

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
        <Button block icon={<BarChartOutlined />} onClick={onOpenModelManager}>
          Modelos
        </Button>
      </div>

      <Divider className="quick-actions__divider" />

      <Button block type="primary" icon={<SettingOutlined />} onClick={onOpenSettings}>
        Preferencias globales
      </Button>
    </section>
  );
};

export default QuickActions;
