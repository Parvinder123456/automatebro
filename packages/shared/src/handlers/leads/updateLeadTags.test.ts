/**
 * Spec 024 / Phase 4.4 — updateLeadTags unit tests.
 * Mocks repo so we can exercise the normalisation + dedup + cap logic
 * without hitting the DB.
 */
import { describe, expect, it, vi } from 'vitest';

const FAKE_CTX = {
  userId: 'u-1',
  tenantId: 't-1',
  role: 'owner' as const,
  email: 'x@y.test',
  tenantDeleted: false,
};

function setRepoMock(initialTags: string[] | null): {
  capturedUpdate: { tags?: string[] } | null;
} {
  const captured: { capturedUpdate: { tags?: string[] } | null } = {
    capturedUpdate: null,
  };
  vi.doMock('../../db/repo.js', () => ({
    repo: {
      async queryOne(): Promise<unknown> {
        if (initialTags === null) return null;
        return {
          _id: 'lead-1',
          tenantId: FAKE_CTX.tenantId,
          igAccountId: 'ig-1',
          igUserId: 'psid-1',
          tags: initialTags,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        };
      },
      async updateOne(
        _collection: string,
        _filter: unknown,
        update: { $set?: { tags?: string[] } },
      ) {
        captured.capturedUpdate = (update.$set ?? {}) as { tags?: string[] };
      },
    },
  }));
  return captured;
}

describe('updateLeadTags', () => {
  it('UT1: replace mode normalises trim + lowercase + dedup', async () => {
    const c = setRepoMock([]);
    vi.resetModules();
    const { updateLeadTags } = await import('./updateLeadTags.js');

    const result = await updateLeadTags(FAKE_CTX, {
      leadId: 'lead-1',
      tags: ['  VIP ', 'vip', 'BUYER', '', '   '],
    });

    expect(result.tags).toEqual(['vip', 'buyer']);
    expect(c.capturedUpdate?.tags).toEqual(['vip', 'buyer']);
  });

  it('UT2: add mode unions with existing', async () => {
    setRepoMock(['vip']);
    vi.resetModules();
    const { updateLeadTags } = await import('./updateLeadTags.js');

    const result = await updateLeadTags(FAKE_CTX, {
      leadId: 'lead-1',
      add: ['buyer', 'vip', '  newsletter  '],
    });

    expect(result.tags).toEqual(['vip', 'buyer', 'newsletter']);
  });

  it('UT3: remove mode subtracts existing', async () => {
    setRepoMock(['vip', 'buyer', 'spam']);
    vi.resetModules();
    const { updateLeadTags } = await import('./updateLeadTags.js');

    const result = await updateLeadTags(FAKE_CTX, {
      leadId: 'lead-1',
      remove: ['spam', 'unknown-tag'],
    });

    expect(result.tags).toEqual(['vip', 'buyer']);
  });

  it('UT4: long tag is truncated to 64 chars', async () => {
    setRepoMock([]);
    vi.resetModules();
    const { updateLeadTags } = await import('./updateLeadTags.js');

    const longTag = 'a'.repeat(100);
    const result = await updateLeadTags(FAKE_CTX, {
      leadId: 'lead-1',
      add: [longTag],
    });

    expect(result.tags[0]?.length).toBe(64);
  });

  it('UT5: replace with too-many tags caps at 32', async () => {
    setRepoMock([]);
    vi.resetModules();
    const { updateLeadTags } = await import('./updateLeadTags.js');

    const fortyTags = Array.from({ length: 40 }, (_, i) => `tag-${i}`);
    const result = await updateLeadTags(FAKE_CTX, {
      leadId: 'lead-1',
      tags: fortyTags,
    });

    expect(result.tags).toHaveLength(32);
  });

  it('UT6: providing both tags + add throws', async () => {
    setRepoMock([]);
    vi.resetModules();
    const { updateLeadTags } = await import('./updateLeadTags.js');

    await expect(
      updateLeadTags(FAKE_CTX, {
        leadId: 'lead-1',
        tags: ['x'],
        add: ['y'],
      }),
    ).rejects.toThrow(/mutually exclusive/i);
  });

  it('UT7: providing none of tags/add/remove throws', async () => {
    setRepoMock([]);
    vi.resetModules();
    const { updateLeadTags } = await import('./updateLeadTags.js');

    await expect(updateLeadTags(FAKE_CTX, { leadId: 'lead-1' })).rejects.toThrow(/provide/i);
  });

  it('UT8: lead not found surfaces "not found" error', async () => {
    setRepoMock(null);
    vi.resetModules();
    const { updateLeadTags } = await import('./updateLeadTags.js');

    await expect(
      updateLeadTags(FAKE_CTX, {
        leadId: 'lead-missing',
        add: ['x'],
      }),
    ).rejects.toThrow(/not found/i);
  });
});
