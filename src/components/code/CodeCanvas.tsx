import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import './CodeCanvas.css';
import { useMessages } from '../../core/messages/MessageContext';
import { useRepoWorkflow } from '../../core/codex';
import { useAgents } from '../../core/agents/AgentContext';
import { useJarvisCore } from '../../core/jarvis/JarvisCoreContext';
import useCodeAutocomplete, {
  type AutocompleteSuggestion,
  type CanvasFileReference,
  type CodeAutocompleteProvider,
} from '../../hooks/useCodeAutocomplete';

interface CanvasFile extends CanvasFileReference {
  language: string;
  createdAt: string;
  updatedAt: string;
}

type CanvasProviderOption = {
  id: CodeAutocompleteProvider;
  label: string;
};

const STORAGE_KEY = 'junglemonk.code-canvas.v1';

const DEFAULT_LANGUAGES = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'json', label: 'JSON' },
  { id: 'shell', label: 'Shell' },
];

const DEFAULT_FILE_NAME = 'boceto.ts';

interface PersistedCanvasState {
  files: CanvasFile[];
  activeFileId: string | null;
}

const createCanvasFile = (name: string, language: string): CanvasFile => ({
  id: `canvas-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  name,
  language,
  content: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const mapMessagesToOptions = (messages: ReturnType<typeof useMessages>['messages'], toPlain: ReturnType<typeof useMessages>['toPlainText']) => {
  return messages
    .slice(-10)
    .reverse()
    .map(message => {
      const labelParts = [
        message.author === 'user'
          ? 'Usuario'
          : message.author === 'agent'
            ? `Agente${message.agentId ? ` ${message.agentId}` : ''}`
            : 'Sistema',
        new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ];
      const preview = message.canonicalCode?.trim() || toPlain(message.content).slice(0, 80);
      return {
        id: message.id,
        label: `${labelParts.join(' · ')} · ${preview}`,
        content: message.canonicalCode?.trim() || toPlain(message.content),
      };
    })
    .filter(option => option.content.trim());
};

const getSelectionOrFullText = (editorInstance: MonacoEditor.IStandaloneCodeEditor | null, fallback: string) => {
  if (!editorInstance) {
    return fallback;
  }
  const selection = editorInstance.getSelection();
  if (!selection || selection.isEmpty()) {
    return fallback;
  }
  const model = editorInstance.getModel();
  if (!model) {
    return fallback;
  }
  return model.getValueInRange(selection) || fallback;
};

const applySuggestionToEditor = (
  editorInstance: MonacoEditor.IStandaloneCodeEditor | null,
  monacoInstance: Monaco | null,
  suggestion: AutocompleteSuggestion,
): string | null => {
  const editorModel = editorInstance?.getModel();
  if (!editorInstance || !editorModel) {
    return suggestion.text;
  }
  const selection = editorInstance.getSelection();
  const position = editorInstance.getPosition();
  const range =
    selection && !selection.isEmpty()
      ? selection
      : monacoInstance
      ? new monacoInstance.Range(
          position?.lineNumber ?? 1,
          position?.column ?? 1,
          position?.lineNumber ?? 1,
          position?.column ?? 1,
        )
      : {
          startLineNumber: position?.lineNumber ?? 1,
          startColumn: position?.column ?? 1,
          endLineNumber: position?.lineNumber ?? 1,
          endColumn: position?.column ?? 1,
        };

  editorInstance.executeEdits('code-canvas-autocomplete', [
    {
      range,
      text: suggestion.text,
      forceMoveMarkers: true,
    },
  ]);

  editorInstance.focus();
  return editorModel.getValue();
};

const loadPersistedState = (): PersistedCanvasState | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PersistedCanvasState;
    if (!parsed || !Array.isArray(parsed.files)) {
      return null;
    }
    return {
      files: parsed.files.map(file => ({
        ...file,
        createdAt: file.createdAt ?? new Date().toISOString(),
        updatedAt: file.updatedAt ?? new Date().toISOString(),
      })),
      activeFileId: parsed.activeFileId ?? parsed.files[0]?.id ?? null,
    };
  } catch (error) {
    console.warn('No se pudo restaurar el estado del canvas de código:', error);
    return null;
  }
};

const persistState = (state: PersistedCanvasState) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('No se pudo persistir el estado del canvas de código:', error);
  }
};

export const CodeCanvas: React.FC = () => {
  const { messages, toPlainText, appendToDraft } = useMessages();
  const { queueRequest, pendingRequest } = useRepoWorkflow();
  const { agents } = useAgents();
  const { runtimeStatus } = useJarvisCore();
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const persisted = useMemo(() => loadPersistedState(), []);
  const [files, setFiles] = useState<CanvasFile[]>(() => {
    if (persisted?.files?.length) {
      return persisted.files;
    }
    return [createCanvasFile(DEFAULT_FILE_NAME, 'typescript')];
  });
  const [activeFileId, setActiveFileId] = useState<string | null>(() => persisted?.activeFileId ?? persisted?.files?.[0]?.id ?? files[0]?.id ?? null);
  const [provider, setProvider] = useState<CodeAutocompleteProvider>('openai');
  const [model, setModel] = useState<string | undefined>(undefined);

  const activeFile = useMemo(() => files.find(file => file.id === activeFileId) ?? files[0] ?? null, [files, activeFileId]);

  const fileReferences: CanvasFileReference[] = useMemo(
    () => files.map(({ id, name, language, content }) => ({ id, name, language, content })),
    [files],
  );

  const messageOptions = useMemo(() => mapMessagesToOptions(messages, toPlainText), [messages, toPlainText]);

  const providerOptions: CanvasProviderOption[] = useMemo(() => {
    const base: CanvasProviderOption[] = [
      { id: 'openai', label: 'OpenAI' },
      { id: 'anthropic', label: 'Claude' },
      { id: 'groq', label: 'Groq' },
    ];
    if (runtimeStatus === 'ready' || runtimeStatus === 'starting') {
      base.push({ id: 'jarvis', label: 'Jarvis Core' });
    }
    return base;
  }, [runtimeStatus]);

  const providerAgents = useMemo(() => {
    const normalized = provider.toLowerCase();
    if (provider === 'jarvis') {
      return [];
    }
    return agents
      .filter(agent => agent.provider.toLowerCase() === normalized && agent.active)
      .map(agent => ({ id: agent.model, label: agent.model }));
  }, [agents, provider]);

  const {
    requestAutocomplete,
    isLoading: isCompleting,
    error: completionError,
    suggestions,
    providerReady,
  } = useCodeAutocomplete({ provider, model });

  useEffect(() => {
    persistState({ files, activeFileId });
  }, [files, activeFileId]);

  const handleEditorMount = useCallback(
    (editorInstance: MonacoEditor.IStandaloneCodeEditor | undefined, monacoInstance: Monaco | undefined) => {
      editorRef.current = editorInstance ?? null;
      monacoRef.current = monacoInstance ?? null;
    },
    [],
  );

  const updateFile = useCallback(
    (fileId: string, updater: (previous: CanvasFile) => CanvasFile) => {
      setFiles(prev =>
        prev.map(file => (file.id === fileId ? updater({ ...file }) : file)),
      );
    },
    [],
  );

  const handleContentChange = useCallback(
    (value?: string) => {
      if (!activeFile) {
        return;
      }
      const nextValue = value ?? '';
      updateFile(activeFile.id, previous => ({
        ...previous,
        content: nextValue,
        updatedAt: new Date().toISOString(),
      }));
    },
    [activeFile, updateFile],
  );

  const handleLanguageChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      if (!activeFile) {
        return;
      }
      const nextLanguage = event.target.value;
      updateFile(activeFile.id, previous => ({
        ...previous,
        language: nextLanguage,
        updatedAt: new Date().toISOString(),
      }));
    },
    [activeFile, updateFile],
  );

  const handleRename = useCallback(() => {
    if (!activeFile) {
      return;
    }
    const nextName = window.prompt('Nuevo nombre del archivo', activeFile.name)?.trim();
    if (!nextName) {
      return;
    }
    updateFile(activeFile.id, previous => ({
      ...previous,
      name: nextName,
      updatedAt: new Date().toISOString(),
    }));
  }, [activeFile, updateFile]);

  const handleAddFile = useCallback(() => {
    const baseName = `boceto-${files.length + 1}.ts`;
    const file = createCanvasFile(baseName, 'typescript');
    setFiles(prev => [...prev, file]);
    setActiveFileId(file.id);
  }, [files.length]);

  const handleRemoveFile = useCallback(
    (fileId: string) => {
      setFiles(prev => prev.filter(file => file.id !== fileId));
      setActiveFileId(prevId => {
        if (prevId === fileId) {
          const remaining = files.filter(file => file.id !== fileId);
          return remaining[0]?.id ?? null;
        }
        return prevId;
      });
    },
    [files],
  );

  const handleSendToChat = useCallback(() => {
    if (!activeFile) {
      return;
    }
    const snippet = getSelectionOrFullText(editorRef.current, activeFile.content).trim();
    if (!snippet) {
      return;
    }
    appendToDraft(snippet);
  }, [activeFile, appendToDraft]);

  const handleSendToRepo = useCallback(() => {
    if (!activeFile) {
      return;
    }
    const snippet = getSelectionOrFullText(editorRef.current, activeFile.content).trim();
    if (!snippet) {
      return;
    }
    queueRequest({
      messageId: activeFile.id,
      canonicalCode: snippet,
    });
  }, [activeFile, queueRequest]);

  const handleImportMessage = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const targetId = event.target.value;
      if (!activeFile || !targetId) {
        return;
      }
      const selected = messageOptions.find(option => option.id === targetId);
      if (!selected) {
        return;
      }
      const text = selected.content.trim();
      if (!text) {
        return;
      }
      const editor = editorRef.current;
      if (editor) {
        editor.setValue(text);
      }
      updateFile(activeFile.id, previous => ({
        ...previous,
        content: text,
        updatedAt: new Date().toISOString(),
      }));
    },
    [activeFile, messageOptions, updateFile],
  );

  const handleImportRepo = useCallback(() => {
    if (!activeFile || !pendingRequest) {
      return;
    }
    const snippet = pendingRequest.canonicalCode?.trim() || pendingRequest.originalResponse?.trim();
    if (!snippet) {
      return;
    }
    if (editorRef.current) {
      editorRef.current.setValue(snippet);
    }
    updateFile(activeFile.id, previous => ({
      ...previous,
      content: snippet,
      updatedAt: new Date().toISOString(),
    }));
  }, [activeFile, pendingRequest, updateFile]);

  const handleAutocomplete = useCallback(async () => {
    if (!activeFile) {
      return;
    }
    const editorInstance = editorRef.current;
    const cursor = editorInstance
      ? {
          lineNumber: editorInstance.getPosition()?.lineNumber ?? 1,
          column: editorInstance.getPosition()?.column ?? 1,
        }
      : undefined;

    const result = await requestAutocomplete({
      file: { id: activeFile.id, name: activeFile.name, language: activeFile.language, content: activeFile.content },
      cursor,
      files: fileReferences,
    });

    if (!result?.length) {
      return;
    }

    const applied = applySuggestionToEditor(editorInstance, monacoRef.current, result[0]);
    if (typeof applied === 'string') {
      updateFile(activeFile.id, previous => ({
        ...previous,
        content: applied,
        updatedAt: new Date().toISOString(),
      }));
    }
  }, [activeFile, fileReferences, requestAutocomplete, updateFile]);

  return (
    <div className="code-canvas">
      <div className="canvas-header">
        <div className="file-tabs" role="tablist" aria-label="Archivos en el canvas">
          {files.map(file => (
            <button
              key={file.id}
              type="button"
              role="tab"
              className={`file-tab ${file.id === activeFile?.id ? 'is-active' : ''}`}
              aria-selected={file.id === activeFile?.id}
              onClick={() => setActiveFileId(file.id)}
            >
              <span className="file-name">{file.name}</span>
              <span className="file-meta">{file.language}</span>
              <span
                role="button"
                className="file-remove"
                onClick={event => {
                  event.stopPropagation();
                  handleRemoveFile(file.id);
                }}
                aria-label={`Cerrar ${file.name}`}
              >
                ×
              </span>
            </button>
          ))}
          <button type="button" className="file-tab add" onClick={handleAddFile} aria-label="Nuevo archivo">
            ＋
          </button>
        </div>

        <div className="canvas-controls">
          <label>
            Proveedor
            <select value={provider} onChange={event => setProvider(event.target.value as CodeAutocompleteProvider)}>
              {providerOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {providerAgents.length > 0 && (
            <label>
              Modelo
              <select value={model ?? ''} onChange={event => setModel(event.target.value || undefined)}>
                <option value="">Automático</option>
                {providerAgents.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="primary"
            onClick={handleAutocomplete}
            disabled={!activeFile || isCompleting || !providerReady}
          >
            {isCompleting ? 'Completando…' : 'Autocompletar'}
          </button>
        </div>
      </div>

      <div className="canvas-body">
        <aside className="canvas-sidebar">
          <div className="sidebar-section">
            <h3>Archivo</h3>
            <label>
              Lenguaje
              <select value={activeFile?.language ?? 'typescript'} onChange={handleLanguageChange}>
                {DEFAULT_LANGUAGES.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={handleRename} disabled={!activeFile}>
              Renombrar
            </button>
          </div>

          <div className="sidebar-section">
            <h3>Chat</h3>
            <button type="button" onClick={handleSendToChat} disabled={!activeFile}>
              Enviar fragmento
            </button>
            <label>
              Cargar mensaje
              <select defaultValue="" onChange={handleImportMessage}>
                <option value="">Selecciona…</option>
                {messageOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="sidebar-section">
            <h3>Repo Studio</h3>
            <button type="button" onClick={handleSendToRepo} disabled={!activeFile}>
              Lanzar análisis
            </button>
            <button type="button" onClick={handleImportRepo} disabled={!activeFile || !pendingRequest}>
              Cargar último plan
            </button>
          </div>

          {completionError && <div className="sidebar-error">{completionError}</div>}
          {!!suggestions.length && (
            <div className="sidebar-section">
              <h3>Sugerencias</h3>
              <ul>
                {suggestions.map(suggestion => (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      onClick={() => {
                        const applied = applySuggestionToEditor(editorRef.current, monacoRef.current, suggestion);
                        if (typeof applied === 'string' && activeFile) {
                          updateFile(activeFile.id, previous => ({
                            ...previous,
                            content: applied,
                            updatedAt: new Date().toISOString(),
                          }));
                        }
                      }}
                    >
                      Insertar ({suggestion.provider})
                    </button>
                    <pre>{suggestion.text}</pre>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <div className="canvas-editor">
          {activeFile ? (
            <Editor
              height="100%"
              defaultLanguage={activeFile.language}
              language={activeFile.language}
              value={activeFile.content}
              onChange={handleContentChange}
              theme="vs-dark"
              onMount={handleEditorMount}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                wordWrap: 'on',
                automaticLayout: true,
              }}
            />
          ) : (
            <div className="empty-state">No hay archivos activos. Crea uno nuevo para empezar.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeCanvas;
