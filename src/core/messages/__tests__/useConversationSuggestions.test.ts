import { describe, expect, it } from 'vitest';
import { buildDynamicSuggestions, buildRecentCommands } from '../useConversationSuggestions';
import type { ChatMessage } from '../messageTypes';

const baseTimestamp = new Date().toISOString();

const createAgentMessage = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: `agent-${Math.random().toString(16).slice(2, 8)}`,
  author: 'agent',
  content: 'Respuesta generada.',
  timestamp: baseTimestamp,
  status: 'sent',
  ...overrides,
});

const createUserMessage = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: `user-${Math.random().toString(16).slice(2, 8)}`,
  author: 'user',
  content: 'gpt, ayúdame con esto.',
  timestamp: baseTimestamp,
  status: 'sent',
  ...overrides,
});

describe('useConversationSuggestions helpers', () => {
  it('genera sugerencias dinámicas para respuestas pendientes y seguimiento', () => {
    const agentMessage = createAgentMessage({
      id: 'a-1',
      agentId: 'claude',
      content: 'Resumen listo.',
    });

    const suggestions = buildDynamicSuggestions({
      pendingResponses: 2,
      agentResponses: [agentMessage],
      lastUserMessage: undefined,
      resolveAgentName: agentId => (agentId === 'claude' ? 'Claude' : undefined),
      toPlainText: content => (typeof content === 'string' ? content : ''),
    });

    expect(suggestions.some(entry => entry.id === 'pending-responses')).toBe(true);
    const followUp = suggestions.find(entry => entry.id === `followup-${agentMessage.id}`);
    expect(followUp?.label).toContain('Claude');
  });

  it('omite la sugerencia de pendientes cuando el contador es cero', () => {
    const suggestions = buildDynamicSuggestions({
      pendingResponses: 0,
      agentResponses: [],
      lastUserMessage: undefined,
      resolveAgentName: () => undefined,
      toPlainText: content => (typeof content === 'string' ? content : ''),
    });

    expect(suggestions.find(entry => entry.id === 'pending-responses')).toBeUndefined();
  });

  it('incluye la reutilización del último mensaje del usuario', () => {
    const lastMessage = createUserMessage({
      id: 'u-1',
      content: 'equipo, revisad el pull request más reciente.',
    });

    const suggestions = buildDynamicSuggestions({
      pendingResponses: 0,
      agentResponses: [],
      lastUserMessage: lastMessage,
      resolveAgentName: () => undefined,
      toPlainText: content => (typeof content === 'string' ? content : ''),
    });

    const reuse = suggestions.find(entry => entry.id === `reuse-${lastMessage.id}`);
    expect(reuse?.text).toBe('equipo, revisad el pull request más reciente.');
  });

  it('detecta comandos recientes desde los mensajes del usuario', () => {
    const messages: ChatMessage[] = [
      createUserMessage({ id: 'u-1', content: 'hola equipo' }),
      createUserMessage({ id: 'u-2', content: 'gpt, genera un resumen del proyecto.' }),
      createUserMessage({ id: 'u-3', content: '/auditar tareas abiertas' }),
      { ...createUserMessage({ id: 'u-4', content: 'gpt, genera un resumen del proyecto.' }), timestamp: baseTimestamp },
    ];

    const commands = buildRecentCommands(messages, content => (typeof content === 'string' ? content : ''));

    expect(commands).toContain('gpt, genera un resumen del proyecto.');
    expect(commands).toContain('/auditar tareas abiertas');
    expect(commands).not.toContain('hola equipo');
    expect(commands.length).toBeLessThanOrEqual(4);
  });
});
