import { useState, useEffect } from 'react';
import { AudioVisualizerEngine } from '../core/AudioVisualizerEngine';
import { AudioData } from '../core/PresetLoader';

export function useAudio(engineRef: React.MutableRefObject<AudioVisualizerEngine | null>, isInitialized: boolean) {
  const [audioData, setAudioData] = useState<AudioData>({ low: 0, mid: 0, high: 0, fft: [] });
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState<string | null>(null);
  const [audioGain, setAudioGain] = useState(1);

  useEffect(() => {
    if (navigator?.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then(devs => {
          const inputs = devs.filter(d => d.kind === 'audioinput');
          setAudioDevices(inputs);
          if (audioDeviceId && !inputs.some(d => d.deviceId === audioDeviceId)) {
            setAudioDeviceId(null);
          }
        })
        .catch(err => console.warn('Audio devices error', err));
    }
  }, [audioDeviceId]);

  useEffect(() => {
    let teardown: (() => void) | null = null;

    const scaleAudio = (d: AudioData): AudioData => ({
      low: d.low * audioGain,
      mid: d.mid * audioGain,
      high: d.high * audioGain,
      fft: d.fft.map(v => v * audioGain)
    });

    const setupAudioListener = async () => {
      try {
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          console.log('🎵 Tauri environment detected, setting up audio listener...');

          const tauriApi = await import('@tauri-apps/api/event').catch(err => {
            console.warn('Tauri event API not available:', err);
            return null;
          });

          if (tauriApi) {
            const unlisten = await tauriApi.listen('audio_data', (event) => {
              const data = event.payload as AudioData;
              const scaled = scaleAudio(data);
              setAudioData(scaled);
              if (engineRef.current) {
                engineRef.current.updateAudioData(scaled);
              }
            });

            console.log('✅ Tauri audio listener setup complete');
            teardown = () => { unlisten(); };
            return;
          }
        }

        console.log('🎙️ Using Web Audio API for input');
        const constraints: MediaStreamConstraints = {
          audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();

        analyser.fftSize = 512;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let rafId = 0;

        const update = () => {
          analyser.getByteFrequencyData(dataArray);
          const third = Math.floor(bufferLength / 3);

          const avg = (arr: Uint8Array) => arr.reduce((sum, v) => sum + v, 0) / arr.length / 255;
          const low = avg(dataArray.slice(0, third));
          const mid = avg(dataArray.slice(third, third * 2));
          const high = avg(dataArray.slice(third * 2));
          const fft = Array.from(dataArray, v => v / 255);

          const scaled = scaleAudio({ low, mid, high, fft });
          setAudioData(scaled);
          if (engineRef.current) {
            engineRef.current.updateAudioData(scaled);
          }

          rafId = requestAnimationFrame(update);
        };

        rafId = requestAnimationFrame(update);
        teardown = () => {
          cancelAnimationFrame(rafId);
          audioCtx.close();
          stream.getTracks().forEach(t => t.stop());
        };
      } catch (error) {
        console.warn('⚠️ Audio listener setup failed:', error);

        const fallbackData: AudioData = {
          low: 0.3,
          mid: 0.5,
          high: 0.2,
          fft: Array.from({ length: 256 }, () => Math.random() * 0.5)
        };

        const scaled = scaleAudio(fallbackData);
        setAudioData(scaled);
        if (engineRef.current) {
          engineRef.current.updateAudioData(scaled);
        }
      }
    };

    if (isInitialized) {
      setupAudioListener();
    }

    return () => {
      if (teardown) teardown();
    };
  }, [isInitialized, audioGain, audioDeviceId]);

  return {
    audioData,
    audioDevices,
    audioDeviceId,
    setAudioDeviceId,
    audioGain,
    setAudioGain,
  };
}

