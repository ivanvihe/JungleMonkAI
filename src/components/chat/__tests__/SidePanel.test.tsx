import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SidePanel } from '../SidePanel';
import type { SidePanelPreferences } from '../../../types/globalSettings';

vi.mock('../../models/ModelGallery', () => ({
  ModelGallery: () => <div data-testid="model-gallery">Model gallery</div>,
}));

vi.mock('../../agents/AgentPresenceList', () => ({
  AgentPresenceList: () => <div data-testid="agent-presence">Agent list</div>,
}));

vi.mock('../../quality/QualityDashboard', () => ({
  QualityDashboard: () => <div data-testid="quality-dashboard">Quality dashboard</div>,
}));

vi.mock('../../orchestration/AgentConversationPanel', () => ({
  AgentConversationPanel: () => <div data-testid="agent-conversation">Conversation panel</div>,
}));

vi.mock('../../../core/agents/AgentContext', () => ({
  useAgents: () => ({
    agents: [
      {
        id: 'agent-1',
        name: 'Agent One',
        channel: 'gpt',
        kind: 'cloud',
        provider: 'openai',
        accent: '#ff6600',
        active: true,
        status: 'Listo',
      },
    ],
    agentMap: new Map([
      [
        'agent-1',
        {
          id: 'agent-1',
          name: 'Agent One',
          channel: 'gpt',
          kind: 'cloud',
          provider: 'openai',
          accent: '#ff6600',
          active: true,
          status: 'Listo',
        },
      ],
    ]),
    toggleAgent: vi.fn(),
    assignAgentRole: vi.fn(),
  }),
}));

vi.mock('../../../core/messages/MessageContext', () => ({
  useMessages: () => ({
    quickCommands: ['Hola'],
    appendToDraft: vi.fn(),
    messages: [],
    pendingResponses: 0,
    agentResponses: [],
    formatTimestamp: (value: number | string) => String(value),
    toPlainText: () => '',
    feedbackByMessage: {},
    markMessageFeedback: vi.fn(),
    submitCorrection: vi.fn(),
    correctionHistory: [],
    coordinationStrategy: 'parallel',
    setCoordinationStrategy: vi.fn(),
    sharedSnapshot: null,
    orchestrationTraces: [],
  }),
}));

vi.mock('../../../hooks/useSidePanelSlots', () => ({
  useSidePanelSlots: () => [
    {
      id: 'alpha:panel',
      pluginId: 'alpha',
      label: 'Panel plugin',
      Component: () => <div>Contenido plugin</div>,
    },
  ],
}));

vi.mock('../../../utils/secrets', () => ({
  providerSecretExists: () => Promise.resolve(false),
  storeProviderSecret: vi.fn(),
}));

const createLayout = (overrides: Partial<SidePanelPreferences> = {}): SidePanelPreferences => ({
  position: 'right',
  width: 420,
  collapsed: false,
  activeSectionId: 'channels',
  ...overrides,
});

const Wrapper: React.FC<{ initialLayout?: Partial<SidePanelPreferences> }> = ({ initialLayout }) => {
  const [layout, setLayout] = React.useState<SidePanelPreferences>(createLayout(initialLayout));

  return (
    <SidePanel
      apiKeys={{ openai: '', anthropic: '', groq: '' }}
      onApiKeyChange={vi.fn()}
      presenceMap={new Map()}
      onRefreshAgentPresence={vi.fn()}
      layout={layout}
      onLayoutChange={updater => setLayout(prev => updater(prev))}
    />
  );
};

describe('SidePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the default core section in tab mode and hides inactive ones', () => {
    render(<Wrapper />);

    expect(screen.getByText('Estado en tiempo real de tus proveedores.')).toBeInTheDocument();
    expect(
      screen.queryByText('Guarda instrucciones recurrentes para dispararlas en el chat.'),
    ).not.toBeInTheDocument();
  });

  it('allows switching to plugin panels', async () => {
    render(<Wrapper />);

    const [pluginTab] = screen.getAllByRole('tab', { name: 'Panel plugin' });
    fireEvent.click(pluginTab);

    expect(await screen.findByText('Contenido plugin')).toBeInTheDocument();
    await waitFor(() => {
      expect(pluginTab).toHaveAttribute('aria-selected', 'true');
    });
  });
});
