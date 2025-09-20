import React, { useState } from 'react';

export default function PreviewControls() {
  const [sensitivity, setSensitivity] = useState(0.5);
  const [smoothness, setSmoothness] = useState(0.5);

  const fullscreenAll = async () => {
    try {
      // Dynamically import to avoid errors when the Tauri API isn't available.
      const { invoke } = await import(/* @vite-ignore */ '@tauri-apps/api');
      await invoke('fullscreen_all');
    } catch (e) {
      console.warn('Fullscreen not available:', e);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div
        style={{
          flex: 1,
          border: '1px solid #ccc',
          marginRight: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: '#fff',
        }}
      >
        Visuals Window
      </div>
      <div style={{ width: 250, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3>Active Visual Controls</h3>
        <label>
          Sensitivity
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sensitivity}
            onChange={(e) => setSensitivity(parseFloat(e.target.value))}
          />
        </label>
        <label>
          Smoothness
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={smoothness}
            onChange={(e) => setSmoothness(parseFloat(e.target.value))}
          />
        </label>
        <button onClick={fullscreenAll}>Fullscreen All Monitors</button>
      </div>
    </div>
  );
}
