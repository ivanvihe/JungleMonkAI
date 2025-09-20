import React from 'react';
import { ChatTranscription } from '../../../core/messages/messageTypes';

interface AudioPlayerProps {
  src: string;
  title?: string;
  mimeType?: string;
  transcriptions?: ChatTranscription[];
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, title, mimeType, transcriptions }) => (
  <div className="message-audio-player">
    <audio src={src} controls preload="metadata" title={title ?? 'Mensaje de audio'} />
    {transcriptions?.length ? (
      <details className="audio-transcriptions">
        <summary>Transcripciones ({transcriptions.length})</summary>
        <ul>
          {transcriptions.map(transcription => (
            <li key={transcription.id}>
              <span className="transcription-language">{transcription.language ?? 'es'}</span>
              <span className="transcription-text">{transcription.text}</span>
            </li>
          ))}
        </ul>
      </details>
    ) : null}
  </div>
);

export default AudioPlayer;
