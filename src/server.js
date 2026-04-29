#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { listAccounts, storeTokens, removeAccount, setLabel, resolveEmail } from './db.js';
import { initiateAuth } from './auth.js';
import {
  searchEmails,
  getEmail,
  sendEmail,
  replyToEmail,
  createDraft,
  listLabels,
  modifyLabels,
} from './gmail-client.js';

const pendingSessions = new Map();

// Session-level active account (label or email)
let activeAccount = null;

/**
 * Resolve a label, email, or fallback to the active account.
 * Throws a descriptive error if nothing resolves.
 */
function resolveAccount(labelOrEmail) {
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

const server = new Server(
  { name: 'multi-gmail-mcp', version: '1.0.1' },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: 'list_accounts',
    description:
      'List all authenticated Gmail accounts with their labels. ' +
      'Always call this first so you know which label maps to which address.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_active_account',
    description:
      'Set a default Gmail account for this conversation. ' +
      'After this, all tools can omit the email/label parameter and will use this account.',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Email address or label (e.g. "work", "personal")',
        },
      },
      required: ['account'],
    },
  },
  {
    name: 'get_active_account',
    description: 'Show the currently active Gmail account for this conversation.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'initiate_auth',
    description:
      'Start OAuth2 authentication for a Gmail account. ' +
      'Returns a URL the user must open in their browser. ' +
      'After the user completes sign-in, call complete_auth.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail address to authenticate' },
        label: {
          type: 'string',
          description: 'Optional label for this account (e.g. "work", "personal")',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'complete_auth',
    description:
      'Finish OAuth2 authentication after the user has opened the URL from initiate_auth ' +
      'and completed the Google sign-in flow.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail address being authenticated' },
      },
      required: ['email'],
    },
  },
  {
    name: 'set_account_label',
    description: 'Set or update the label for an existing Gmail account.',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Email address or current label' },
        label: { type: 'string', description: 'New label to assign (e.g. "work", "personal")' },
      },
      required: ['account', 'label'],
    },
  },
  {
    name: 'remove_account',
    description: 'Remove a Gmail account and its stored credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Email address or label to remove' },
      },
      required: ['account'],
    },
  },
  {
    name: 'search_emails',
    description: 'Search emails using Gmail search syntax (e.g. "from:foo is:unread").',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Email address or label (e.g. "work"). Uses active account if omitted.',
        },
        query: { type: 'string', description: 'Gmail search query' },
        max_results: { type: 'number', description: 'Maximum number of results (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_email',
    description: 'Fetch the full content of an email by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Email address or label. Uses active account if omitted.',
        },
        message_id: { type: 'string', description: 'Email message ID' },
      },
      required: ['message_id'],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email from a Gmail account.',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Email address or label to send from. Uses active account if omitted.',
        },
        to: { type: 'string', description: 'Recipient address(es)' },
        subject: { type: 'string', description: 'Subject line' },
        body: { type: 'string', description: 'Plain-text body' },
        cc: { type: 'string', description: 'CC recipients (optional)' },
        bcc: { type: 'string', description: 'BCC recipients (optional)' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'reply_to_email',
    description: 'Reply to an existing email, preserving thread context.',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Email address or label to reply from. Uses active account if omitted.',
        },
        message_id: { type: 'string', description: 'ID of the email to reply to' },
        body: { type: 'string', description: 'Plain-text reply body' },
      },
      required: ['message_id', 'body'],
    },
  },
  {
    name: 'create_draft',
    description: 'Save an email as a draft without sending.',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Email address or label. Uses active account if omitted.',
        },
        to: { type: 'string', description: 'Recipient address(es)' },
        subject: { type: 'string', description: 'Subject line' },
        body: { type: 'string', description: 'Plain-text body' },
        cc: { type: 'string', description: 'CC recipients (optional)' },
        bcc: { type: 'string', description: 'BCC recipients (optional)' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'list_labels',
    description: 'List all Gmail labels for an account.',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Email address or label. Uses active account if omitted.',
        },
      },
    },
  },
  {
    name: 'add_label',
    description: 'Add one or more labels to an email.',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Email address or label. Uses active account if omitted.',
        },
        message_id: { type: 'string', description: 'Email message ID' },
        label_ids: { type: 'array', items: { type: 'string' }, description: 'Label IDs to add' },
      },
      required: ['message_id', 'label_ids'],
    },
  },
  {
    name: 'remove_label',
    description: 'Remove one or more labels from an email.',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Email address or label. Uses active account if omitted.',
        },
        message_id: { type: 'string', description: 'Email message ID' },
        label_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Label IDs to remove',
        },
      },
      required: ['message_id', 'label_ids'],
    },
  },
  {
    name: 'archive_email',
    description: 'Archive an email by removing it from the inbox.',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Email address or label. Uses active account if omitted.',
        },
        message_id: { type: 'string', description: 'Email message ID' },
      },
      required: ['message_id'],
    },
  },
  {
    name: 'mark_as_read',
    description: 'Mark an email as read.',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Email address or label. Uses active account if omitted.',
        },
        message_id: { type: 'string', description: 'Email message ID' },
      },
      required: ['message_id'],
    },
  },
  {
    name: 'mark_as_unread',
    description: 'Mark an email as unread.',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Email address or label. Uses active account if omitted.',
        },
        message_id: { type: 'string', description: 'Email message ID' },
      },
      required: ['message_id'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let text;

    switch (name) {
      case 'list_accounts': {
        const accounts = listAccounts();
        if (!accounts.length) {
          text = 'No Gmail accounts authenticated yet. Use initiate_auth to add one.';
          break;
        }
        const active = activeAccount ? `\nActive account: ${activeAccount}` : '';
        text =
          'Authenticated Gmail accounts:\n' +
          accounts
            .map(({ email, label }) => {
              const tag = label ? ` [label: ${label}]` : '';
              return `  • ${email}${tag}`;
            })
            .join('\n') +
          active;
        break;
      }

      case 'set_active_account': {
        const email = resolveAccount(args.account);
        activeAccount = args.account;
        text = `Active account set to: ${email}${args.account !== email ? ` (label: "${args.account}")` : ''}`;
        break;
      }

      case 'get_active_account': {
        if (!activeAccount) {
          text = 'No active account set. Use set_active_account to set one.';
        } else {
          const email = resolveEmail(activeAccount);
          text = `Active account: ${email}${activeAccount !== email ? ` (label: "${activeAccount}")` : ''}`;
        }
        break;
      }

      case 'initiate_auth': {
        const { email, label } = args;
        if (pendingSessions.has(email)) {
          const existing = pendingSessions.get(email);
          text =
            `Authentication already in progress for ${email}.\n\n` +
            `Open this URL if you haven't already:\n${existing.authUrl}\n\n` +
            `Then call complete_auth with email: ${email}`;
          break;
        }
        const session = await initiateAuth();
        pendingSessions.set(email, { ...session, label });
        text =
          `Authentication started for ${email}.\n\n` +
          `Please open this URL in your browser:\n${session.authUrl}\n\n` +
          `After completing sign-in, call complete_auth with email: ${email}`;
        break;
      }

      case 'complete_auth': {
        const { email } = args;
        const session = pendingSessions.get(email);
        if (!session) {
          text = `No pending authentication for ${email}. Call initiate_auth first.`;
          break;
        }
        const tokens = await session.tokenPromise;
        storeTokens(email, tokens, session.label ?? null);
        pendingSessions.delete(email);
        text = `Successfully authenticated ${email}!` +
          (session.label ? ` Label: "${session.label}"` : '');
        break;
      }

      case 'set_account_label': {
        const email = resolveAccount(args.account);
        setLabel(email, args.label);
        text = `Label "${args.label}" set for ${email}`;
        break;
      }

      case 'remove_account': {
        const email = resolveAccount(args.account);
        removeAccount(email);
        if (activeAccount === args.account || activeAccount === email) activeAccount = null;
        text = `Removed account: ${email}`;
        break;
      }

      case 'search_emails': {
        const email = resolveAccount(args.account);
        const results = await searchEmails(email, args.query, args.max_results);
        if (!results.length) {
          text = `No emails found in ${email} matching your query.`;
          break;
        }
        text = results
          .map(m =>
            [
              `ID: ${m.id}`,
              `From: ${m.from}`,
              `Subject: ${m.subject}`,
              `Date: ${m.date}`,
              `Snippet: ${m.snippet}`,
              `Labels: ${m.labels.join(', ')}`,
            ].join('\n')
          )
          .join('\n\n---\n\n');
        break;
      }

      case 'get_email': {
        const email = resolveAccount(args.account);
        const msg = await getEmail(email, args.message_id);
        text = [
          `From: ${msg.from}`,
          `To: ${msg.to}`,
          msg.cc ? `Cc: ${msg.cc}` : null,
          `Subject: ${msg.subject}`,
          `Date: ${msg.date}`,
          `Labels: ${msg.labels.join(', ')}`,
          '',
          msg.body,
        ]
          .filter(l => l !== null)
          .join('\n');
        break;
      }

      case 'send_email': {
        const email = resolveAccount(args.account);
        const sent = await sendEmail(email, {
          to: args.to,
          subject: args.subject,
          body: args.body,
          cc: args.cc,
          bcc: args.bcc,
        });
        text = `Email sent from ${email}. Message ID: ${sent.id}`;
        break;
      }

      case 'reply_to_email': {
        const email = resolveAccount(args.account);
        const replied = await replyToEmail(email, args.message_id, args.body);
        text = `Reply sent from ${email}. Message ID: ${replied.id}`;
        break;
      }

      case 'create_draft': {
        const email = resolveAccount(args.account);
        const draft = await createDraft(email, {
          to: args.to,
          subject: args.subject,
          body: args.body,
          cc: args.cc,
          bcc: args.bcc,
        });
        text = `Draft created in ${email}. Draft ID: ${draft.id}`;
        break;
      }

      case 'list_labels': {
        const email = resolveAccount(args.account);
        const labels = await listLabels(email);
        text = labels.map(l => `${l.name}  (ID: ${l.id})`).join('\n');
        break;
      }

      case 'add_label': {
        const email = resolveAccount(args.account);
        await modifyLabels(email, args.message_id, args.label_ids, []);
        text = `Labels added to message ${args.message_id}.`;
        break;
      }

      case 'remove_label': {
        const email = resolveAccount(args.account);
        await modifyLabels(email, args.message_id, [], args.label_ids);
        text = `Labels removed from message ${args.message_id}.`;
        break;
      }

      case 'archive_email': {
        const email = resolveAccount(args.account);
        await modifyLabels(email, args.message_id, [], ['INBOX']);
        text = `Message ${args.message_id} archived from ${email}.`;
        break;
      }

      case 'mark_as_read': {
        const email = resolveAccount(args.account);
        await modifyLabels(email, args.message_id, [], ['UNREAD']);
        text = `Message ${args.message_id} marked as read.`;
        break;
      }

      case 'mark_as_unread': {
        const email = resolveAccount(args.account);
        await modifyLabels(email, args.message_id, ['UNREAD'], []);
        text = `Message ${args.message_id} marked as unread.`;
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: 'text', text }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('multi-gmail-mcp server started');
