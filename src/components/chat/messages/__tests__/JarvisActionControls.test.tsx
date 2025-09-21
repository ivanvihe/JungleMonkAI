import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { JarvisActionControls } from '../MessageActions';
import type { ChatMessageAction } from '../../../../core/messages/messageTypes';

const baseAction = (overrides: Partial<ChatMessageAction> = {}): ChatMessageAction => ({
  id: 'action-1',
  kind: 'open',
  payload: { path: '/tmp' },
  label: 'Abrir archivo',
  description: 'Abre el recurso en el explorador',
  status: 'pending',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

afterEach(() => {
  cleanup();
});

describe('JarvisActionControls', () => {
  it('muestra las acciones disponibles y permite ejecutarlas', () => {
    const handleTrigger = vi.fn();
    const handleReject = vi.fn();

    render(
      <JarvisActionControls action={baseAction()} onTrigger={handleTrigger} onReject={handleReject} />,
    );

    const triggerButton = screen.getByRole('button', { name: 'Ejecutar' });
    const rejectButton = screen.getByRole('button', { name: 'Descartar' });

    fireEvent.click(triggerButton);
    fireEvent.click(rejectButton);

    expect(handleTrigger).toHaveBeenCalledWith('action-1');
    expect(handleReject).toHaveBeenCalledWith('action-1');
  });

  it('indica el progreso cuando la acción está en ejecución', () => {
    render(
      <JarvisActionControls
        action={baseAction({ status: 'executing', label: 'Sincronizar', description: undefined })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument();
    expect(screen.getByText('Procesando…')).toBeInTheDocument();
  });

  it('muestra el resultado y el mensaje de error cuando corresponda', () => {
    render(
      <JarvisActionControls
        action={baseAction({
          status: 'completed',
          resultPreview: 'Archivo leído correctamente',
          errorMessage: 'Se encontraron advertencias',
        })}
      />,
    );

    expect(screen.getByLabelText('Resultado de Abrir archivo')).toHaveTextContent(
      'Archivo leído correctamente',
    );
    expect(screen.getByText('Se encontraron advertencias')).toBeInTheDocument();
  });
});
