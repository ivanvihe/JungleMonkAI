import { VideoResource } from '../types/video';

const CACHE_NAME = 'jungle-lab-video-cache';

interface CachedUrlEntry {
  videoId: string;
  objectUrl: string;
  sourceUrl: string;
  createdAt: number;
}

const objectUrlRegistry: Map<string, CachedUrlEntry> = new Map();

const supportsCacheApi = () => typeof window !== 'undefined' && 'caches' in window;

export const getCachedVideoUrl = async (video: VideoResource): Promise<string> => {
  const key = video.downloadUrl || video.previewUrl;
  const existing = Array.from(objectUrlRegistry.values()).find(entry => entry.sourceUrl === key);
  if (existing) {
    return existing.objectUrl;
  }

  if (!supportsCacheApi()) {
    console.warn('Cache API not available, using remote URL for video', video.id);
    return key;
  }

  const request = new Request(key, { mode: 'cors' });
  const cache = await caches.open(CACHE_NAME);
  let response = await cache.match(request);
  if (!response) {
    response = await fetch(request);
    if (!response.ok) {
      throw new Error(`Unable to download video ${video.id}`);
    }
    await cache.put(request, response.clone());
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  objectUrlRegistry.set(objectUrl, {
    videoId: video.id,
    objectUrl,
    sourceUrl: key,
    createdAt: Date.now(),
  });
  return objectUrl;
};

export const releaseCachedUrl = (objectUrl?: string) => {
  if (!objectUrl) return;
  try {
    URL.revokeObjectURL(objectUrl);
  } catch {
    /* ignore */
  }
  if (objectUrlRegistry.has(objectUrl)) {
    objectUrlRegistry.delete(objectUrl);
  }
};

export const clearVideoCache = async () => {
  objectUrlRegistry.forEach(entry => {
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch {
      /* ignore */
    }
  });
  objectUrlRegistry.clear();
  if (supportsCacheApi()) {
    await caches.delete(CACHE_NAME);
  }
};
