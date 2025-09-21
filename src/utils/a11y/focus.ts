export type FocusTrapHandle = {
  deactivate: () => void;
};

let lastFocusedElement: HTMLElement | null = null;

const focusableSelectors = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
];

export const rememberFocus = () => {
  if (typeof document === 'undefined') {
    return;
  }

  lastFocusedElement = document.activeElement as HTMLElement | null;
};

export const restoreFocus = (fallback?: HTMLElement | null) => {
  if (typeof document === 'undefined') {
    return;
  }

  const target = lastFocusedElement ?? fallback;
  if (target && typeof target.focus === 'function') {
    window.requestAnimationFrame(() => target.focus());
  }
};

export const focusFirstChild = (container: HTMLElement) => {
  const focusable = container.querySelector<HTMLElement>(focusableSelectors.join(','));
  if (focusable) {
    focusable.focus();
  }
};

export const trapFocus = (container: HTMLElement): FocusTrapHandle => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = Array.from(
      container.querySelectorAll<HTMLElement>(focusableSelectors.join(',')),
    ).filter(element => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'));

    if (focusableElements.length === 0) {
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', handleKeyDown);

  return {
    deactivate: () => {
      container.removeEventListener('keydown', handleKeyDown);
    },
  };
};
