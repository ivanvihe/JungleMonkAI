import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { isTauriEnvironment } from '../core/storage/userDataPathsClient';

export interface GithubRepoSummary {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  description?: string | null;
  default_branch?: string | null;
  html_url?: string | null;
  clone_url?: string | null;
  ssh_url?: string | null;
  private: boolean;
  visibility?: string | null;
}

export interface UseGithubReposState {
  repos: GithubRepoSummary[];
  isLoading: boolean;
  error: string | null;
  ownerFilter: string;
  setOwnerFilter: (value: string) => void;
  refresh: (options?: { owner?: string }) => Promise<GithubRepoSummary[]>;
  isSupported: boolean;
}

export const useGithubRepos = (initialOwner?: string): UseGithubReposState => {
  const [ownerFilter, setOwnerFilter] = useState(initialOwner ?? '');
  const [repos, setRepos] = useState<GithubRepoSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSupported = useMemo(() => isTauriEnvironment(), []);

  const refresh = useCallback(
    async (options?: { owner?: string }) => {
      if (!isSupported) {
        setRepos([]);
        setError('El descubrimiento remoto solo está disponible en la aplicación de escritorio.');
        return [];
      }

      const nextOwner = options?.owner ?? ownerFilter;
      setOwnerFilter(nextOwner);

      setIsLoading(true);
      setError(null);

      try {
        const trimmedOwner = nextOwner.trim();
        const request = {
          provider: 'github',
          owner: trimmedOwner ? trimmedOwner : undefined,
        };
        const response = await invoke<GithubRepoSummary[]>('git_list_user_repos', {
          request,
        });
        setRepos(response);
        return response;
      } catch (err) {
        const message = (err as Error).message ?? 'No se pudo obtener el listado remoto.';
        setError(message);
        setRepos([]);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [isSupported, ownerFilter],
  );

  useEffect(() => {
    if (!isSupported) {
      return;
    }
    void refresh();
  }, [isSupported, refresh]);

  return {
    repos,
    isLoading,
    error,
    ownerFilter,
    setOwnerFilter,
    refresh,
    isSupported,
  };
};
