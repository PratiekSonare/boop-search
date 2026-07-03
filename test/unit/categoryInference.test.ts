import { describe, it, expect } from 'vitest';
import { inferCategory } from '../../src/utils/categoryInference';

describe('inferCategory', () => {
  it('maps components folder to frontend/components', () => {
    expect(inferCategory('/project/src/components/Button.tsx')).toBe('frontend/components');
  });

  it('maps hooks folder to frontend/hooks', () => {
    expect(inferCategory('/project/src/hooks/useAuth.ts')).toBe('frontend/hooks');
  });

  it('maps services folder to backend/services', () => {
    expect(inferCategory('/project/src/services/authService.ts')).toBe('backend/services');
  });

  it('maps models folder to data/models', () => {
    expect(inferCategory('/project/src/models/User.ts')).toBe('data/models');
  });

  it('maps utils folder to utilities', () => {
    expect(inferCategory('/project/src/utils/formatDate.ts')).toBe('utilities');
  });

  it('maps migrations folder to data/migrations', () => {
    expect(inferCategory('/project/src/migrations/001_create_users.sql')).toBe('data/migrations');
  });

  it('maps __tests__ folder to tests', () => {
    expect(inferCategory('/project/src/__tests__/auth.test.ts')).toBe('tests');
  });

  it('infers tests from filename pattern', () => {
    expect(inferCategory('/project/src/auth.test.ts')).toBe('tests');
    expect(inferCategory('/project/src/auth.spec.ts')).toBe('tests');
  });

  it('infers types from .d.ts extension', () => {
    expect(inferCategory('/project/src/types/global.d.ts')).toBe('types');
  });

  it('falls back to misc for unknown paths', () => {
    expect(inferCategory('/project/src/foobar/something.ts')).toBe('misc');
  });

  it('handles Windows-style paths', () => {
    const result = inferCategory('C:\\project\\src\\components\\Button.tsx');
    expect(result).toBe('frontend/components');
  });
});
