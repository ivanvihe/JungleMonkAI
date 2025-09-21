export type CodexActionType =
  | 'inspect'
  | 'modify'
  | 'create'
  | 'delete'
  | 'commit'
  | 'run-command'
  | 'push'
  | 'pr';

export interface CodexPlanStep {
  id: string;
  action: CodexActionType;
  description: string;
  targetPath?: string;
  requiresApproval?: boolean;
  approved?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CodexSafeguards {
  dryRun: boolean;
  manualApproval: boolean;
  notes: string[];
}

export interface CodexPlan {
  id: string;
  summary: string;
  intent: string;
  steps: CodexPlanStep[];
  safeguards: CodexSafeguards;
  createdAt: string;
}

export interface CodexRequestContext {
  repositoryPath: string;
  branch?: string;
  actor?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface CodexRequest {
  prompt: string;
  context: CodexRequestContext;
  preferDryRun?: boolean;
  requireApproval?: boolean;
}

export interface CodexReview {
  approved: boolean;
  reviewer: string;
  notes?: string;
  reviewedAt: string;
}

export interface CodexPlanExecution {
  plan: CodexPlan;
  approvals: CodexReview[];
  readyToExecute: boolean;
}

export interface CodexProviderMetadata {
  providerId: string;
  modelId?: string;
  latencyMs?: number;
  attempt?: number;
  cost?: number;
  timestamp?: string;
  details?: Record<string, unknown>;
}

export interface CodexPlanStepWithProvider extends CodexPlanStep {
  rationale?: string;
  notes?: string[];
  confidence?: number;
  diffExcerpt?: string;
  providerMetadata?: CodexProviderMetadata;
}

export interface CodexPlanWithAnalysis extends Omit<CodexPlan, 'steps'> {
  steps: CodexPlanStepWithProvider[];
}

export interface CodexSuggestedPatch {
  path: string;
  diff: string;
  summary?: string;
  confidence?: number;
  appliesCleanly?: boolean;
  providerMetadata?: CodexProviderMetadata;
  metadata?: Record<string, unknown>;
}

export interface CodexCommitSuggestion {
  message: string;
  description?: string;
  scope?: string;
  breakingChange?: boolean;
  files?: string[];
  providerMetadata?: CodexProviderMetadata;
  metadata?: Record<string, unknown>;
}

export interface CodexPullRequestSummary {
  title: string;
  summary?: string;
  body?: string;
  highlights?: string[];
  providerMetadata?: CodexProviderMetadata;
  metadata?: Record<string, unknown>;
}

export interface CodexRepositoryStatusEntry {
  path: string;
  index?: string | null;
  workdir?: string | null;
  isConflicted?: boolean;
}

export interface CodexRepositorySummary {
  branch?: string | null;
  lastCommit?: {
    id: string;
    message?: string | null;
    author?: string | null;
    time?: number | null;
  } | null;
  remote?: {
    name: string;
    url?: string | null;
    branch?: string | null;
  } | null;
}

export interface CodexRepositoryDiff {
  path: string;
  diff: string;
  truncated?: boolean;
}

export interface CodexRepositorySnapshot {
  summary?: CodexRepositorySummary;
  status: CodexRepositoryStatusEntry[];
  diffs: CodexRepositoryDiff[];
}

export type CodexOrchestratorTraceLevel = 'info' | 'warning' | 'error';

export interface CodexOrchestratorTrace {
  level: CodexOrchestratorTraceLevel;
  stage: string;
  message: string;
  timestamp: string;
  payload?: unknown;
}

export interface CodexAnalysisArtifacts {
  finalPrompt: string;
  plan: CodexPlanWithAnalysis;
  patches: CodexSuggestedPatch[];
  commits: CodexCommitSuggestion[];
  pullRequest?: CodexPullRequestSummary;
  providerMetadata?: CodexProviderMetadata;
  rawResponse?: string;
}

export interface CodexAnalysisResult {
  status: 'success' | 'fallback';
  artifacts: CodexAnalysisArtifacts;
  repository: CodexRepositorySnapshot;
  errors: string[];
}
