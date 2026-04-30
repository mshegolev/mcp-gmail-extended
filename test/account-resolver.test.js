import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

const DB_PATH = join(tmpdir(), `gmail-ar-test-${randomBytes(4).toString('hex')}.db`);
process.env.GMAIL_MCP_DB_PATH = DB_PATH;

// account-resolver imports db.js; both must share the same module instance,
// which they will since dynamic import caches by resolved path.
const { storeTokens } = await import('../src/db.js');
const { resolveAccount } = await import('../src/account-resolver.js');

after(async () => {
  await rm(DB_PATH, { force: true });
});

const TOKENS = {
  access_token: 'tok',
  refresh_token: 'ref',
  expiry_date: Date.now() + 3_600_000,
  scope: '',
};

describe('resolveAccount', () => {
  it('throws when labelOrEmail is falsy and activeAccount is null', () => {
    assert.throws(
      () => resolveAccount(null, null),
      /No account specified and no active account set/
    );
  });

  it('throws when labelOrEmail is empty string and activeAccount is null', () => {
    assert.throws(
      () => resolveAccount('', null),
      /No account specified and no active account set/
    );
  });

  it('throws with helpful message when account is not found', () => {
    assert.throws(
      () => resolveAccount('ghost@example.com', null),
      /No account found for "ghost@example.com"/
    );
  });

  it('resolves by exact email', () => {
    storeTokens('user@example.com', TOKENS);
    assert.equal(resolveAccount('user@example.com', null), 'user@example.com');
  });

  it('resolves by label', () => {
    storeTokens('work@company.com', TOKENS, 'work');
    assert.equal(resolveAccount('work', null), 'work@company.com');
  });

  it('falls back to activeAccount when labelOrEmail is null', () => {
    storeTokens('fallback@example.com', TOKENS, 'fallback');
    assert.equal(resolveAccount(null, 'fallback'), 'fallback@example.com');
  });

  it('falls back to activeAccount when labelOrEmail is undefined', () => {
    storeTokens('fb2@example.com', TOKENS);
    assert.equal(resolveAccount(undefined, 'fb2@example.com'), 'fb2@example.com');
  });

  it('uses labelOrEmail over activeAccount when both are provided', () => {
    storeTokens('primary@example.com', TOKENS);
    storeTokens('secondary@example.com', TOKENS);
    assert.equal(
      resolveAccount('primary@example.com', 'secondary@example.com'),
      'primary@example.com'
    );
  });

  it('resolves activeAccount by label', () => {
    storeTokens('active-labelled@example.com', TOKENS, 'active');
    assert.equal(resolveAccount(null, 'active'), 'active-labelled@example.com');
  });

  it('throws when activeAccount is set but not found', () => {
    assert.throws(
      () => resolveAccount(null, 'missing-label'),
      /No account found for "missing-label"/
    );
  });
});
