import { useCallback, useMemo, useRef, useState } from 'react';
import { useAgents } from '../core/agents/AgentContext';
import { useJarvisCore } from '../core/jarvis/JarvisCoreContext';
import {
  callAnthropicChat,
  callGroqChat,
  callOpenAIChat,
  type ProviderContent,
} from '../utils/aiProviders';
import type { JarvisChatResult } from '../services/jarvisCoreClient';

type CloudAutocompleteProvider = 'openai' | 'anthropic' | 'groq';

export type CodeAutocompleteProvider = CloudAutocompleteProvider | 'jarvis';

export interface CanvasFileReference {
  id: string;
  name: string;
  language: string;
  content: string;
}

export interface AutocompleteCursorPosition {
  lineNumber: number;
  column: number;
}

export interface AutocompleteRequest {
  file: CanvasFileReference;
  cursor?: AutocompleteCursorPosition;
  files?: CanvasFileReference[];
}

export interface AutocompleteSuggestion {
  id: string;
  text: string;
  provider: CodeAutocompleteProvider;
  model?: string;
  reason?: string;
}

export interface UseCodeAutocompleteOptions {
  provider: CodeAutocompleteProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface UseCodeAutocompleteValue {
  isLoading: boolean;
  error: string | null;
  suggestions: AutocompleteSuggestion[];
  providerReady: boolean;
  requestAutocomplete: (request: AutocompleteRequest) => Promise<AutocompleteSuggestion[]>;
  cancel: () => void;
}

const SYSTEM_PROMPT =
  'Eres un asistente de autocompletado. Devuelve código válido y conciso para continuar el fragmento indicado.';

const sanitizeContent = (content: ProviderContent): string => {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map(part => {
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
        return part.alt ?? '';
      }
      if (part.type === 'audio') {
        return part.transcript ?? '';
      }
      if (part.type === 'file') {
        return part.name ?? '';
      }
      return '';
    })
    .join('\n');
};

const buildContextPrompt = (
  { file, cursor, files }: AutocompleteRequest,
  provider: CodeAutocompleteProvider,
): string => {
  const cursorLabel = cursor
    ? `La solicitud se realiza en la línea ${cursor.lineNumber}, columna ${cursor.column}.`
    : 'La solicitud se realiza al final del archivo.';

  const header = [`Archivo activo: ${file.name} (${file.language}).`, cursorLabel].join(' ');

  const otherFiles = files
    ?.filter(entry => entry.id !== file.id && entry.content.trim())
    .map(entry => `Archivo ${entry.name} (${entry.language}):\n${entry.content}`);

  const contextSections = [header, 'Contenido actual:\n```\n' + file.content + '\n```'];

  if (otherFiles?.length) {
    contextSections.push(`Contexto adicional:\n${otherFiles.join('\n\n')}`);
  }

  if (provider !== 'jarvis') {
    contextSections.push('Responde únicamente con la continuación sugerida del código.');
  }

  return contextSections.join('\n\n');
};

const buildSuggestion = (
  provider: CodeAutocompleteProvider,
  model: string | undefined,
  text: string,
): AutocompleteSuggestion => ({
  id: `${provider}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  text: text.trim(),
  provider,
  model,
});

const extractJarvisMessage = async (payload: JarvisChatResult): Promise<string> => {
  if (!payload) {
    return '';
  }

  if (typeof (payload as { message?: string }).message === 'string') {
    return (payload as { message: string }).message;
  }

  if (typeof payload === 'object' && payload !== null && Symbol.asyncIterator in payload) {
    let buffer = '';
    for await (const event of payload as AsyncIterable<Record<string, unknown>>) {
      if (!event || typeof event !== 'object') {
        continue;
      }
      if (typeof (event as { message?: string }).message === 'string') {
        buffer += (event as { message: string }).message;
      } else if (typeof (event as { delta?: string }).delta === 'string') {
        buffer += (event as { delta: string }).delta;
      }
    }
    return buffer;
  }

  return '';
};

export const useCodeAutocomplete = (options: UseCodeAutocompleteOptions): UseCodeAutocompleteValue => {
  const { agents } = useAgents();
  const { invokeChat } = useJarvisCore();
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const runIdRef = useRef(0);

  const normalizedProvider = options.provider;

  const providerAgent = useMemo(() => {
    if (normalizedProvider === 'jarvis') {
      return null;
    }

    const normalized = normalizedProvider.toLowerCase();
    const selectedModel = options.model?.trim().toLowerCase();

    return (
      agents
        .filter(agent => agent.kind === 'cloud' && agent.apiKey && agent.provider.toLowerCase() === normalized)
        .find(agent => (selectedModel ? agent.model.toLowerCase() === selectedModel : true)) ??
      agents
        .filter(agent => agent.kind === 'cloud' && agent.apiKey && agent.provider.toLowerCase() === normalized)
        .find(() => true) ??
      null
    );
  }, [agents, normalizedProvider, options.model]);

  const providerReady = useMemo(() => {
    if (normalizedProvider === 'jarvis') {
      return true;
    }
    return Boolean(providerAgent?.apiKey);
  }, [normalizedProvider, providerAgent]);

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    setLoading(false);
  }, []);

  const requestAutocomplete = useCallback<UseCodeAutocompleteValue['requestAutocomplete']>(
    async request => {
      const currentRun = runIdRef.current + 1;
      runIdRef.current = currentRun;

      if (!request?.file) {
        setError('No se proporcionó un archivo para autocompletar.');
        setSuggestions([]);
        return [];
      }

      if (normalizedProvider !== 'jarvis' && !providerAgent?.apiKey) {
        setError('No hay credenciales disponibles para el proveedor seleccionado.');
        setSuggestions([]);
        return [];
      }

      setLoading(true);
      setError(null);

      const prompt = buildContextPrompt(request, normalizedProvider);
      const activeModel = options.model ?? providerAgent?.model;

      try {
        let completion = '';

        if (normalizedProvider === 'openai') {
          const response = await callOpenAIChat({
            apiKey: providerAgent?.apiKey ?? '',
            model: activeModel ?? 'gpt-4o-mini',
            prompt,
            systemPrompt: SYSTEM_PROMPT,
            maxTokens: options.maxTokens,
            temperature: options.temperature,
          });
          completion = sanitizeContent(response.content);
        } else if (normalizedProvider === 'anthropic') {
          const response = await callAnthropicChat({
            apiKey: providerAgent?.apiKey ?? '',
            model: activeModel ?? 'claude-3-5-sonnet-20241022',
            prompt,
            systemPrompt: SYSTEM_PROMPT,
            maxTokens: options.maxTokens,
            temperature: options.temperature,
          });
          completion = sanitizeContent(response.content);
        } else if (normalizedProvider === 'groq') {
          const response = await callGroqChat({
            apiKey: providerAgent?.apiKey ?? '',
            model: activeModel ?? providerAgent?.model ?? 'llama-3.2-90b-text',
            prompt,
            systemPrompt: SYSTEM_PROMPT,
            maxTokens: options.maxTokens,
            temperature: options.temperature,
          });
          completion = sanitizeContent(response.content);
        } else {
          const result = await invokeChat({
            prompt,
            systemPrompt: SYSTEM_PROMPT,
          });
          completion = await extractJarvisMessage(result);
        }

        if (runIdRef.current !== currentRun) {
          return [];
        }

        const cleaned = completion.trim();
        if (!cleaned) {
          setSuggestions([]);
          return [];
        }

        const suggestion = buildSuggestion(normalizedProvider, activeModel, cleaned);
        setSuggestions([suggestion]);
        return [suggestion];
      } catch (caughtError) {
        if (runIdRef.current !== currentRun) {
          return [];
        }
        const message = caughtError instanceof Error ? caughtError.message : String(caughtError ?? '');
        setError(message);
        setSuggestions([]);
        return [];
      } finally {
        if (runIdRef.current === currentRun) {
          setLoading(false);
        }
      }
    },
    [invokeChat, normalizedProvider, options.maxTokens, options.model, options.temperature, providerAgent],
  );

  return {
    isLoading,
    error,
    suggestions,
    providerReady,
    requestAutocomplete,
    cancel,
  };
};

export default useCodeAutocomplete;
