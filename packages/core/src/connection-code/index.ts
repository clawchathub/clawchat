/**
 * @clawchat/core - Connection Code Module
 * Easy-to-share connection codes for Claw nodes
 */

export * from './types.js';
export {
  generateConnectionCode,
  generateShortCode,
  extractNodeId,
} from './generator.js';
export {
  parseConnectionCode,
  validateConnectionCode,
  isExpired,
  compareCodes,
} from './parser.js';
export { isValidFormat as isValidConnectionCodeFormat } from './generator.js';