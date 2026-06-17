/**
 * socket.js – Shared Socket.IO instance
 *
 * This module stores the Socket.IO server instance after it is created in
 * server.js and makes it available to route handlers (e.g. companyPortal.js)
 * without creating a circular dependency.
 */

let _io = null;

/** Call once from server.js after creating the Socket.IO server. */
export const setIo = (io) => { _io = io; };

/** Returns the Socket.IO server instance (or null before server starts). */
export const getIo = () => _io;

/**
 * Emit a real-time event to all admin/portal clients currently connected to a
 * specific company room.
 *
 * @param {number|string} companyId
 * @param {string} event   – event name (e.g. 'issue:new', 'issue:updated')
 * @param {object} payload – arbitrary JSON payload
 */
export const emitToCompany = (companyId, event, payload) => {
  if (!_io || !companyId) return;
  try {
    _io.to(`company-${companyId}`).emit(event, payload);
  } catch (err) {
    // Never let a socket error break the HTTP response path
    console.warn('[socket] emit error:', err.message);
  }
};
