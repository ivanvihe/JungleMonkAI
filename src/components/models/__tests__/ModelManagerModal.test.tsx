import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ModelManagerModal } from '../ModelManagerModal';

const activateMock = vi.fn().mockResolvedValue(undefined);
const downloadMock = vi.fn().mockResolvedValue(undefined);
const refreshMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../hooks/useHuggingFaceCatalog', () => ({
  useHuggingFaceCatalog: vi.fn(() => ({
    models: [
      {
        id: 'remote-1',
        name: 'Remote Model',
        pipelineTag: 'text-generation',
        downloads: 1250,
        likes: 230,
        lastModified: '2024-04-01T00:00:00Z',
        tags: [],
      },
    ],
    isLoading: false,
    error: null,
    page: 0,
    hasNextPage: false,
    hasPreviousPage: false,
    search: '',
    filters: {},
    setSearch: vi.fn(),
    setFilters: vi.fn(),
    setPage: vi.fn(),
    refresh: vi.fn(),
  })),
}));

vi.mock('../../../hooks/useLocalModels', () => ({
  useLocalModels: vi.fn(() => ({
    models: [
      {
        id: 'remote-1',
        name: 'Remote Model',
        description: 'ready model',
        provider: 'Local',
        tags: [],
        size: 0,
        checksum: 'abc',
        status: 'ready',
        localPath: '/models/remote-1',
        active: false,
        progress: 1,
      },
      {
        id: 'local-2',
        name: 'Local Secondary',
        description: 'downloading',
        provider: 'Local',
        tags: [],
        size: 0,
        checksum: 'def',
        status: 'downloading',
        localPath: '/models/local-2',
        active: false,
        progress: 0.4,
      },
    ],
    isLoading: false,
    error: null,
    refresh: refreshMock,
    download: downloadMock,
    activate: activateMock,
  })),
}));

describe('ModelManagerModal', () => {
  beforeEach(() => {
    activateMock.mockClear();
    downloadMock.mockClear();
    refreshMock.mockClear();
  });

  it('renders catalog and local model information', async () => {
    const handleStorageChange = vi.fn();

    render(
      <ModelManagerModal
        isOpen
        onClose={() => undefined}
        storageDir={null}
        huggingFacePreferences={{ apiBaseUrl: 'https://huggingface.co', maxResults: 30, useStoredToken: false }}
        onStorageDirChange={handleStorageChange}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Remote Model' })).toBeInTheDocument();
    expect(screen.getByText('Local Secondary')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Carpeta de almacenamiento'), {
      target: { value: '  /data/models  ' },
    });
    expect(handleStorageChange).toHaveBeenCalledWith('/data/models');

    fireEvent.click(screen.getAllByText('Activar')[0]);

    await waitFor(() => {
      expect(activateMock).toHaveBeenCalledWith('remote-1');
    });
  });
});
