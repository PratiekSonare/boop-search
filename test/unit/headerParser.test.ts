import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { HeaderParser } from '../../src/services/headerParser';

const parser = new HeaderParser();
const FIXTURES = path.join(__dirname, '../fixtures/sampleProject');

describe('HeaderParser', () => {
  it('extracts @purpose, @category, and @related from a full header', async () => {
    const result = await parser.extractHeader(path.join(FIXTURES, 'WithFullHeader.ts'));
    expect(result).not.toBeNull();
    expect(result!.purpose).toBe('Authentication middleware for validating JWT tokens');
    expect(result!.category).toBe('backend/middleware');
    expect(result!.related).toEqual(['authService.ts', 'jwtUtils.ts', 'session.ts']);
    expect(result!.purposeSource).toBe('manual');
  });

  it('extracts @purpose and @category with @related', async () => {
    const result = await parser.extractHeader(path.join(FIXTURES, 'WithHeader.ts'));
    expect(result).not.toBeNull();
    expect(result!.purpose).toBe('React component for displaying user profile information');
    expect(result!.category).toBe('frontend/components');
    expect(result!.related).toEqual(['UserAvatar.ts', 'useProfile.ts']);
  });

  it('returns null for a file with no @purpose header', async () => {
    const result = await parser.extractHeader(path.join(FIXTURES, 'NoHeader.ts'));
    expect(result).toBeNull();
  });

  it('returns null for a file with @file but no @purpose', async () => {
    const result = await parser.extractHeader(path.join(FIXTURES, 'PartialHeader.ts'));
    expect(result).toBeNull();
  });

  it('extracts hash-style headers from Python files', async () => {
    const result = await parser.extractHeader(path.join(FIXTURES, 'PythonWithHeader.py'));
    expect(result).not.toBeNull();
    expect(result!.purpose).toBe('Data processing utilities for CSV file parsing');
    expect(result!.category).toBe('utilities');
    expect(result!.related).toEqual(['data_loader.py']);
  });
});
