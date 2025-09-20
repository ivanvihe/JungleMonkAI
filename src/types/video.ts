export type VideoLoopMode = 'restart' | 'pingpong';

export interface VideoResource {
  id: string;
  title: string;
  description?: string;
  thumbnail: string;
  previewUrl: string;
  downloadUrl: string;
  duration?: number;
  provider: string;
  author?: string;
  width?: number;
  height?: number;
}

export interface VideoPlaybackSettings {
  loop: boolean;
  loopMode: VideoLoopMode;
  speed: number;
  reverse: boolean;
  /**
   * Value between 0 and 1 representing how strongly the black colors
   * should blend with the lower layers. 0 = disabled, 1 = maximum blend.
   */
  blackAlpha: number;
}

export const DEFAULT_VIDEO_PLAYBACK_SETTINGS: VideoPlaybackSettings = {
  loop: true,
  loopMode: 'restart',
  speed: 1,
  reverse: false,
  blackAlpha: 0.5,
};
