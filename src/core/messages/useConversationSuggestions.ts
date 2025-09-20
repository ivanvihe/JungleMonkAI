import { useCallback, useMemo } from 'react';
import { useAgents } from '../agents/AgentContext';
import { getAgentDisplayName } from '../../utils/agentDisplay';
import { useMessages } from './MessageContext';
import type { ChatMessage } from './messageTypes';

export interface ConversationSuggestionDescriptor {
  id: string;
  label: string;
  text: string;
  icon?: string;
  badge?: string;
  title?: string;
}

interface DynamicSuggestionInput {
  pendingResponses: number;
  agentResponses: ChatMessage[];
  lastUserMessage?: ChatMessage;
  resolveAgentName: (agentId?: string) => string | undefined;
  toPlainText: (content: ChatMessage['content']) => string;
}

const truncate = (value: string, length: number): string => {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, Math.max(0, length - 1))}…`;
};

const isCommandLike = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith('/')) {
    return true;
  }
  return /^[\p{L}\p{N}_-]+[:,]/u.test(trimmed);
};

export const buildDynamicSuggestions = ({
  pendingResponses,
  agentResponses,
  lastUserMessage,
  resolveAgentName,
  toPlainText,
}: DynamicSuggestionInput): ConversationSuggestionDescriptor[] => {
  const suggestions: ConversationSuggestionDescriptor[] = [];

  if (pendingResponses > 0) {
    const label =
      pendingResponses === 1 ? '1 respuesta pendiente' : `${pendingResponses} respuestas pendientes`;
    const text =
      pendingResponses === 1
        ? '¿Puedes finalizar la respuesta pendiente?'
        : 'Equipo, ¿podéis completar las respuestas pendientes?';

    suggestions.push({
      id: 'pending-responses',
      label,
      text,
      icon: '⏳',
      badge: 'Estado',
      title: 'Hay agentes que todavía están preparando su respuesta.',
    });
  }

  const latestAgentMessage = [...agentResponses]
    .reverse()
    .find(message => (message.status ?? 'sent') !== 'pending');

  if (latestAgentMessage) {
    const agentName = resolveAgentName(latestAgentMessage.agentId) ?? 'el último agente';
    const snippet = toPlainText(latestAgentMessage.content).trim();

    suggestions.push({
      id: `followup-${latestAgentMessage.id}`,
      label: `Seguimiento con ${agentName}`,
      text: `${agentName}, ¿podrías profundizar en tu último mensaje?`,
      icon: '🤖',
      badge: 'Seguimiento',
      title: snippet ? `Último mensaje: ${truncate(snippet, 120)}` : undefined,
    });
  }

  if (lastUserMessage) {
    const lastUserText = toPlainText(lastUserMessage.content).trim();
    if (lastUserText) {
      suggestions.push({
        id: `reuse-${lastUserMessage.id}`,
        label: 'Reutilizar mi último mensaje',
        text: lastUserText,
        icon: '📝',
        badge: 'Historial',
        title: truncate(lastUserText, 120),
      });
    }
  }

  return suggestions;
};

export const buildRecentCommands = (
  messages: ChatMessage[],
  toPlainText: (content: ChatMessage['content']) => string,
  limit = 4,
): string[] => {
  const commands: string[] = [];
  const seen = new Set<string>();

  for (const message of [...messages].reverse()) {
    if (message.author !== 'user') {
      continue;
    }
    const text = toPlainText(message.content).trim();
    if (!text || !isCommandLike(text)) {
      continue;
    }
    const normalized = text.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    commands.push(text);
    if (commands.length >= limit) {
      break;
    }
  }

  return commands;
};

export const useConversationSuggestions = () => {
  const { messages, pendingResponses, agentResponses, lastUserMessage, toPlainText } = useMessages();
  const { agentMap } = useAgents();

  const resolveAgentName = useCallback(
    (agentId?: string) => {
      if (!agentId) {
        return undefined;
      }
      const agent = agentMap.get(agentId);
      return agent ? getAgentDisplayName(agent) : undefined;
    },
    [agentMap],
  );

  const dynamicSuggestions = useMemo(
    () =>
      buildDynamicSuggestions({
        pendingResponses,
        agentResponses,
        lastUserMessage,
        resolveAgentName,
        toPlainText,
      }),
    [agentResponses, lastUserMessage, pendingResponses, resolveAgentName, toPlainText],
  );

  const recentCommands = useMemo(
    () => buildRecentCommands(messages, toPlainText),
    [messages, toPlainText],
  );

  return { dynamicSuggestions, recentCommands } as const;
};

export default useConversationSuggestions;
