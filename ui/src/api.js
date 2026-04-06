/* global __API_BASE__ */

/**
 * Base URL for the Python FastAPI service.
 * Injected at build time by Vite from API_PORT in .env
 * e.g. "http://127.0.0.1:8000"
 */
export const API_BASE = __API_BASE__
