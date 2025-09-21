'use strict';

/**
 * Logs a console message emitted by the renderer with defensive fallbacks.
 *
 * @param {{ log: (...args: any[]) => void }} logger
 * @param {{
 *   level?: number,
 *   message?: unknown,
 *   lineNumber?: number,
 *   sourceId?: string
 * }} params
 * @returns {boolean} True if the message was logged, false otherwise.
 */
function logConsoleMessage(logger, params) {
  if (!logger || typeof logger.log !== 'function') {
    return false;
  }

  if (!params || typeof params !== 'object') {
    return false;
  }

  const { level, message, lineNumber, sourceId } = params;

  if (typeof message !== 'string' || message.length === 0) {
    return false;
  }

  const safeLevel = typeof level === 'number' && Number.isFinite(level) ? level : -1;
  const safeLine = typeof lineNumber === 'number' && Number.isFinite(lineNumber) ? lineNumber : 0;
  const safeSourceId = typeof sourceId === 'string' && sourceId.length > 0 ? sourceId : '<anonymous>';

  logger.log(`Console [${safeLevel}] ${safeSourceId}:${safeLine} -`, message);
  return true;
}

module.exports = {
  logConsoleMessage
};
