import { useState, useEffect, useRef } from 'react';
import { AudioVisualizerEngine } from '../core/AudioVisualizerEngine';
import { LoadedPreset } from '../core/PresetLoader';
import { isLaunchpadDevice } from '../utils/launchpad';

interface MidiTrigger {
  layerId: string;
  presetId: string;
  velocity: number;
}

interface LayerEffect {
  effect: string;
  alwaysOn: boolean;
  active: boolean;
}

interface MidiOptions {
  isFullscreenMode: boolean;
  availablePresets: LoadedPreset[];
  layerChannels: Record<string, number>;
  layerEffects: Record<string, LayerEffect>;
  setLayerEffects: React.Dispatch<React.SetStateAction<Record<string, LayerEffect>>>;
  effectMidiNotes: Record<string, number>;
  launchpadChannel?: number;
  launchpadNote?: number;
  onLaunchpadToggle?: () => void;
  enableLaunchpadToggle?: boolean;
  engineRef: React.MutableRefObject<AudioVisualizerEngine | null>;
}

interface MidiClockSettings {
  resolution: number; // pulses per quarter note
  delay: number; // delay in ms
  quantization: number; // quantization
  jumpMode: boolean; // jump mode by measures
  stability: number; // BPM stability
  type: 'midi' | 'internal' | 'off';
}

export function useMidi(options: MidiOptions) {
  const {
    isFullscreenMode,
    availablePresets,
    layerChannels,
    layerEffects,
    setLayerEffects,
    effectMidiNotes,
    launchpadChannel,
    launchpadNote,
    onLaunchpadToggle,
    enableLaunchpadToggle = false,
    engineRef,
  } = options;

  // MIDI Clock state
  const tickCountRef = useRef(0);
  const quarterNoteCountRef = useRef(0);
  const measureCountRef = useRef(0);
  const lastTickTimeRef = useRef<number | null>(null);
  const lastQuarterTimeRef = useRef<number | null>(null);
  const bpmHistoryRef = useRef<number[]>([]);
  const clockStableRef = useRef(false);

  // Internal clock for fallback
  const internalClockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const internalBpmRef = useRef(120);

  const [midiDevices, setMidiDevices] = useState<any[]>([]);
  const [midiDeviceId, setMidiDeviceId] = useState<string | null>(null);
  const [midiActive, setMidiActive] = useState(false);
  const [bpm, setBpm] = useState<number | null>(null);
  const [beatActive, setBeatActive] = useState(false);
  const [midiTrigger, setMidiTrigger] = useState<MidiTrigger | null>(null);

  // Debounce for LaunchPad toggle to avoid rapid retriggers
  const lastLaunchpadTriggerRef = useRef(0);
  const LAUNCHPAD_DEBOUNCE_MS = 300;

  // Enhanced MIDI clock settings
  const [midiClockSettings, setMidiClockSettings] = useState<MidiClockSettings>(() => ({
    resolution: parseInt(localStorage.getItem('midiClockResolution') || '24'),
    delay: parseInt(localStorage.getItem('midiClockDelay') || '0'),
    quantization: parseInt(localStorage.getItem('midiClockQuantization') || '1'),
    jumpMode: localStorage.getItem('midiClockJumpMode') === 'true',
    stability: parseInt(localStorage.getItem('midiClockStability') || '5'),
    type: (localStorage.getItem('midiClockType') || 'midi') as 'midi' | 'internal' | 'off',
  }));

  // Sync settings to localStorage
  useEffect(() => {
    Object.entries(midiClockSettings).forEach(([key, value]) => {
      localStorage.setItem(
        `midiClock${key.charAt(0).toUpperCase() + key.slice(1)}`,
        value.toString(),
      );
    });
  }, [midiClockSettings]);

  // BPM calculation with improved stability
  const updateBpmWithStability = (newBpm: number) => {
    if (!isFinite(newBpm) || newBpm < 40 || newBpm > 300) return;

    const last = bpmHistoryRef.current[bpmHistoryRef.current.length - 1];
    if (last && Math.abs(newBpm - last) > 5) {
      newBpm = last + Math.sign(newBpm - last) * 5;
    }

    bpmHistoryRef.current.push(newBpm);

    const historyLength = Math.max(3, midiClockSettings.stability);
    if (bpmHistoryRef.current.length > historyLength) {
      bpmHistoryRef.current.shift();
    }

    const weights = bpmHistoryRef.current.map((_, i) => i + 1);
    const weightedSum = bpmHistoryRef.current.reduce(
      (sum, bpm, i) => sum + bpm * weights[i],
      0,
    );
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const stabilizedBpm = weightedSum / totalWeight;

    setBpm(stabilizedBpm);

    if (engineRef.current) {
      engineRef.current.updateBpm(stabilizedBpm);
    }

    if (bpmHistoryRef.current.length >= Math.min(5, midiClockSettings.stability)) {
      clockStableRef.current = true;
    }
  };

  const startInternalClock = () => {
    if (internalClockRef.current) {
      clearInterval(internalClockRef.current);
    }

    const intervalMs =
      (60 * 1000) /
      (internalBpmRef.current * midiClockSettings.resolution);

    internalClockRef.current = setInterval(() => {
      handleClockTick(performance.now(), true);
    }, intervalMs);
  };

  const stopInternalClock = () => {
    if (internalClockRef.current) {
      clearInterval(internalClockRef.current);
      internalClockRef.current = null;
    }
  };

  const handleClockTick = (timestamp: number, isInternal: boolean = false) => {
    tickCountRef.current++;

    lastTickTimeRef.current = timestamp;

    if (tickCountRef.current % midiClockSettings.resolution === 0) {
      if (!isInternal) {
        if (lastQuarterTimeRef.current !== null) {
          const quarterInterval = timestamp - lastQuarterTimeRef.current;
          const currentBpm = (60 * 1000) / quarterInterval;
          updateBpmWithStability(currentBpm);
        }
        lastQuarterTimeRef.current = timestamp;
      }
      quarterNoteCountRef.current++;

      if (quarterNoteCountRef.current % 4 === 0) {
        measureCountRef.current++;
      }

      const triggerBeat = () => {
        setBeatActive(true);
        setTimeout(() => setBeatActive(false), 100);

        if (engineRef.current) {
          engineRef.current.triggerBeat();

          const beatInfo = {
            quarterNote: quarterNoteCountRef.current,
            measure: measureCountRef.current,
            tickInMeasure:
              tickCountRef.current % (midiClockSettings.resolution * 4),
            bpm: bpm || internalBpmRef.current,
            stable: clockStableRef.current,
          };

          const eng: any = engineRef.current;
          if (typeof eng.triggerAdvancedBeat === 'function') {
            eng.triggerAdvancedBeat(beatInfo);
          }
        }
      };

      if (midiClockSettings.quantization > 1) {
        const shouldTrigger =
          quarterNoteCountRef.current % midiClockSettings.quantization === 0;
        if (!shouldTrigger) return;
      }

      if (midiClockSettings.delay > 0) {
        setTimeout(triggerBeat, midiClockSettings.delay);
      } else {
        triggerBeat();
      }

      if (
        midiClockSettings.jumpMode &&
        quarterNoteCountRef.current % 4 === 0
      ) {
        const engine: any = engineRef.current;
        if (engine && typeof engine.triggerJump === 'function') {
          engine.triggerJump(measureCountRef.current);
        }
      }
    }
  };

  const resetClock = () => {
    tickCountRef.current = 0;
    quarterNoteCountRef.current = 0;
    measureCountRef.current = 0;
    lastTickTimeRef.current = null;
    lastQuarterTimeRef.current = null;
    bpmHistoryRef.current = [];
    clockStableRef.current = false;
    setBpm(null);
  };

  useEffect(() => {
    if (isFullscreenMode) return;

    const handleMidiMessage = (message: any) => {
      const [status, note, velocity] = message.data;
      const channel = (status & 0x0f) + 1;
      const messageType = status & 0xf0;

      // Solo procesar LaunchPad toggle si está habilitado y coinciden canal y nota
      if (
        enableLaunchpadToggle &&
        onLaunchpadToggle &&
        launchpadChannel !== undefined &&
        launchpadNote !== undefined &&
        channel === launchpadChannel &&
        note === launchpadNote &&
        velocity > 0 &&
        messageType === 0x90
      ) {
        const now = performance.now();
        if (now - lastLaunchpadTriggerRef.current < LAUNCHPAD_DEBOUNCE_MS) {
          return; // Ignorar triggers muy seguidos
        }
        lastLaunchpadTriggerRef.current = now;

        console.log(
          '🎹 LaunchPad MIDI trigger válido recibido:',
          JSON.stringify(
            {
              channel,
              note,
              velocity,
              expected: { channel: launchpadChannel, note: launchpadNote },
            },
            null,
            2,
          ),
        );

        // Solo entonces activar el toggle
        onLaunchpadToggle?.();
        return; // Salir temprano para evitar procesamiento adicional
      }

      // Clock MIDI processing
      if (status === 0xf8 && midiClockSettings.type === 'midi') {
        const timestamp =
          message.timeStamp ?? message.receivedTime ?? performance.now();
        handleClockTick(timestamp, false);
        return;
      }

      if (status === 0xfa) {
        resetClock();
        stopInternalClock();
        return;
      }

      if (status === 0xfb) {
        stopInternalClock();
        return;
      }

      if (status === 0xfc) {
        resetClock();
        if (midiClockSettings.type === 'internal') {
          startInternalClock();
        }
        return;
      }

      // Procesar otros triggers MIDI (layers, efectos, etc.)
      if (messageType === 0x90 || messageType === 0x80) {
        setMidiActive(true);
        setTimeout(() => setMidiActive(false), 100);
      }

      const channelToLayer = Object.fromEntries(
        Object.entries(layerChannels).map(([layerId, ch]) => [ch, layerId]),
      ) as Record<number, string>;
      const layerId = channelToLayer[channel];

      const matchedEffect = Object.entries(effectMidiNotes).find(
        ([, n]) => n === note,
      )?.[0];

      if (messageType === 0x90 && velocity > 0) {
        if (matchedEffect) {
          setLayerEffects(prev => {
            const updated = { ...prev };
            Object.keys(prev).forEach(id => {
              if (prev[id].effect === matchedEffect && !prev[id].alwaysOn) {
                updated[id] = { ...prev[id], active: true };
              }
            });
            return updated;
          });
        }
        const preset = availablePresets.find(p => p.config.note === note);
        if (layerId && preset) {
          setMidiTrigger({ layerId, presetId: preset.id, velocity });
        }
      } else if (messageType === 0x80 || (messageType === 0x90 && velocity === 0)) {
        if (matchedEffect) {
          setLayerEffects(prev => {
            const updated = { ...prev };
            Object.keys(prev).forEach(id => {
              if (prev[id].effect === matchedEffect && !prev[id].alwaysOn) {
                updated[id] = { ...prev[id], active: false };
              }
            });
            return updated;
          });
        }
      }
    };

    if ((navigator as any).requestMIDIAccess) {
      (navigator as any)
        .requestMIDIAccess({ sysex: true })
        .then((access: any) => {
          const inputs = Array.from(access.inputs.values()).filter(
            (i: any) => !isLaunchpadDevice(i)
          );
          setMidiDevices(inputs);

          inputs.forEach((input: any) => {
            if (!midiDeviceId || input.id === midiDeviceId) {
              input.onmidimessage = handleMidiMessage;
            } else {
              input.onmidimessage = null;
            }
          });

          access.onstatechange = () => {
            const ins = Array.from(access.inputs.values()).filter(
              (i: any) => !isLaunchpadDevice(i)
            );
            setMidiDevices(ins);
            ins.forEach((input: any) => {
              if (!midiDeviceId || input.id === midiDeviceId) {
                input.onmidimessage = handleMidiMessage;
              } else {
                input.onmidimessage = null;
              }
            });
          };
        })
        .catch((err: any) => console.warn('MIDI access error', err));
    }

    if (midiClockSettings.type === 'internal') {
      startInternalClock();
    }

    return () => {
      stopInternalClock();
    };
  }, [
    isFullscreenMode,
    midiDeviceId,
    midiClockSettings,
    layerChannels,
    layerEffects,
    effectMidiNotes,
    launchpadChannel,
    launchpadNote,
    onLaunchpadToggle,
    enableLaunchpadToggle,
    availablePresets,
  ]);

  const updateClockSettings = (updates: Partial<MidiClockSettings>) => {
    setMidiClockSettings(prev => ({ ...prev, ...updates }));

    if (updates.type === 'internal') {
      setBpm(internalBpmRef.current);
      startInternalClock();
    } else if (updates.type === 'midi' || updates.type === 'off') {
      setBpm(null);
      stopInternalClock();
    }
  };

  const setInternalBpm = (newBpm: number) => {
    internalBpmRef.current = newBpm;
    setBpm(newBpm);
    if (midiClockSettings.type === 'internal') {
      startInternalClock();
    }
  };

  return {
    midiDevices,
    midiDeviceId,
    setMidiDeviceId,
    midiActive,
    bpm,
    beatActive,
    midiTrigger,
    setMidiTrigger,
    midiClockSettings,
    updateClockSettings,
    setInternalBpm,
    internalBpm: internalBpmRef.current,
    clockStable: clockStableRef.current,
    currentMeasure: measureCountRef.current,
    currentBeat: (quarterNoteCountRef.current % 4) + 1,

    // Legacy compatibility
    midiClockDelay: midiClockSettings.delay,
    midiClockType: midiClockSettings.type,
    onMidiClockDelayChange: (delay: number) =>
      updateClockSettings({ delay }),
    onMidiClockTypeChange: (type: string) =>
      updateClockSettings({ type: type as 'midi' | 'internal' | 'off' }),
  } as const;
}

