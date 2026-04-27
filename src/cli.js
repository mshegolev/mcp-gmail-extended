#!/usr/bin/env node
/**
 * CLI helper for managing Gmail accounts outside of Claude Desktop.
 *
 * Usage:
 *   node src/cli.js list
 *   node src/cli.js add   <email>
 *   node src/cli.js remove <email>
 */
import { listAccounts, removeAccount, storeTokens } from './db.js';
import { initiateAuth } from './auth.js';

const [, , command, email] = process.argv;

switch (command) {
  case 'list': {
    const accounts = listAccounts();
    if (!accounts.length) {
      console.log('No authenticated accounts.');
    } else {
      console.log('Authenticated Gmail accounts:');
      accounts.forEach(a => console.log(`  • ${a}`));
    }
    break;
  }

  case 'add': {
    if (!email) {
      console.error('Usage: gmail-mcp-cli add <email>');
      process.exit(1);
    }

    console.log(`Starting authentication for ${email}...`);
    const session = await initiateAuth();

    console.log('\nOpen this URL in your browser to authenticate:\n');
    console.log(session.authUrl);
    console.log('\nWaiting for you to complete sign-in...');

    // Try to open the browser automatically (non-fatal if it fails)
    try {
      const { default: open } = await import('open');
      await open(session.authUrl);
    } catch {
      // open is optional; user can paste the URL manually
    }

    const tokens = await session.tokenPromise;
    storeTokens(email, tokens);
    console.log(`\nSuccessfully authenticated ${email}!`);
    break;
  }

  case 'remove': {
    if (!email) {
      console.error('Usage: gmail-mcp-cli remove <email>');
      process.exit(1);
    }
    removeAccount(email);
    console.log(`Removed account: ${email}`);
    break;
  }

  default: {
    console.log(`Usage:
  node src/cli.js list              List authenticated accounts
  node src/cli.js add <email>       Authenticate a Gmail account
  node src/cli.js remove <email>    Remove a Gmail account`);
    if (command) process.exit(1);
  }
}
