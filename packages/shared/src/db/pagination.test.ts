/**
 * Spec 020 / Phase 2.3 — pagination helper unit tests for the
 * `normalisePagination` clamp logic. The full handler integration is
 * covered by the existing per-handler tests which now run through the
 * paginated path.
 */
import { describe, expect, it } from 'vitest';
import { normalisePagination } from './pagination.js';

describe('normalisePagination', () => {
  it('P1: defaults to page=1, pageSize=25, skip=0 on empty input', () => {
    const r = normalisePagination();
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(25);
    expect(r.skip).toBe(0);
  });

  it('P2: clamps page to >= 1', () => {
    expect(normalisePagination({ page: 0 }).page).toBe(1);
    expect(normalisePagination({ page: -5 }).page).toBe(1);
  });

  it('P3: clamps pageSize to [1, 5000]', () => {
    expect(normalisePagination({ pageSize: 0 }).pageSize).toBe(1);
    expect(normalisePagination({ pageSize: 99_999 }).pageSize).toBe(5000);
  });

  it('P4: skip = (page - 1) * pageSize', () => {
    expect(normalisePagination({ page: 1, pageSize: 25 }).skip).toBe(0);
    expect(normalisePagination({ page: 2, pageSize: 25 }).skip).toBe(25);
    expect(normalisePagination({ page: 5, pageSize: 100 }).skip).toBe(400);
  });

  it('P5: rounds non-integer inputs down', () => {
    expect(normalisePagination({ page: 2.7, pageSize: 25.9 }).page).toBe(2);
    expect(normalisePagination({ page: 2.7, pageSize: 25.9 }).pageSize).toBe(25);
  });
});
