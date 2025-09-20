import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChatAttachment, ChatTranscription } from '../../../core/messages/messageTypes';

interface AudioRecorderProps {
  onRecordingComplete: (attachment: ChatAttachment, transcription?: ChatTranscription) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}

interface RecorderState {
  supported: boolean;
  permissionDenied: boolean;
  error?: string;
}

const buildId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onRecordingComplete,
  onError,
  disabled = false,
}) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [state, setState] = useState<RecorderState>({ supported: false, permissionDenied: false });

  useEffect(() => {
    const supported =
      typeof navigator !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia;
    setState(prev => ({ ...prev, supported }));
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const resetRecorder = useCallback(() => {
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    stopStream();
  }, [stopStream]);

  useEffect(() => () => resetRecorder(), [resetRecorder]);

  const handleError = useCallback(
    (message: string) => {
      setState(prev => ({ ...prev, error: message }));
      onError?.(message);
    },
    [onError],
  );

  const startRecording = useCallback(async () => {
    if (!state.supported || disabled || isRecording) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener('dataavailable', event => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const attachment: ChatAttachment = {
          id: buildId('audio'),
          type: 'audio',
          name: 'Grabación de voz',
          mimeType: blob.type,
          sizeBytes: blob.size,
          url,
        };

        const transcription: ChatTranscription = {
          id: buildId('transcription'),
          modality: 'audio',
          text: 'Transcripción pendiente…',
          source: 'user',
          attachmentId: attachment.id,
        };

        onRecordingComplete(attachment, transcription);
        setIsRecording(false);
        resetRecorder();
      });

      recorder.start();
      setIsRecording(true);
      setState(prev => ({ ...prev, error: undefined, permissionDenied: false }));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setState(prev => ({ ...prev, permissionDenied: true }));
        handleError('Permite el acceso al micrófono para grabar audio.');
      } else {
        handleError('No fue posible iniciar la grabación de audio.');
      }
    }
  }, [disabled, handleError, isRecording, onRecordingComplete, state.supported, stopStream]);

  const stopRecording = useCallback(() => {
    if (!isRecording) {
      return;
    }

    mediaRecorderRef.current?.stop();
  }, [isRecording]);

  return (
    <div className="audio-recorder">
      <button
        type="button"
        className={`ghost-button ${isRecording ? 'recording' : ''}`}
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled || !state.supported}
      >
        {isRecording ? 'Detener audio' : 'Grabar audio'}
      </button>
      {!state.supported && <span className="recorder-hint">Grabación de audio no soportada en este navegador.</span>}
      {state.permissionDenied && (
        <span className="recorder-hint recorder-error">Permiso de micrófono denegado.</span>
      )}
      {state.error && <span className="recorder-hint recorder-error">{state.error}</span>}
    </div>
  );
};

export default AudioRecorder;
