import { useMemo } from 'react';
import { usePluginHost } from '../core/plugins/PluginHostProvider';

export interface SidePanelSlotEntry {
  id: string;
  pluginId: string;
  label: string;
  Component: React.ComponentType;
}

export const useSidePanelSlots = (): SidePanelSlotEntry[] => {
  const { sidePanels } = usePluginHost();

  return useMemo(
    () =>
      sidePanels.map(panel => ({
        id: `${panel.pluginId}:${panel.id}`,
        pluginId: panel.pluginId,
        label: panel.label,
        Component: panel.Component,
      })),
    [sidePanels],
  );
};
