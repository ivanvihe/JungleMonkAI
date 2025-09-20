export interface ChatProviderRequest {
  apiKey: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.7;

const resolveMessage = (value: unknown): string => {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map(entry => {
        if (!entry) {
          return '';
        }
        if (typeof entry === 'string') {
          return entry;
        }
        if (typeof entry === 'object' && 'text' in entry) {
          const text = (entry as { text?: string }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object' && 'content' in (value as Record<string, unknown>)) {
    return resolveMessage((value as Record<string, unknown>).content);
  }
  return '';
};

const ensureContent = (raw: string, provider: string): string => {
  const content = raw.trim();
  if (!content) {
    throw new Error(`${provider} devolvió una respuesta vacía`);
  }
  return content;
};

export const callOpenAIChat = async ({
  apiKey,
  model,
  prompt,
  systemPrompt,
  maxTokens = DEFAULT_MAX_TOKENS,
  temperature = DEFAULT_TEMPERATURE,
}: ChatProviderRequest): Promise<string> => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        ...(systemPrompt
          ? [
              {
                role: 'system',
                content: systemPrompt,
              },
            ]
          : []),
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message || `OpenAI respondió con ${response.status}`);
  }

  const payload = await response.json();
  const choice = payload?.choices?.[0]?.message?.content;
  return ensureContent(resolveMessage(choice), 'OpenAI');
};

export const callGroqChat = async ({
  apiKey,
  model,
  prompt,
  systemPrompt,
  maxTokens = DEFAULT_MAX_TOKENS,
  temperature = DEFAULT_TEMPERATURE,
}: ChatProviderRequest): Promise<string> => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        ...(systemPrompt
          ? [
              {
                role: 'system',
                content: systemPrompt,
              },
            ]
          : []),
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message || `Groq respondió con ${response.status}`);
  }

  const payload = await response.json();
  const choice = payload?.choices?.[0]?.message?.content;
  return ensureContent(resolveMessage(choice), 'Groq');
};

export const callAnthropicChat = async ({
  apiKey,
  model,
  prompt,
  systemPrompt,
  maxTokens = DEFAULT_MAX_TOKENS,
  temperature = DEFAULT_TEMPERATURE,
}: ChatProviderRequest): Promise<string> => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = error?.error?.message || error?.error || error?.message;
    throw new Error(message || `Anthropic respondió con ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.content;
  return ensureContent(resolveMessage(content), 'Anthropic');
};
