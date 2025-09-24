import type { RepoWorkflowSubmission } from './bridge';

export interface RepoWorkflowQueuePayload {
  messageId: string;
  canonicalCode?: string;
  repositoryPath?: string;
  branch?: string;
  riskLevel?: RepoWorkflowSubmission['request']['context']['riskLevel'];
}

export interface RepoWorkflowSyncOptions {
  repositoryPath: string;
  remote?: string | null;
  branch?: string | null;
}

type QueueHandler = (payload: RepoWorkflowQueuePayload) => void;
type SyncHandler = (options: RepoWorkflowSyncOptions) => Promise<string | null>;

let queueHandler: QueueHandler | null = null;
let syncHandler: SyncHandler | null = null;

export const registerRepoWorkflowHandlers = (handlers: {
  queueRequest: QueueHandler;
  syncRepository: SyncHandler;
}): void => {
  queueHandler = handlers.queueRequest;
  syncHandler = handlers.syncRepository;
};

export const unregisterRepoWorkflowHandlers = (handlers: {
  queueRequest: QueueHandler;
  syncRepository: SyncHandler;
}): void => {
  if (queueHandler === handlers.queueRequest) {
    queueHandler = null;
  }
  if (syncHandler === handlers.syncRepository) {
    syncHandler = null;
  }
};

export const enqueueRepoWorkflowRequest = (payload: RepoWorkflowQueuePayload): void => {
  if (!queueHandler) {
    console.warn('No hay proveedor activo de Repo Studio para procesar la solicitud.');
    return;
  }
  queueHandler(payload);
};

export const syncRepositoryViaWorkflow = async (
  options: RepoWorkflowSyncOptions,
): Promise<string | null> => {
  if (!syncHandler) {
    console.warn('No hay proveedor activo de Repo Studio para sincronizar el repositorio.');
    return null;
  }
  return syncHandler(options);
};
