import { VideoResource } from '../types/video';

export type VideoProviderId = 'pexels' | 'pixabay' | 'archive';

export interface VideoProviderSettings {
  provider: VideoProviderId;
  apiKey?: string;
  refreshMinutes: number;
  query: string;
}

interface GalleryCacheEntry {
  provider: VideoProviderId;
  query: string;
  items: VideoResource[];
  updatedAt: number;
}

const GALLERY_CACHE_KEY = 'videoGalleryCache';

const fetchFromPexels = async (settings: VideoProviderSettings): Promise<VideoResource[]> => {
  if (!settings.apiKey) {
    console.warn('Pexels provider selected without API key');
    return [];
  }
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(settings.query)}&per_page=24`;
  const response = await fetch(url, {
    headers: {
      Authorization: settings.apiKey,
    },
  });
  if (!response.ok) {
    throw new Error(`Pexels request failed with status ${response.status}`);
  }
  const data = await response.json();
  return (data.videos || []).map((video: any): VideoResource => {
    const file = video.video_files?.find((f: any) => f.quality === 'hd') || video.video_files?.[0];
    return {
      id: String(video.id),
      title: video.user?.name ? `${video.user.name} – ${video.id}` : `Video ${video.id}`,
      description: video.description || video.url,
      thumbnail: video.image,
      previewUrl: file?.link || video.url,
      downloadUrl: file?.link || video.url,
      duration: video.duration,
      provider: 'pexels',
      author: video.user?.name,
      width: file?.width,
      height: file?.height,
    };
  });
};

const fetchFromPixabay = async (settings: VideoProviderSettings): Promise<VideoResource[]> => {
  if (!settings.apiKey) {
    console.warn('Pixabay provider selected without API key');
    return [];
  }
  const url = `https://pixabay.com/api/videos/?key=${settings.apiKey}&q=${encodeURIComponent(settings.query)}&per_page=24`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Pixabay request failed with status ${response.status}`);
  }
  const data = await response.json();
  return (data.hits || []).map((hit: any): VideoResource => {
    const files = hit.videos || {};
    const hd = files.large || files.medium || files.small;
    return {
      id: String(hit.id),
      title: hit.user ? `${hit.user} – ${hit.tags}` : hit.tags || `Video ${hit.id}`,
      description: hit.tags,
      thumbnail: hit.userImageURL || hit.previewURL,
      previewUrl: (hd && hd.url) || hit.videos?.tiny?.url || hit.previewURL,
      downloadUrl: (hd && hd.url) || hit.videos?.tiny?.url || hit.previewURL,
      duration: hit.duration,
      provider: 'pixabay',
      author: hit.user,
      width: hd?.width || hit.videos?.tiny?.width,
      height: hd?.height || hit.videos?.tiny?.height,
    };
  });
};

const fetchFromArchive = async (settings: VideoProviderSettings): Promise<VideoResource[]> => {
  const query = `${settings.query} AND mediatype:(movies) AND (subject:"vj" OR subject:"visuals" OR subject:"loops")`;
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=description&sort[]=_score+desc&rows=24&page=1&output=json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Archive.org request failed with status ${response.status}`);
  }
  const data = await response.json();
  return (data.response?.docs || []).map((doc: any): VideoResource => {
    const identifier = doc.identifier;
    const base = `https://archive.org/download/${identifier}/${identifier}.mp4`;
    return {
      id: String(identifier),
      title: doc.title || identifier,
      description: doc.description,
      thumbnail: `https://archive.org/services/img/${identifier}`,
      previewUrl: base,
      downloadUrl: base,
      provider: 'archive',
      width: doc.width,
      height: doc.height,
    };
  });
};

const PROVIDER_FETCHERS: Record<VideoProviderId, (settings: VideoProviderSettings) => Promise<VideoResource[]>> = {
  pexels: fetchFromPexels,
  pixabay: fetchFromPixabay,
  archive: fetchFromArchive,
};

export const loadVideoGallery = async (
  settings: VideoProviderSettings,
  forceRefresh = false
): Promise<VideoResource[]> => {
  let cached: GalleryCacheEntry | null = null;
  try {
    const raw = localStorage.getItem(GALLERY_CACHE_KEY);
    if (raw) {
      cached = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Unable to parse video gallery cache', err);
  }

  if (
    !forceRefresh &&
    cached &&
    cached.provider === settings.provider &&
    cached.query === settings.query &&
    Date.now() - cached.updatedAt < settings.refreshMinutes * 60_000
  ) {
    return cached.items;
  }

  const fetcher = PROVIDER_FETCHERS[settings.provider];
  try {
    const items = await fetcher(settings);
    const entry: GalleryCacheEntry = {
      provider: settings.provider,
      query: settings.query,
      items,
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(GALLERY_CACHE_KEY, JSON.stringify(entry));
    } catch (err) {
      console.warn('Unable to persist video gallery cache', err);
    }
    return items;
  } catch (error) {
    console.error('Video provider request failed', error);
    return cached?.items || [];
  }
};

export const clearVideoGalleryCache = () => {
  try {
    localStorage.removeItem(GALLERY_CACHE_KEY);
  } catch (err) {
    console.warn('Unable to clear gallery cache', err);
  }
};
