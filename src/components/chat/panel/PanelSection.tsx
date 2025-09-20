import React from 'react';

interface PanelSectionProps {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  collapsible?: boolean;
  onToggle?: (id: string) => void;
  meta?: React.ReactNode;
}

export const PanelSection: React.FC<PanelSectionProps> = ({
  id,
  title,
  description,
  children,
  isOpen,
  collapsible = true,
  onToggle,
  meta,
}) => {
  const handleToggle = () => {
    if (collapsible && onToggle) {
      onToggle(id);
    }
  };

  return (
    <section
      className={`panel-section ${collapsible ? 'is-collapsible' : 'is-static'} ${isOpen ? 'is-open' : 'is-collapsed'}`.trim()}
      data-panel-section={id}
    >
      <header className="panel-section-header">
        {collapsible ? (
          <button
            type="button"
            className="panel-section-toggle"
            aria-expanded={isOpen}
            onClick={handleToggle}
          >
            <span className="panel-section-title">{title}</span>
            {meta && <span className="panel-section-meta">{meta}</span>}
          </button>
        ) : (
          <div className="panel-section-heading">
            <span className="panel-section-title">{title}</span>
            {meta && <span className="panel-section-meta">{meta}</span>}
          </div>
        )}
        {description && <p className="panel-section-description">{description}</p>}
      </header>
      <div className="panel-section-body" hidden={!isOpen}>
        {children}
      </div>
    </section>
  );
};
