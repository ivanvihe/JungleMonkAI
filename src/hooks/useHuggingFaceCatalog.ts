import { useCallback, useEffect, useMemo, useState } from 'react';

export interface HuggingFaceModel {
  id: string;
  name: string;
  pipelineTag?: string;
  libraryName?: string;
  likes?: number;
  downloads?: number;
  lastModified?: string;
  private?: boolean;
  tags: string[];
  cardData?: Record<string, unknown> | null;
}

export interface CatalogFilters {
  task?: string;
  library?: string;
}

export interface UseHuggingFaceCatalogOptions {
  apiBaseUrl: string;
  pageSize?: number;
  maxResults?: number;
  fetcher?: typeof fetch;
  initialSearch?: string;
  initialFilters?: CatalogFilters;
}

export interface HuggingFaceCatalogResult {
  models: HuggingFaceModel[];
  isLoading: boolean;
  error: string | null;
  page: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  search: string;
  filters: CatalogFilters;
  setSearch: (value: string) => void;
  setFilters: (filters: CatalogFilters) => void;
  setPage: (page: number) => void;
  refresh: () => void;
}

const DEFAULT_PAGE_SIZE = 15;
const DEFAULT_MAX_RESULTS = 60;

const buildRequestUrl = (
  baseUrl: string,
  search: string,
  filters: CatalogFilters,
  page: number,
  pageSize: number,
  maxResults: number,
): URL => {
  const normalizedBase = baseUrl.endsWith('/api')
    ? `${baseUrl}/models`
    : baseUrl.endsWith('/api/models')
    ? baseUrl
    : `${baseUrl.replace(/\/$/, '')}/api/models`;

  const params = new URLSearchParams();
  const effectivePageSize = Math.max(1, Math.min(pageSize, maxResults));
  const skip = Math.max(0, page * effectivePageSize);
  params.set('limit', String(effectivePageSize));
  params.set('skip', String(skip));
  params.set('full', 'true');
  params.set('sort', 'downloads');

  if (search.trim()) {
    params.set('search', search.trim());
  }

  if (filters.task) {
    params.set('pipeline_tag', filters.task);
  }

  if (filters.library) {
    params.set('library', filters.library);
  }

  return new URL(`${normalizedBase}?${params.toString()}`);
};

const mapModel = (entry: Record<string, unknown>): HuggingFaceModel | null => {
  const id = typeof entry.id === 'string' ? entry.id : null;
  if (!id) {
    return null;
  }

  const name = typeof entry.modelId === 'string' ? entry.modelId : id;
  const pipelineTag = typeof entry.pipeline_tag === 'string' ? entry.pipeline_tag : undefined;
  const libraryName = typeof entry.library_name === 'string' ? entry.library_name : undefined;
  const likes = typeof entry.likes === 'number' ? entry.likes : undefined;
  const downloads = typeof entry.downloads === 'number' ? entry.downloads : undefined;
  const lastModified = typeof entry.lastModified === 'string' ? entry.lastModified : undefined;
  const isPrivate = typeof entry.private === 'boolean' ? entry.private : undefined;
  const tags = Array.isArray(entry.tags)
    ? entry.tags.filter((value): value is string => typeof value === 'string')
    : [];

  const cardData = entry.cardData && typeof entry.cardData === 'object' ? (entry.cardData as Record<string, unknown>) : null;

  return {
    id,
    name,
    pipelineTag,
    libraryName,
    likes,
    downloads,
    lastModified,
    private: isPrivate,
    tags,
    cardData,
  };
};

export const useHuggingFaceCatalog = (
  options: UseHuggingFaceCatalogOptions,
): HuggingFaceCatalogResult => {
  const {
    apiBaseUrl,
    pageSize = DEFAULT_PAGE_SIZE,
    maxResults = DEFAULT_MAX_RESULTS,
    fetcher = fetch,
    initialSearch = '',
    initialFilters = {},
  } = options;

  const [page, setPage] = useState(0);
  const [search, setSearchInternal] = useState(initialSearch);
  const [filters, setFiltersInternal] = useState<CatalogFilters>(initialFilters);
  const [models, setModels] = useState<HuggingFaceModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const effectiveMaxResults = Math.max(1, maxResults);
  const effectivePageSize = Math.max(1, Math.min(pageSize, effectiveMaxResults));
  const totalPages = Math.max(1, Math.ceil(effectiveMaxResults / effectivePageSize));
  const boundedPage = Math.min(page, totalPages - 1);

  useEffect(() => {
    if (boundedPage !== page) {
      setPage(boundedPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundedPage]);

  const refresh = useCallback(() => {
    setRefreshKey(value => value + 1);
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;

    const run = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const url = buildRequestUrl(
          apiBaseUrl,
          search,
          filters,
          boundedPage,
          effectivePageSize,
          effectiveMaxResults,
        );
        const response = await fetcher(url.toString(), { signal });
        if (!response.ok) {
          throw new Error(`Catálogo Hugging Face: ${response.status} ${response.statusText}`);
        }

        const payload = (await response.json()) as unknown;
        if (!Array.isArray(payload)) {
          throw new Error('Formato de catálogo no válido');
        }

        const mapped = payload
          .map(entry => (entry && typeof entry === 'object' ? mapModel(entry as Record<string, unknown>) : null))
          .filter((entry): entry is HuggingFaceModel => Boolean(entry));

        setModels(mapped);
      } catch (err) {
        if (signal.aborted) {
          return;
        }
        console.error('No se pudo cargar el catálogo de modelos', err);
        setError(err instanceof Error ? err.message : String(err));
        setModels([]);
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      abortController.abort();
    };
  }, [apiBaseUrl, search, filters, boundedPage, effectivePageSize, effectiveMaxResults, fetcher, refreshKey]);

  const hasNextPage = useMemo(() => {
    if (models.length < Math.min(effectivePageSize, effectiveMaxResults)) {
      return false;
    }
    return boundedPage < totalPages - 1;
  }, [boundedPage, effectiveMaxResults, models.length, effectivePageSize, totalPages]);

  const hasPreviousPage = boundedPage > 0;

  const handleSetSearch = useCallback((value: string) => {
    setSearchInternal(value);
    setPage(0);
  }, []);

  const handleSetFilters = useCallback((nextFilters: CatalogFilters) => {
    setFiltersInternal(prev => {
      if (
        prev.task === nextFilters.task &&
        prev.library === nextFilters.library
      ) {
        return prev;
      }
      return { ...nextFilters };
    });
    setPage(0);
  }, []);

  const handleSetPage = useCallback((nextPage: number) => {
    setPage(Math.max(0, Math.min(nextPage, totalPages - 1)));
  }, [totalPages]);

  return {
    models,
    isLoading,
    error,
    page: boundedPage,
    hasNextPage,
    hasPreviousPage,
    search,
    filters,
    setSearch: handleSetSearch,
    setFilters: handleSetFilters,
    setPage: handleSetPage,
    refresh,
  };
};
