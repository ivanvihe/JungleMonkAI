import React from 'react';
import './OverlayModal.css';

interface OverlayModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}

export const OverlayModal: React.FC<OverlayModalProps> = ({ title, isOpen, onClose, children, width }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="overlay-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="overlay-modal__backdrop" onClick={onClose} />
      <div className="overlay-modal__panel" style={width ? { width } : undefined}>
        <header className="overlay-modal__header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </header>
        <div className="overlay-modal__content">{children}</div>
      </div>
    </div>
  );
};

export default OverlayModal;
