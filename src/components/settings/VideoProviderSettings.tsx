import React from 'react';
import { VideoProviderId } from '../../utils/videoProviders';

interface VideoProviderSettingsProps {
  provider: VideoProviderId;
  apiKey: string;
  refreshMinutes: number;
  query: string;
  onProviderChange: (provider: VideoProviderId) => void;
  onApiKeyChange: (value: string) => void;
  onRefreshMinutesChange: (value: number) => void;
  onQueryChange: (value: string) => void;
  onClearCache: () => void;
}

export const VideoProviderSettings: React.FC<VideoProviderSettingsProps> = ({
  provider,
  apiKey,
  refreshMinutes,
  query,
  onProviderChange,
  onApiKeyChange,
  onRefreshMinutesChange,
  onQueryChange,
  onClearCache,
}) => {
  return (
    <div className="settings-section">
      <h3>📹 Video providers</h3>
      <p className="setting-description">
        Configure the provider used for the online video gallery. Cached items are refreshed automatically
        according to the selected interval.
      </p>

      <div className="setting-group">
        <label className="setting-label">
          <span>Provider</span>
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as VideoProviderId)}
            className="setting-select"
          >
            <option value="pexels">Pexels</option>
            <option value="pixabay">Pixabay</option>
            <option value="archive">Archive.org</option>
          </select>
        </label>
      </div>

      <div className="setting-group">
        <label className="setting-label">
          <span>API key</span>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="Required for Pexels/Pixabay"
          />
        </label>
      </div>

      <div className="setting-group">
        <label className="setting-label">
          <span>Search query</span>
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="e.g. vj loop"
          />
        </label>
      </div>

      <div className="setting-group">
        <label className="setting-label">
          <span>Refresh cache every {refreshMinutes} min</span>
          <input
            type="range"
            min={5}
            max={180}
            step={5}
            value={refreshMinutes}
            onChange={(e) => onRefreshMinutesChange(parseInt(e.target.value, 10))}
          />
        </label>
      </div>

      <button className="setting-button" onClick={onClearCache}>
        Clear cached videos
      </button>
    </div>
  );
};
