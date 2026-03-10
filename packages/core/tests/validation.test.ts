import { describe, it, expect } from 'vitest';
import {
  InputValidator,
  sanitizeString,
  safeParseJson,
  isValidHex,
  isValidUrl,
  hasSqlInjectionPatterns,
  hasXssPatterns,
  A2AMessageValidationSchema,
  JsonRpcRequestSchema,
} from '../src/security/validation.js';

describe('InputValidator', () => {
  const validator = new InputValidator({
    maxStringLength: 100,
    maxObjectDepth: 5,
    maxArrayLength: 10,
  });

  it('should validate simple strings', () => {
    expect(validator.validate('hello world').valid).toBe(true);
  });

  it('should reject strings exceeding max length', () => {
    const longString = 'a'.repeat(101);
    expect(validator.validate(longString).valid).toBe(false);
  });

  it('should reject SQL injection patterns', () => {
    expect(validator.validate('SELECT * FROM users').valid).toBe(false);
  });

  it('should reject XSS patterns', () => {
    expect(validator.validate('<script>alert(1)</script>').valid).toBe(false);
  });

  it('should validate numbers', () => {
    expect(validator.validate(123).valid).toBe(true);
  });

  it('should validate booleans', () => {
    expect(validator.validate(true).valid).toBe(true);
  });

  it('should validate null', () => {
    expect(validator.validate(null).valid).toBe(true);
  });

  it('should reject arrays exceeding max length', () => {
    const longArray = Array(11).fill('a');
    expect(validator.validate(longArray).valid).toBe(false);
  });
});

describe('sanitizeString', () => {
  it('should remove control characters', () => {
    expect(sanitizeString('hello\x00world')).toBe('helloworld');
  });

  it('should preserve newlines and tabs', () => {
    expect(sanitizeString('hello\nworld')).toBe('hello\nworld');
    expect(sanitizeString('hello\tworld')).toBe('hello\tworld');
  });

  it('should trim to max length', () => {
    expect(sanitizeString('hello', 3)).toBe('hel');
  });
});

describe('safeParseJson', () => {
  it('should reject invalid JSON', () => {
    const result = safeParseJson('not json', A2AMessageValidationSchema);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid JSON');
  });

  it('should reject input exceeding max length', () => {
    const longJson = JSON.stringify({ data: 'a'.repeat(1000) });
    const result = safeParseJson(longJson, A2AMessageValidationSchema, 100);
    expect(result.success).toBe(false);
    expect(result.error).toContain('maximum length');
  });
});

describe('isValidHex', () => {
  it('should validate hex strings', () => {
    expect(isValidHex('abc123')).toBe(true);
    expect(isValidHex('ABCDEF')).toBe(true);
    expect(isValidHex('not-hex')).toBe(false);
  });

  it('should validate hex with expected length', () => {
    expect(isValidHex('abc', 3)).toBe(true);
    expect(isValidHex('abc', 4)).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('should validate URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost')).toBe(true);
    expect(isValidUrl('not-a-url')).toBe(false);
  });

  it('should respect allowed protocols', () => {
    expect(isValidUrl('https://example.com', ['http:'])).toBe(false);
    expect(isValidUrl('http://example.com', ['http:'])).toBe(true);
  });
});

describe('hasSqlInjectionPatterns', () => {
  it('should detect SQL patterns', () => {
    expect(hasSqlInjectionPatterns('SELECT * FROM users')).toBe(true);
    expect(hasSqlInjectionPatterns("'; DROP TABLE--")).toBe(true);
  });

  it('should not detect SQL patterns in normal text', () => {
    expect(hasSqlInjectionPatterns('hello world')).toBe(false);
    expect(hasSqlInjectionPatterns('normal text')).toBe(false);
  });
});

describe('hasXssPatterns', () => {
  it('should detect XSS patterns', () => {
    expect(hasXssPatterns('<script>alert(1)</script>')).toBe(true);
    expect(hasXssPatterns('javascript:void(0)')).toBe(true);
  });

  it('should not detect XSS patterns in normal text', () => {
    expect(hasXssPatterns('hello world')).toBe(false);
  });
});

describe('A2AMessageValidationSchema', () => {
  it('should validate text message', () => {
    const result = A2AMessageValidationSchema.safeParse({
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid role', () => {
    const result = A2AMessageValidationSchema.safeParse({
      role: 'invalid',
      parts: [{ type: 'text', text: 'Hello' }],
    });
    expect(result.success).toBe(false);
  });

  it('should require at least one part', () => {
    const result = A2AMessageValidationSchema.safeParse({
      role: 'user',
      parts: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('JsonRpcRequestSchema', () => {
  it('should validate JSON-RPC request', () => {
    const result = JsonRpcRequestSchema.safeParse({
      jsonrpc: '2.0',
      method: 'test',
      id: 1,
    });
    expect(result.success).toBe(true);
  });

  it('should require jsonrpc 2.0', () => {
    const result = JsonRpcRequestSchema.safeParse({
      jsonrpc: '1.0',
      method: 'test',
      id: 1,
    });
    expect(result.success).toBe(false);
  });
});