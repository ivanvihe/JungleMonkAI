import React, { useMemo } from 'react';
import { PanelSection } from './PanelSection';

export interface PanelSectionDefinition {
  id: string;
  title: string;
  description?: React.ReactNode;
  content: React.ReactNode;
  meta?: React.ReactNode;
}

export interface PanelContainerProps {
  sections: PanelSectionDefinition[];
  mode: 'tabs' | 'accordion';
  activeSectionId: string | null;
  onActiveSectionChange: (id: string) => void;
}

export const PanelContainer: React.FC<PanelContainerProps> = ({
  sections,
  mode,
  activeSectionId,
  onActiveSectionChange,
}) => {
  const sectionIds = useMemo(() => sections.map(section => section.id), [sections]);
  const resolvedActiveId = useMemo(() => {
    if (!sectionIds.length) {
      return null;
    }
    if (activeSectionId && sectionIds.includes(activeSectionId)) {
      return activeSectionId;
    }
    return sectionIds[0];
  }, [activeSectionId, sectionIds]);

  if (!sections.length) {
    return null;
  }

  if (mode === 'tabs') {
    const activeSection = sections.find(section => section.id === resolvedActiveId) ?? sections[0];

    return (
      <div className="panel-container panel-container-tabs">
        <div className="panel-tablist" role="tablist" aria-orientation="horizontal">
          {sections.map(section => {
            const isSelected = section.id === resolvedActiveId;
            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`panel-tab ${isSelected ? 'is-active' : ''}`.trim()}
                onClick={() => onActiveSectionChange(section.id)}
              >
                {section.title}
              </button>
            );
          })}
        </div>
        <div className="panel-tabpanel" role="tabpanel">
          <PanelSection
            id={activeSection.id}
            title={activeSection.title}
            description={activeSection.description}
            isOpen
            collapsible={false}
            meta={activeSection.meta}
          >
            {activeSection.content}
          </PanelSection>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-container panel-container-accordion">
      {sections.map(section => {
        const isOpen = section.id === resolvedActiveId;
        return (
          <PanelSection
            key={section.id}
            id={section.id}
            title={section.title}
            description={section.description}
            isOpen={isOpen}
            onToggle={onActiveSectionChange}
            meta={section.meta}
          >
            {section.content}
          </PanelSection>
        );
      })}
    </div>
  );
};
