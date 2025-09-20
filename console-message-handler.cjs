'use strict';

/**
 * Logs a console message emitted by the renderer with defensive fallbacks.
 *
 * @param {{ log: (...args: any[]) => void }} logger
 * @param {number} level
 * @param {string} message
 * @param {number} line
 * @param {string} sourceId
 * @returns {boolean} True if the message was logged, false otherwise.
 */
function logConsoleMessage(logger, level, message, line, sourceId) {
  if (!logger || typeof logger.log !== 'function') {
    return false;
  }

  if (typeof message !== 'string' || message.length === 0) {
    return false;
  }

  const safeLevel = typeof level === 'number' && Number.isFinite(level) ? level : -1;
  const safeLine = typeof line === 'number' && Number.isFinite(line) ? line : 0;
  const safeSourceId = typeof sourceId === 'string' && sourceId.length > 0 ? sourceId : '<anonymous>';

  logger.log(`Console [${safeLevel}] ${safeSourceId}:${safeLine} -`, message);
  return true;
}

module.exports = {
  logConsoleMessage
};
