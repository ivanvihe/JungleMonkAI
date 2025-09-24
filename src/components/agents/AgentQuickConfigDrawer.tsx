import React, { useMemo } from 'react';
import { Badge, Drawer, Space, Switch, Tag, Typography } from 'antd';
import type { BadgeProps } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { useAgents } from '../../core/agents/AgentContext';
import { getAgentDisplayName } from '../../utils/agentDisplay';
import type { AgentDefinition } from '../../core/agents/agentRegistry';
import { ProListPanel } from '../pro';

const STATUS_COLORS: Record<string, BadgeProps['status']> = {
  Disponible: 'success',
  Inactivo: 'default',
  'Sin clave': 'warning',
  Cargando: 'processing',
  Error: 'error',
};

interface AgentQuickConfigDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface AgentItem {
  id: string;
  agent: AgentDefinition;
  title: string;
  status: string;
  description?: string;
  kind: AgentDefinition['kind'];
  active: boolean;
}

export const AgentQuickConfigDrawer: React.FC<AgentQuickConfigDrawerProps> = ({ open, onClose }) => {
  const { agents, toggleAgent } = useAgents();

  const agentItems = useMemo<AgentItem[]>(
    () =>
      agents.map(agent => ({
        id: agent.id,
        agent,
        title: getAgentDisplayName(agent),
        status: agent.status,
        description: agent.objective ?? agent.description,
        kind: agent.kind,
        active: agent.active,
      })),
    [agents],
  );

  return (
    <Drawer
      title={
        <Space size={8} align="center">
          <RobotOutlined />
          <Typography.Text strong>Agentes operativos</Typography.Text>
        </Space>
      }
      placement="right"
      width={420}
      onClose={onClose}
      open={open}
      destroyOnClose={false}
      className="agent-quick-config"
    >
      <Typography.Paragraph type="secondary">
        Activa o pausa agentes rápidamente. Los cambios se aplican de forma inmediata y se sincronizan con la
        orquestación activa.
      </Typography.Paragraph>

      <ProListPanel<AgentItem>
        dataSource={agentItems}
        pagination={false}
        metas={{
          title: {
            dataIndex: 'title',
          },
          subTitle: {
            render: (_, row) => (
              <Space size={6} wrap>
                <Tag color={row.kind === 'cloud' ? 'geekblue' : 'green'}>{
                  row.kind === 'cloud' ? 'Cloud' : 'Local'
                }</Tag>
                <Badge status={STATUS_COLORS[row.status] ?? 'default'} text={row.status} />
              </Space>
            ),
          },
          description: {
            dataIndex: 'description',
            render: (_, row) =>
              row.description ? (
                <Typography.Text type="secondary">{row.description}</Typography.Text>
              ) : (
                <Typography.Text type="secondary">Sin descripción</Typography.Text>
              ),
          },
          actions: {
            render: (_, row) => [
              <Switch
                key="toggle"
                checked={row.active}
                checkedChildren="Activo"
                unCheckedChildren="Inactivo"
                onChange={() => toggleAgent(row.id)}
              />,
            ],
          },
        }}
      />
    </Drawer>
  );
};

export default AgentQuickConfigDrawer;
