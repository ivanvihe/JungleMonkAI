import { CodexEngine } from './CodexEngine';
import type { CodexPlan, CodexRequest, CodexRequestContext } from './types';
import type { ChatContentPart, ChatMessage } from '../messages/messageTypes';

export interface CodexBridgeOptions {
  repositoryPath?: string;
  branch?: string;
  actor?: string;
  riskLevel?: CodexRequestContext['riskLevel'];
  preferDryRun?: boolean;
  requireApproval?: boolean;
}

export interface RepoWorkflowSubmission {
  request: CodexRequest;
  plan: CodexPlan;
  analysisPrompt: string;
  canonicalCode?: string;
  originalResponse: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
  tags: string[];
}

const contentPartToText = (part: ChatContentPart | string): string => {
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
    return part.transcript ?? `[audio] ${part.url}`;
  }

  if (part.type === 'file') {
    return part.name ?? part.url ?? '[archivo]';
  }

  return '';
};

const messageContentToText = (content: ChatMessage['content']): string => {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map(part => contentPartToText(part))
    .filter(Boolean)
    .join('\n\n');
};

const normalizePrompt = (message: ChatMessage, canonicalCode?: string): { prompt: string; canonical?: string } => {
  const trimmedCanonical = canonicalCode?.trim();
  if (trimmedCanonical) {
    return { prompt: trimmedCanonical, canonical: trimmedCanonical };
  }

  const fallback = messageContentToText(message.content).trim();
  return {
    prompt: fallback,
    canonical: message.canonicalCode?.trim() || undefined,
  };
};

const deriveActor = (message: ChatMessage, override?: string): string | undefined => {
  if (override) {
    return override;
  }

  return message.agentId ?? message.originAgentId ?? message.author;
};

const buildCodexRequest = (
  prompt: string,
  options: CodexBridgeOptions | undefined,
  actor: string | undefined,
): CodexRequest => ({
  prompt,
  context: {
    repositoryPath: options?.repositoryPath ?? '.',
    branch: options?.branch,
    actor,
    riskLevel: options?.riskLevel ?? 'medium',
  },
  preferDryRun: options?.preferDryRun,
  requireApproval: options?.requireApproval,
});

const formatPlanSteps = (submission: RepoWorkflowSubmission): string => {
  if (!submission.plan.steps.length) {
    return '- Sin pasos identificados.';
  }

  return submission.plan.steps
    .map(step => {
      const target = step.targetPath ? ` (_${step.targetPath}_)` : '';
      return `- ${step.description}${target}`;
    })
    .join('\n');
};

const formatTagsSection = (tags: string[]): string => {
  if (!tags.length) {
    return '';
  }

  const formatted = tags.map(tag => `\`${tag}\``).join(' ');
  return `\n\nEtiquetas sugeridas: ${formatted}`;
};

const formatOriginalResponse = (original: string): string => {
  if (!original.trim()) {
    return '';
  }

  return [
    '\n\n<details>',
    '<summary>Respuesta original</summary>',
    '',
    '```',
    original.trim(),
    '```',
    '</details>',
  ].join('\n');
};

const buildPrBody = (submission: RepoWorkflowSubmission): string => {
  const base = [`${submission.plan.summary}`, '', '## Pasos propuestos', formatPlanSteps(submission)];
  const originalSection = formatOriginalResponse(submission.originalResponse);
  const tagsSection = formatTagsSection(submission.tags);

  return base.concat(originalSection ? [originalSection] : []).join('\n').concat(tagsSection);
};

const deriveTags = (message: ChatMessage): string[] => {
  const tags = message.feedback?.tags ?? [];
  return tags.map(tag => tag.trim()).filter(Boolean);
};

export const buildRepoWorkflowSubmission = (
  params: {
    message: ChatMessage;
    canonicalCode?: string;
    engine?: CodexEngine;
    options?: CodexBridgeOptions;
    defaultRepositoryPath?: string;
  },
): RepoWorkflowSubmission => {
  const { message, canonicalCode, engine, options, defaultRepositoryPath } = params;
  const { prompt, canonical } = normalizePrompt(message, canonicalCode);
  const sanitizedBranch = options?.branch?.trim() || undefined;
  const sanitizedActor = options?.actor?.trim() || undefined;
  const repositoryPath =
    options?.repositoryPath?.trim() || defaultRepositoryPath?.trim() || '.';
  const effectiveOptions: CodexBridgeOptions = {
    ...options,
    repositoryPath,
    branch: sanitizedBranch,
    actor: sanitizedActor,
  };
  const actor = deriveActor(message, effectiveOptions.actor);

  const request = buildCodexRequest(prompt, effectiveOptions, actor);
  const codexEngine = engine ?? new CodexEngine({ defaultDryRun: true });
  const plan = codexEngine.createPlan(request);

  const tags = deriveTags(message);
  const originalResponse = messageContentToText(message.content);
  const submission: RepoWorkflowSubmission = {
    request,
    plan,
    analysisPrompt: prompt,
    canonicalCode: canonical,
    originalResponse,
    commitMessage: `chore: ${plan.intent}`,
    prTitle: plan.intent,
    prBody: '',
    tags,
  };

  submission.prBody = buildPrBody(submission);
  return submission;
};
