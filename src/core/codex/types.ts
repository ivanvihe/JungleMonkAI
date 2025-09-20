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
