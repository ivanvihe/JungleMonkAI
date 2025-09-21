export type AriaLabelOptions = {
  id?: string;
  label?: string;
  description?: string;
};

export const buildAriaLabelledBy = ({ id, label, description }: AriaLabelOptions) => {
  const ids = [label, description].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : id;
};

export type ToggleAriaProps = {
  id?: string;
  label: string;
  isPressed: boolean;
  controls?: string;
};

export const createToggleButtonProps = ({
  id,
  label,
  isPressed,
  controls,
}: ToggleAriaProps) => ({
  id,
  role: 'button' as const,
  tabIndex: 0,
  'aria-pressed': isPressed,
  'aria-label': label,
  'aria-controls': controls,
});

export const mergeAriaAttributes = <T extends Record<string, unknown>>(
  base: T,
  extra: Record<string, unknown>,
): T & Record<string, unknown> => ({
  ...base,
  ...Object.fromEntries(Object.entries(extra).filter(([, value]) => value !== undefined)),
});
