import { ApiKeySettings } from '../../types/globalSettings';
import {
  ChatProviderResponse,
  callAnthropicChat,
  callGroqChat,
  callOpenAIChat,
} from '../../utils/aiProviders';
import { isSupportedProvider } from '../../utils/globalSettings';
import { ChatContentPart, ChatMessage, ChatSuggestedAction } from '../messages/messageTypes';
import type { CoordinationStrategyId, MultiAgentContext } from '../orchestration';
import { AgentDefinition } from './agentRegistry';
import { getAgentDisplayName } from '../../utils/agentDisplay';
import type {
  JarvisChatRequest,
  JarvisChatResult,
  JarvisCoreClient,
} from '../../services/jarvisCoreClient';
import { JarvisCoreError } from '../../services/jarvisCoreClient';

export const AGENT_SYSTEM_PROMPT =
  'Actúas como parte de un colectivo de agentes creativos. Responde de forma concisa, en español cuando sea posible, y especifica los supuestos importantes que utilices al contestar.';

const extractProjectInstructions = (project: MultiAgentContext['project'] | undefined): string[] => {
  if (!project?.instructions) {
    return [];
  }

  return project.instructions
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
};

const buildSystemPrompt = (context: MultiAgentContext | undefined): string => {
  if (!context) {
    return AGENT_SYSTEM_PROMPT;
  }

  const extras: string[] = [];

  if (context.role?.role) {
    extras.push(`Asumes el rol de ${context.role.role}.`);
  }

  if (context.role?.objective) {
    extras.push(`Objetivo actual: ${context.role.objective}.`);
  }

  if (context.strategyId) {
    extras.push(`La estrategia coordinada en vigor es «${context.strategyId}».`);
  }

  if (context.project) {
    const repoLabel = context.project.defaultBranch
      ? `${context.project.repositoryPath}@${context.project.defaultBranch}`
      : context.project.repositoryPath;
    extras.push(`Proyecto activo: ${context.project.name} (${repoLabel}).`);

    if (context.project.preferredProvider || context.project.preferredModel) {
      const preference = [context.project.preferredProvider, context.project.preferredModel]
        .filter(Boolean)
        .join(' · ');
      if (preference) {
        extras.push(`Preferencia de agente: ${preference}.`);
      }
    }

    const projectInstructions = extractProjectInstructions(context.project);
    if (projectInstructions.length) {
      extras.push(`Guías del proyecto:\n- ${projectInstructions.join('\n- ')}`);
    }
  }

  if (!extras.length) {
    return AGENT_SYSTEM_PROMPT;
  }

  return [AGENT_SYSTEM_PROMPT, ...extras].join('\n\n');
};

const buildPromptWithContext = (
  agent: AgentDefinition,
  prompt: string,
  context: MultiAgentContext | undefined,
): { prompt: string; systemPrompt: string } => {
  const sanitizedPrompt = prompt.trim();
  if (!context) {
    return { prompt: sanitizedPrompt, systemPrompt: AGENT_SYSTEM_PROMPT };
  }

  const sections: string[] = [];

  if (context.snapshot.sharedSummary) {
    sections.push(`Resumen colectivo compartido:\n${context.snapshot.sharedSummary}`);
  }

  const otherSummaries = Object.entries(context.snapshot.agentSummaries)
    .filter(([agentId]) => agentId !== agent.id)
    .map(([, summary]) => summary)
    .filter(Boolean);

  if (otherSummaries.length) {
    sections.push(`Aportes previos de otros agentes:\n- ${otherSummaries.slice(-3).join('\n- ')}`);
  }

  if (context.snapshot.lastConclusions.length) {
    const latest = context.snapshot.lastConclusions
      .slice(-3)
      .map(entry => `${entry.author === 'system' ? 'Coordinador' : `Agente ${entry.agentId ?? 'desconocido'}`}: ${entry.content}`)
      .join('\n');
    sections.push(`Conclusiones recientes:\n${latest}`);
  }

  if (context.project) {
    const repoLabel = context.project.defaultBranch
      ? `${context.project.repositoryPath}@${context.project.defaultBranch}`
      : context.project.repositoryPath;
    const lines: string[] = [`Repositorio activo: ${repoLabel}`];

    if (context.project.preferredProvider || context.project.preferredModel) {
      const preference = [context.project.preferredProvider, context.project.preferredModel]
        .filter(Boolean)
        .join(' · ');
      if (preference) {
        lines.push(`Preferencia de ejecución: ${preference}`);
      }
    }

    const projectInstructions = extractProjectInstructions(context.project);
    if (projectInstructions.length) {
      lines.push(`Instrucciones del proyecto:\n- ${projectInstructions.join('\n- ')}`);
    }

    sections.push(`Contexto del proyecto ${context.project.name}:\n${lines.join('\n')}`);
  }

  if (context.instructions?.length) {
    sections.push(`Instrucciones del coordinador:\n- ${context.instructions.join('\n- ')}`);
  }

  if (context.bridgeMessages?.length) {
    const bridgeSummary = context.bridgeMessages
      .slice(-3)
      .map(message => `${message.author === 'system' ? 'Sistema' : `Agente ${message.agentId ?? 'desconocido'}`}: ${message.content}`)
      .join('\n');
    sections.push(`Mensajes internos relevantes:\n${bridgeSummary}`);
  }

  sections.push(`Solicitud del usuario:\n${sanitizedPrompt}`);

  return {
    prompt: sections.join('\n\n'),
    systemPrompt: buildSystemPrompt(context),
  };
};

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> => {
  return Boolean(value) && typeof value === 'object' && Symbol.asyncIterator in (value as object);
};

const buildJarvisActionLabel = (action: ChatSuggestedAction): string => {
  const { kind, payload } = action;
  if (kind === 'open') {
    const target = typeof payload.path === 'string' ? payload.path : 'recurso';
    return `Abrir ${target}`;
  }
  if (kind === 'read') {
    const target = typeof payload.path === 'string' ? payload.path : 'archivo';
    return `Leer ${target}`;
  }
  if (kind === 'run') {
    const command = Array.isArray(payload.command)
      ? (payload.command as unknown[]).filter(entry => typeof entry === 'string').join(' ')
      : typeof payload.command === 'string'
        ? payload.command
        : 'comando';
    return `Ejecutar ${command}`;
  }
  return action.label ?? 'Acción sugerida';
};

const appendErrorDetails = (message: string, detail: string | undefined): string => {
  const normalized = detail?.trim();
  if (!normalized) {
    return message;
  }
  const joiner = /[.!?]$/.test(message) ? ' Detalles: ' : '. Detalles: ';
  return `${message}${joiner}${normalized}`;
};

const buildJarvisCoreErrorMessage = (error: unknown): string | undefined => {
  if (!(error instanceof JarvisCoreError)) {
    return undefined;
  }

  const detail = error.message?.trim();
  const enrich = (base: string): string => appendErrorDetails(base, detail);

  switch (error.status) {
    case 401:
    case 403:
      return enrich(
        `Jarvis Core rechazó la solicitud (${error.status}). Revisa el token configurado en los ajustes de Jarvis Core y vuelve a intentarlo.`,
      );
    case 404:
      return enrich(
        'Jarvis Core no encontró un modelo activo (404). Activa un modelo local desde la sección de modelos y vuelve a intentarlo.',
      );
    case 409:
      return enrich(
        'Jarvis Core está finalizando otra operación (409). Espera a que termine la descarga o activación del modelo antes de reintentar.',
      );
    case 503:
      return enrich(
        'Jarvis Core no tiene recursos disponibles (503). Comprueba que el servicio esté en ejecución o reinícialo.',
      );
    case 500:
      return enrich(
        'Jarvis Core devolvió un error interno (500). Revisa los logs del servicio para obtener más información.',
      );
    default:
      return enrich(`Jarvis Core devolvió un error (${error.status || 'desconocido'}).`);
  }
};

const normalizeJarvisActions = (payload: unknown): ChatSuggestedAction[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  const normalized: ChatSuggestedAction[] = [];
  payload.forEach(entry => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const kind = (entry as { type?: unknown }).type;
    const rawPayload = (entry as { payload?: unknown }).payload;

    if (typeof kind !== 'string' || !rawPayload || typeof rawPayload !== 'object') {
      return;
    }

    const suggestion: ChatSuggestedAction = {
      kind,
      payload: rawPayload as Record<string, unknown>,
    };

    if (typeof (entry as { label?: unknown }).label === 'string') {
      suggestion.label = (entry as { label: string }).label;
    }

    if (typeof (entry as { description?: unknown }).description === 'string') {
      suggestion.description = (entry as { description: string }).description;
    }

    normalized.push({ ...suggestion, label: suggestion.label ?? buildJarvisActionLabel(suggestion) });
  });

  return normalized;
};

export interface FetchAgentReplyOptions {
  agent: AgentDefinition;
  prompt: string;
  apiKeys: ApiKeySettings;
  fallback: (agent: AgentDefinition, prompt?: string, context?: MultiAgentContext) => string;
  context?: MultiAgentContext;
  onTrace?: (trace: AgentExchangeTrace) => void;
  jarvisClient?: Pick<JarvisCoreClient, 'sendChat'> | null;
  onStreamUpdate?: (event: AgentStreamingEvent) => void;
}

export interface AgentExchangeTrace {
  agentId: string;
  agentName: string;
  type: 'request' | 'response' | 'fallback';
  payload: string;
  timestamp: string;
  strategyId?: CoordinationStrategyId;
}

export interface AgentReplyOutcome {
  response: ChatProviderResponse;
  status: 'success' | 'fallback';
  errorMessage?: string;
}

export type AgentStreamingEvent =
  | { type: 'delta'; content: string; delta: string }
  | { type: 'result'; content: string; actions?: ChatSuggestedAction[] }
  | { type: 'error'; error: string };

export const fetchAgentReply = async ({
  agent,
  prompt,
  apiKeys,
  fallback,
  context,
  onTrace,
  jarvisClient,
  onStreamUpdate,
}: FetchAgentReplyOptions): Promise<AgentReplyOutcome> => {
  const displayName = getAgentDisplayName(agent);
  const providerKey = agent.provider.toLowerCase();
  const emitFallbackResponse = (content: string, errorMessage?: string): AgentReplyOutcome => {
    const normalizedMessage = errorMessage?.trim();
    const timestamp = new Date().toISOString();
    const tracePayload = normalizedMessage ? `Error: ${normalizedMessage}\n\n${content}` : content;
    onTrace?.({
      agentId: agent.id,
      agentName: displayName,
      type: 'fallback',
      payload: tracePayload,
      timestamp,
      strategyId: context?.strategyId,
    });
    return {
      response: {
        content,
        modalities: ['text'],
      },
      status: 'fallback',
      errorMessage: normalizedMessage,
    };
  };

  if (agent.kind === 'local') {
    const sanitizedPrompt = prompt.trim();
    if (!sanitizedPrompt) {
      return emitFallbackResponse('Necesito un prompt válido para generar una respuesta.');
    }

    if (!jarvisClient) {
      const fallbackContent = fallback(agent, prompt, context);
      return emitFallbackResponse(fallbackContent, 'Jarvis Core no está disponible.');
    }

    const { prompt: decoratedPrompt, systemPrompt } = buildPromptWithContext(
      agent,
      sanitizedPrompt,
      context,
    );

    onTrace?.({
      agentId: agent.id,
      agentName: displayName,
      type: 'request',
      payload: decoratedPrompt,
      timestamp: new Date().toISOString(),
      strategyId: context?.strategyId,
    });

    try {
      const payload: JarvisChatRequest = {
        prompt: decoratedPrompt,
        systemPrompt,
        stream: Boolean(onStreamUpdate),
      };
      const result: JarvisChatResult = await jarvisClient.sendChat(payload);

      const finalize = (
        content: string,
        actions: ChatSuggestedAction[] | undefined,
      ): AgentReplyOutcome => {
        const normalized = content.trim() ? content : `${displayName} no devolvió contenido.`;
        onTrace?.({
          agentId: agent.id,
          agentName: displayName,
          type: 'response',
          payload: normalized,
          timestamp: new Date().toISOString(),
          strategyId: context?.strategyId,
        });
        return {
          response: {
            content: normalized,
            modalities: ['text'],
            actions,
          },
          status: 'success',
        };
      };

      if (isAsyncIterable(result)) {
        let aggregated = '';
        let finalMessage = '';
        let finalActions: ChatSuggestedAction[] | undefined;

        for await (const rawEvent of result) {
          if (!rawEvent || typeof rawEvent !== 'object') {
            continue;
          }

          const eventType = (rawEvent as { type?: unknown }).type;

          if (eventType === 'chunk') {
            const delta = typeof (rawEvent as { delta?: unknown }).delta === 'string'
              ? (rawEvent as { delta: string }).delta
              : '';
            if (delta) {
              aggregated += delta;
              onStreamUpdate?.({ type: 'delta', delta, content: aggregated });
            }
            continue;
          }

          if (eventType === 'result') {
            const message = typeof (rawEvent as { message?: unknown }).message === 'string'
              ? (rawEvent as { message: string }).message
              : '';
            finalMessage = message || aggregated;
            finalActions = normalizeJarvisActions((rawEvent as { actions?: unknown }).actions);
            aggregated = finalMessage;
            onStreamUpdate?.({ type: 'result', content: aggregated, actions: finalActions });
            continue;
          }

          if (eventType === 'error') {
            const errorMessage = typeof (rawEvent as { message?: unknown }).message === 'string'
              ? (rawEvent as { message: string }).message
              : 'Jarvis Core emitió un error.';
            onStreamUpdate?.({ type: 'error', error: errorMessage });
            throw new Error(errorMessage);
          }
        }

        return finalize(aggregated || finalMessage, finalActions?.length ? finalActions : undefined);
      }

      const message = typeof (result as { message?: unknown }).message === 'string'
        ? (result as { message: string }).message
        : '';
      const actions = normalizeJarvisActions((result as { actions?: unknown }).actions);
      return finalize(message, actions.length ? actions : undefined);
    } catch (error) {
      const fallbackContent = fallback(agent, prompt, context);
      const enrichedMessage = buildJarvisCoreErrorMessage(error);
      const rawMessage =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      const fallbackErrorMessage = enrichedMessage ?? (rawMessage || 'Jarvis Core no respondió.');
      return emitFallbackResponse(fallbackContent, fallbackErrorMessage);
    }
  }

  if (agent.kind !== 'cloud' || !isSupportedProvider(providerKey)) {
    const fallbackContent = fallback(agent, prompt, context);
    return emitFallbackResponse(fallbackContent);
  }

  const apiKey = apiKeys[providerKey];
  if (!apiKey) {
    const payload = `${displayName} no tiene una API key configurada. Abre los ajustes globales para habilitar sus respuestas.`;
    return emitFallbackResponse(payload);
  }

  const sanitizedPrompt = prompt.trim();
  if (!sanitizedPrompt) {
    return emitFallbackResponse('Necesito un prompt válido para generar una respuesta.');
  }

  const { prompt: decoratedPrompt, systemPrompt } = buildPromptWithContext(agent, sanitizedPrompt, context);
  onTrace?.({
    agentId: agent.id,
    agentName: displayName,
    type: 'request',
    payload: decoratedPrompt,
    timestamp: new Date().toISOString(),
    strategyId: context?.strategyId,
  });

  const runAndTrace = async (
    executor: () => Promise<ChatProviderResponse>,
  ): Promise<AgentReplyOutcome> => {
    try {
      const response = await executor();
      onTrace?.({
        agentId: agent.id,
        agentName: displayName,
        type: 'response',
        payload: contentToPlainText(response.content),
        timestamp: new Date().toISOString(),
        strategyId: context?.strategyId,
      });
      return {
        response,
        status: 'success',
      };
    } catch (error) {
      const fallbackContent = fallback(agent, prompt, context);
      const enrichedMessage = buildJarvisCoreErrorMessage(error);
      const rawMessage =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      const fallbackErrorMessage =
        enrichedMessage ?? (rawMessage || 'No se pudo completar la solicitud al proveedor.');
      return emitFallbackResponse(fallbackContent, fallbackErrorMessage);
    }
  };

  if (providerKey === 'openai') {
    return runAndTrace(() =>
      callOpenAIChat({
        apiKey,
        model: agent.model,
        prompt: decoratedPrompt,
        systemPrompt,
      }),
    );
  }

  if (providerKey === 'anthropic') {
    return runAndTrace(() =>
      callAnthropicChat({
        apiKey,
        model: agent.model,
        prompt: decoratedPrompt,
        systemPrompt,
      }),
    );
  }

  if (providerKey === 'groq') {
    return runAndTrace(() =>
      callGroqChat({
        apiKey,
        model: agent.model,
        prompt: decoratedPrompt,
        systemPrompt,
      }),
    );
  }

  const fallbackContent = fallback(agent, prompt, context);
  return emitFallbackResponse(fallbackContent);
};

const contentToPlainText = (content: ChatMessage['content']): string => {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map((part: ChatContentPart | string) => {
      if (!part) {
        return '';
      }
      if (typeof part === 'string') {
        return part;
      }
      if (part.type === 'text') {
        return part.text;
      }
      if (part.type === 'image') {
        return part.alt ?? '[imagen]';
      }
      if (part.type === 'audio') {
        return part.transcript ?? '[audio]';
      }
      if (part.type === 'file') {
        return part.name ?? '[archivo]';
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
};

export interface CorrectionRouteOptions {
  correctionId: string;
  originalMessage: ChatMessage;
  correctedText: string;
  notes?: string;
  tags?: string[];
  agent: AgentDefinition;
  reviewer?: AgentDefinition | null;
}

export interface CorrectionRouteResult {
  prompt: string;
  targetAgent: AgentDefinition;
}

export const buildCorrectionPipeline = ({
  correctionId,
  originalMessage,
  correctedText,
  notes,
  tags,
  agent,
  reviewer,
}: CorrectionRouteOptions): CorrectionRouteResult => {
  const targetAgent = reviewer ?? agent;

  const originalText = contentToPlainText(originalMessage.content);
  const contextHeader = `Corrección registrada (${correctionId}).`;
  const tagLine = tags?.length ? `Etiquetas asociadas: ${tags.join(', ')}.` : 'Sin etiquetas registradas.';
  const notesLine = notes?.trim().length ? `Notas del operador: ${notes.trim()}` : 'No se añadieron notas adicionales.';

  const promptSections = [
    contextHeader,
    `Mensaje original del agente ${getAgentDisplayName(agent)}:\n${originalText || '[vacío]'}`,
    `Propuesta corregida por el operador:\n${correctedText.trim() || '[sin contenido]'}`,
    notesLine,
    tagLine,
    'Revisa la corrección, valida los cambios y entrega una respuesta definitiva que incorpore los ajustes necesarios. '
      + 'Si la corrección es inválida, justifícalo y propone una alternativa correcta.',
  ];

  return {
    prompt: promptSections.join('\n\n'),
    targetAgent,
  };
};
