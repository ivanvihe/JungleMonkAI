export const estimateTokenCount = (value: string): number => {
  if (!value) {
    return 0;
  }

  const sanitized = value.trim();
  if (!sanitized) {
    return 0;
  }

  const words = sanitized.split(/\s+/u).length;
  const punctuation = sanitized.replace(/[\w\d\s]/gu, '').length;
  const estimated = Math.ceil(words * 1.2 + punctuation * 0.5);
  return Number.isFinite(estimated) ? estimated : 0;
};

export default estimateTokenCount;
