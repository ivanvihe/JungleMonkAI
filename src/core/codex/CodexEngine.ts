import {
  CodexPlan,
  CodexPlanExecution,
  CodexPlanStep,
  CodexRequest,
  CodexReview,
  CodexSafeguards,
} from './types';

const generateId = (prefix: string): string => {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
};

interface CodexEngineOptions {
  defaultDryRun?: boolean;
}

const KEYWORD_ACTIONS: Array<{ keyword: RegExp; action: CodexPlanStep['action']; requiresApproval?: boolean }> = [
  { keyword: /\b(create|add|nuevo archivo)\b/i, action: 'create', requiresApproval: true },
  { keyword: /\b(modify|update|editar|cambiar)\b/i, action: 'modify' },
  { keyword: /\b(delete|remove|eliminar)\b/i, action: 'delete', requiresApproval: true },
  { keyword: /\bcommit\b/i, action: 'commit' },
  { keyword: /\bpush\b/i, action: 'push', requiresApproval: true },
  { keyword: /(?:\bpr\b|pull request|merge request)/i, action: 'pr', requiresApproval: true },
];

const extractFileHints = (prompt: string): string[] => {
  const matches = prompt.match(/`([^`]+)`/g);
  if (!matches) {
    return [];
  }

  return matches
    .map(match => match.replace(/`/g, '').trim())
    .filter(candidate => candidate.length > 0);
};

const buildSafeguards = (request: CodexRequest, options: CodexEngineOptions): CodexSafeguards => {
  const notes: string[] = [];
  const dryRun = request.preferDryRun ?? options.defaultDryRun ?? true;
  const manualApproval = request.requireApproval ?? (request.context.riskLevel !== 'low');

  if (dryRun) {
    notes.push('El plan se ejecutará inicialmente en modo dry-run.');
  }

  if (manualApproval) {
    notes.push('Se requiere aprobación manual antes de aplicar cambios persistentes.');
  }

  if (request.context.riskLevel === 'high') {
    notes.push('Solicitado nivel de riesgo ALTO: se fuerza revisión adicional.');
  }

  return {
    dryRun,
    manualApproval,
    notes,
  };
};

const describeIntent = (request: CodexRequest): string => {
  const prompt = request.prompt.trim();
  if (prompt.length <= 120) {
    return prompt;
  }
  return `${prompt.slice(0, 117)}...`;
};

const deriveActions = (prompt: string): Array<{ action: CodexPlanStep['action']; requiresApproval?: boolean }> => {
  const actions: Array<{ action: CodexPlanStep['action']; requiresApproval?: boolean }> = [];
  KEYWORD_ACTIONS.forEach(candidate => {
    if (candidate.keyword.test(prompt)) {
      actions.push({ action: candidate.action, requiresApproval: candidate.requiresApproval });
    }
  });

  if (actions.length === 0) {
    actions.push({ action: 'inspect' });
  }

  return actions;
};

const createSteps = (request: CodexRequest): CodexPlanStep[] => {
  const prompt = request.prompt;
  const actions = deriveActions(prompt);
  const fileHints = extractFileHints(prompt);

  let hintIndex = 0;
  return actions.map((action, index) => {
    const target = fileHints[hintIndex] ?? undefined;
    if (target) {
      hintIndex = Math.min(fileHints.length - 1, hintIndex + 1);
    }

    const descriptionBase = (() => {
      switch (action.action) {
        case 'inspect':
          return 'Revisar el estado actual del repositorio y los archivos relevantes.';
        case 'create':
          return 'Crear o esbozar el recurso solicitado antes de aplicarlo definitivamente.';
        case 'modify':
          return 'Preparar modificaciones propuestas y validar su impacto.';
        case 'delete':
          return 'Validar y marcar para eliminación los recursos señalados.';
        case 'commit':
          return 'Preparar commit con los cambios aprobados.';
        case 'push':
          return 'Empujar los commits preparados hacia el remoto seguro.';
        case 'pr':
          return 'Redactar Pull/Merge Request con los detalles consolidados.';
        case 'run-command':
        default:
          return 'Ejecutar comandos adicionales bajo supervisión.';
      }
    })();

    return {
      id: `${index}-${Date.now()}`,
      action: action.action,
      description: descriptionBase,
      targetPath: target,
      requiresApproval: action.requiresApproval ?? action.action !== 'inspect',
      approved: action.action === 'inspect' ? true : undefined,
      metadata: {
        hintedFromPrompt: Boolean(target),
      },
    } satisfies CodexPlanStep;
  });
};

export class CodexEngine {
  private readonly options: CodexEngineOptions;

  constructor(options: CodexEngineOptions = {}) {
    this.options = options;
  }

  createPlan(request: CodexRequest): CodexPlan {
    const safeguards = buildSafeguards(request, this.options);
    const steps = createSteps(request);

    const summary = `Plan para "${describeIntent(request)}" en ${request.context.repositoryPath}`;

    return {
      id: generateId('plan'),
      summary,
      intent: describeIntent(request),
      steps,
      safeguards,
      createdAt: new Date().toISOString(),
    };
  }

  toggleDryRun(plan: CodexPlan, dryRun: boolean): CodexPlan {
    return {
      ...plan,
      safeguards: {
        ...plan.safeguards,
        dryRun,
        notes: this.updateNotes(plan.safeguards.notes, dryRun),
      },
    };
  }

  withApproval(plan: CodexPlan, stepId: string, approved: boolean): CodexPlan {
    const steps = plan.steps.map(step =>
      step.id === stepId
        ? {
            ...step,
            approved,
          }
        : step,
    );

    return {
      ...plan,
      steps,
    };
  }

  summarizeExecution(plan: CodexPlan, approvals: CodexReview[]): CodexPlanExecution {
    const requiredApprovals = plan.steps.filter(step => step.requiresApproval);
    const approvedSteps = plan.steps.filter(step => step.requiresApproval && step.approved);
    const approvalCount = approvals.filter(review => review.approved).length;

    const readyToExecute =
      approvedSteps.length === requiredApprovals.length &&
      (!plan.safeguards.manualApproval || approvalCount > 0);

    return {
      plan,
      approvals,
      readyToExecute,
    };
  }

  private updateNotes(notes: string[], dryRun: boolean): string[] {
    const withoutDryRun = notes.filter(note => !note.toLowerCase().includes('dry-run'));
    if (dryRun) {
      return [...withoutDryRun, 'El plan se ejecutará inicialmente en modo dry-run.'];
    }
    return withoutDryRun;
  }
}
