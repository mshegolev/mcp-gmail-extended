import { resolveEmail } from './db.js';

export function resolveAccount(labelOrEmail, activeAccount) {
  const target = labelOrEmail || activeAccount;
  if (!target) {
    throw new Error(
      'No account specified and no active account set. ' +
        'Pass an email/label or call set_active_account first.'
    );
  }
  const email = resolveEmail(target);
  if (!email) {
    throw new Error(
      `No account found for "${target}". ` +
        'Use list_accounts to see available accounts and their labels.'
    );
  }
  return email;
}
