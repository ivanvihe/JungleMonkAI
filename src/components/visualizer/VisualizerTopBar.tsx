import React, { useCallback, useState } from 'react';
import { TopBar, TopBarProps } from '../TopBar';
import { ModelManagerModal } from '../models/ModelManagerModal';
import { useLocalModels } from '../../hooks/useLocalModels';
import type { HuggingFacePreferences } from '../../types/globalSettings';

interface VisualizerTopBarProps extends TopBarProps {
  storageDir: string | null;
  huggingFacePreferences: HuggingFacePreferences;
  onStorageDirChange: (nextPath: string | null) => void;
}

export const VisualizerTopBar: React.FC<VisualizerTopBarProps> = ({
  storageDir,
  huggingFacePreferences,
  onStorageDirChange,
  ...topBarProps
}) => {
  const [isModelManagerOpen, setModelManagerOpen] = useState(false);
  const { refresh } = useLocalModels({ storageDir });

  const handleOpenModelGallery = useCallback(() => {
    void refresh();
    setModelManagerOpen(true);
  }, [refresh]);

  const handleCloseModelGallery = useCallback(() => {
    setModelManagerOpen(false);
    void refresh();
  }, [refresh]);

  return (
    <>
      <TopBar {...topBarProps} onOpenModelGallery={handleOpenModelGallery} />
      <ModelManagerModal
        isOpen={isModelManagerOpen}
        onClose={handleCloseModelGallery}
        storageDir={storageDir}
        huggingFacePreferences={huggingFacePreferences}
        onStorageDirChange={onStorageDirChange}
      />
    </>
  );
};

export default VisualizerTopBar;
