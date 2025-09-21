# Codex Orchestrator

La clase `CodexOrchestrator` consolida la recopilación de contexto del repositorio, la creación del prompt enriquecido y la ejecución frente al proveedor activo (cloud o local) para obtener un análisis estructurado.

## Inicialización

```ts
import { CodexOrchestrator, CodexEngine } from '../core/codex';
import { fetchAgentReply } from '../core/agents/providerRouter';
import { gitInvoke } from '../utils/runtimeBridge';

const orchestrator = new CodexOrchestrator({
  agent: activeAgent,              // AgentDefinition con provider/model activos
  apiKeys,                         // ApiKeySettings vigentes
  engine: new CodexEngine(),       // opcional: heurística de respaldo
  fetchReplyFn: fetchAgentReply,   // opcional: custom fetcher para modelos cloud
  gitInvoker: gitInvoke,           // opcional: puente Git (Electron/Tauri)
  jarvisInvoker: invokeChat,       // opcional: JarvisCoreContext.invokeChat para modelos locales
  retryAttempts: 3,                // opcional: reintentos al proveedor
  providerTimeoutMs: 60_000,       // opcional: timeout por intento
  onTrace: trace => console.debug(trace),
  onError: (error, stage) => console.error(stage, error),
});
```

Todos los parámetros son opcionales salvo `agent` y `apiKeys`. Si se omite `fetchReplyFn`, se usará la implementación por defecto; si el agente es local debe proporcionarse `jarvisInvoker`.

## Uso básico

```ts
const result = await orchestrator.analyze(request, {
  projectInstructions: project.instructions,
  focusPaths: ['src/core/example.ts'],
  additionalContext: 'Priorizar rendimiento.',
  timeoutMs: 45_000,
});

if (result.status === 'success') {
  // aplicar patches, commits y PR sugeridos
}
```

El resultado `CodexAnalysisResult` devuelve el prompt final, plan enriquecido, parches, commits, resumen de PR y el snapshot de repositorio reutilizando la estructura de planes y salvaguardas existente.
