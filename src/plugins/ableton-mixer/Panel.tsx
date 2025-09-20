import React, { useMemo, useState } from 'react';
import './Panel.css';

interface MixerChannel {
  id: string;
  label: string;
}

const DEFAULT_CHANNELS: MixerChannel[] = [
  { id: 'channel-1', label: 'Kick' },
  { id: 'channel-2', label: 'Snare' },
  { id: 'channel-3', label: 'Bass' },
  { id: 'channel-4', label: 'Pads' },
  { id: 'channel-5', label: 'Lead' },
  { id: 'channel-6', label: 'FX' },
];

export const Panel: React.FC = () => {
  const [volumes, setVolumes] = useState<Record<string, number>>(() =>
    DEFAULT_CHANNELS.reduce((acc, channel, index) => {
      acc[channel.id] = 0.5 + index * 0.05;
      return acc;
    }, {} as Record<string, number>),
  );
  const [muteState, setMuteState] = useState<Record<string, boolean>>({});

  const activeChannels = useMemo(() => DEFAULT_CHANNELS, []);

  return (
    <div className="ableton-mixer-panel">
      <header>
        <h3>Ableton Mixer</h3>
        <p>Ajusta rápidamente los niveles de tus pistas favoritas.</p>
      </header>
      <div className="ableton-mixer-panel__channels">
        {activeChannels.map(channel => {
          const volume = volumes[channel.id] ?? 0.5;
          const muted = Boolean(muteState[channel.id]);
          return (
            <div key={channel.id} className="ableton-mixer-panel__channel">
              <span className="ableton-mixer-panel__label">{channel.label}</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={event =>
                  setVolumes(prev => ({
                    ...prev,
                    [channel.id]: Number(event.target.value),
                  }))
                }
              />
              <span className="ableton-mixer-panel__value">{Math.round(volume * 100)}%</span>
              <button
                type="button"
                className={`ableton-mixer-panel__mute${muted ? ' ableton-mixer-panel__mute--on' : ''}`}
                onClick={() =>
                  setMuteState(prev => ({
                    ...prev,
                    [channel.id]: !muted,
                  }))
                }
                aria-pressed={muted}
              >
                {muted ? 'Mute' : 'Sonando'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Panel;
