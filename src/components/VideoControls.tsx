import React from 'react';
import { VideoPlaybackSettings, VideoResource } from '../types/video';
import './VideoControls.css';

interface VideoControlsProps {
  video: VideoResource;
  settings: VideoPlaybackSettings;
  onChange: (updates: Partial<VideoPlaybackSettings>) => void;
}

const VideoControls: React.FC<VideoControlsProps> = ({ video, settings, onChange }) => {
  return (
    <div className="video-controls">
      <h3 className="video-controls-title">🎬 {video.title}</h3>
      {video.width != null && video.height != null && (
        <p className="video-controls-meta">{video.width}×{video.height}</p>
      )}
      <div className="video-controls-grid">
        <label className="video-control checkbox">
          <input
            type="checkbox"
            checked={settings.loop}
            onChange={(e) => onChange({ loop: e.target.checked })}
          />
          Loop playback
        </label>

        <label className="video-control select">
          <span>Loop mode</span>
          <select
            value={settings.loopMode}
            onChange={(e) => onChange({ loopMode: e.target.value as any })}
          >
            <option value="restart">Restart</option>
            <option value="pingpong">Ping-pong</option>
          </select>
        </label>

        <label className="video-control slider">
          <span>Speed {settings.speed.toFixed(2)}x</span>
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.05}
            value={settings.speed}
            onChange={(e) => onChange({ speed: parseFloat(e.target.value) })}
          />
        </label>

        <label className="video-control checkbox">
          <input
            type="checkbox"
            checked={settings.reverse}
            onChange={(e) => onChange({ reverse: e.target.checked })}
          />
          Reverse playback
        </label>

        <label className="video-control slider">
          <span>Black transparency {(settings.blackAlpha * 100).toFixed(0)}%</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.blackAlpha}
            onChange={(e) => onChange({ blackAlpha: parseFloat(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
};

export default VideoControls;
