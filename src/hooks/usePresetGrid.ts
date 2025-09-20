import React, { useState, useEffect } from 'react';

interface DragTarget {
  layerId: string;
  index: number;
}

const getExplorerWidth = () => {
  if (typeof document === 'undefined') {
    return 0;
  }
  const widthAttr = document.body?.getAttribute('data-explorer-width');
  const parsed = widthAttr ? parseInt(widthAttr, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

export const usePresetGrid = () => {
  const SLOT_WIDTH = 98;
  const SIDEBAR_WIDTH = 100;

  const calculateSlots = () => {
    const explorerWidth = getExplorerWidth();
    const available = window.innerWidth - SIDEBAR_WIDTH - explorerWidth - 40; // padding
    return Math.max(1, Math.floor(available / SLOT_WIDTH));
  };

  const [slotsPerLayer, setSlotsPerLayer] = useState(calculateSlots());

  const [layerPresets, setLayerPresets] = useState<Record<string, (string | null)[]>>(() => {
    try {
      const stored = localStorage.getItem('layerPresets');
      if (stored) {
        const parsed = JSON.parse(stored);
        const ensureSlots = (arr?: (string | null)[]) => {
          const result = Array.isArray(arr) ? [...arr] : [];
          while (result.length < slotsPerLayer) {
            result.push(null);
          }
          if (result.length > slotsPerLayer) {
            result.splice(slotsPerLayer);
          }
          return result;
        };
        return {
          A: ensureSlots(parsed.A),
          B: ensureSlots(parsed.B),
          C: ensureSlots(parsed.C)
        };
      }
    } catch {
      /* ignore */
    }
    return {
      A: Array(slotsPerLayer).fill(null),
      B: Array(slotsPerLayer).fill(null),
      C: Array(slotsPerLayer).fill(null)
    };
  });

  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);

  useEffect(() => {
    localStorage.setItem('layerPresets', JSON.stringify(layerPresets));
  }, [layerPresets]);

  useEffect(() => {
    const handleResize = () => {
      const slots = calculateSlots();
      setSlotsPerLayer(slots);
      setLayerPresets(prev => {
        const adjust = (arr: (string | null)[]) => {
          const res = [...arr];
          while (res.length < slots) res.push(null);
          if (res.length > slots) res.splice(slots);
          return res;
        };
        return {
          A: adjust(prev.A),
          B: adjust(prev.B),
          C: adjust(prev.C)
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getBaseId = (id: string) => {
    if (id.startsWith('custom-glitch-text')) return 'custom-glitch-text';
    if (id.startsWith('empty')) return 'empty';
    return id;
  };

  const canPlace = (list: (string | null)[], id: string, ignoreIndex?: number) => {
    const base = getBaseId(id);
    if (base === 'custom-glitch-text' || base === 'empty') return true;
    return !list.some((pid, idx) => pid && getBaseId(pid) === base && idx !== ignoreIndex);
  };

  const addPresetToLayer = (layerId: string, presetId: string) => {
    setLayerPresets(prev => {
      const next = { ...prev };
      const list = [...next[layerId]];
      const emptyIndex = list.findIndex(slot => slot === null);
      if (emptyIndex !== -1 && canPlace(list, presetId, emptyIndex)) {
        list[emptyIndex] = presetId;
        next[layerId] = list;
        return next;
      }
      return prev;
    });
  };

  const removePresetFromLayer = (layerId: string, presetId: string) => {
    setLayerPresets(prev => {
      const next = { ...prev };
      const list = [...next[layerId]];
      const idx = list.findIndex(id => id === presetId);
      if (idx !== -1) {
        list[idx] = null;
        next[layerId] = list;
        return next;
      }
      return prev;
    });
  };

  useEffect(() => {
    if (!(window as any).addPresetToLayer) {
      (window as any).addPresetToLayer = addPresetToLayer;
    }
    if (!(window as any).removePresetFromLayer) {
      (window as any).removePresetFromLayer = removePresetFromLayer;
    }
    return () => {
      delete (window as any).addPresetToLayer;
      delete (window as any).removePresetFromLayer;
    };
  }, []);

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    layerId: string,
    index: number
  ) => {
    const presetId = layerPresets[layerId][index];
    if (!presetId) return;

    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ layerId, index, presetId, source: 'layer-grid' })
    );
    e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('preset-dragging');
  };

  const handleDragEnd = () => {
    document.body.classList.remove('preset-dragging');
    setDragTarget(null);
  };

  const handleDragEnter = (
    e: React.DragEvent<HTMLDivElement>,
    layerId: string,
    index: number
  ) => {
    e.preventDefault();
    setDragTarget({ layerId, index });
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { clientX, clientY } = e;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      setDragTarget(null);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();

    const effectAllowed = e.dataTransfer.effectAllowed?.toLowerCase() || '';

    if (
      effectAllowed === 'uninitialized' ||
      effectAllowed === 'all' ||
      effectAllowed.includes('move')
    ) {
      e.dataTransfer.dropEffect = 'move';
      return;
    }

    if (effectAllowed.includes('copy')) {
      e.dataTransfer.dropEffect = 'copy';
      return;
    }

    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    targetLayerId: string,
    targetIndex: number
  ) => {
    e.preventDefault();
    setDragTarget(null);

    const jsonData = e.dataTransfer.getData('application/json');
    const plainData = e.dataTransfer.getData('text/plain');

    if (plainData && !jsonData) {
      setLayerPresets(prev => {
        const next = { ...prev };
        const list = [...next[targetLayerId]];
        if (!canPlace(list, plainData, targetIndex)) return prev;
        list[targetIndex] = plainData;
        next[targetLayerId] = list;
        return next;
      });
      document.body.classList.remove('preset-dragging');
      return;
    }

    if (!jsonData) return;

    try {
      const dragData = JSON.parse(jsonData);
      const { layerId: sourceLayerId, index: sourceIndex, source } = dragData;

      if (source !== 'layer-grid' || sourceLayerId === undefined || sourceIndex === undefined) return;

      setLayerPresets(prev => {
        const next = { ...prev };

        if (sourceLayerId === targetLayerId) {
          const list = [...next[sourceLayerId]];
          const [item] = list.splice(sourceIndex, 1);
          list.splice(targetIndex, 0, item);

          while (list.length < slotsPerLayer) {
            list.push(null);
          }
          if (list.length > slotsPerLayer) {
            list.splice(slotsPerLayer);
          }

          next[sourceLayerId] = list;
          return next;
        }

        const sourceList = [...next[sourceLayerId]];
        const targetList = [...next[targetLayerId]];
        const draggedId = sourceList[sourceIndex];
        const targetId = targetList[targetIndex];

        if (draggedId && !canPlace(targetList, draggedId, targetIndex)) {
          return prev;
        }
        if (targetId && !canPlace(sourceList, targetId, sourceIndex)) {
          return prev;
        }

        sourceList[sourceIndex] = targetId;
        targetList[targetIndex] = draggedId;
        next[sourceLayerId] = sourceList;
        next[targetLayerId] = targetList;
        return next;
      });
    } catch (error) {
      console.error('Error en drop:', error);
    }

    document.body.classList.remove('preset-dragging');
  };

  return {
    layerPresets,
    dragTarget,
    handleDragStart,
    handleDragEnd,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    addPresetToLayer,
    removePresetFromLayer
  };
};

