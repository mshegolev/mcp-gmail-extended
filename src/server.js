#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { listAccounts, storeTokens, removeAccount } from './db.js';
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

// { email -> { authUrl, tokenPromise } }
const pendingSessions = new Map();

const server = new Server(
  { name: 'multi-gmail-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: 'list_accounts',
    description: 'List all authenticated Gmail accounts.',
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
    name: 'remove_account',
    description: 'Remove a Gmail account and its stored credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail address to remove' },
      },
      required: ['email'],
    },
  },
  {
    name: 'search_emails',
    description: 'Search emails using Gmail search syntax (e.g. "from:foo is:unread").',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail account to search in' },
        query: { type: 'string', description: 'Gmail search query' },
        max_results: {
          type: 'number',
          description: 'Maximum number of results (default: 10)',
        },
      },
      required: ['email', 'query'],
    },
  },
  {
    name: 'get_email',
    description: 'Fetch the full content of an email by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail account' },
        message_id: { type: 'string', description: 'Email message ID' },
      },
      required: ['email', 'message_id'],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email from a Gmail account.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail account to send from' },
        to: { type: 'string', description: 'Recipient address(es)' },
        subject: { type: 'string', description: 'Subject line' },
        body: { type: 'string', description: 'Plain-text body' },
        cc: { type: 'string', description: 'CC recipients (optional)' },
        bcc: { type: 'string', description: 'BCC recipients (optional)' },
      },
      required: ['email', 'to', 'subject', 'body'],
    },
  },
  {
    name: 'reply_to_email',
    description: 'Reply to an existing email, preserving thread context.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail account to reply from' },
        message_id: { type: 'string', description: 'ID of the email to reply to' },
        body: { type: 'string', description: 'Plain-text reply body' },
      },
      required: ['email', 'message_id', 'body'],
    },
  },
  {
    name: 'create_draft',
    description: 'Save an email as a draft without sending.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail account' },
        to: { type: 'string', description: 'Recipient address(es)' },
        subject: { type: 'string', description: 'Subject line' },
        body: { type: 'string', description: 'Plain-text body' },
        cc: { type: 'string', description: 'CC recipients (optional)' },
        bcc: { type: 'string', description: 'BCC recipients (optional)' },
      },
      required: ['email', 'to', 'subject', 'body'],
    },
  },
  {
    name: 'list_labels',
    description: 'List all Gmail labels for an account.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail account' },
      },
      required: ['email'],
    },
  },
  {
    name: 'add_label',
    description: 'Add one or more labels to an email.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail account' },
        message_id: { type: 'string', description: 'Email message ID' },
        label_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Label IDs to add',
        },
      },
      required: ['email', 'message_id', 'label_ids'],
    },
  },
  {
    name: 'remove_label',
    description: 'Remove one or more labels from an email.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail account' },
        message_id: { type: 'string', description: 'Email message ID' },
        label_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Label IDs to remove',
        },
      },
      required: ['email', 'message_id', 'label_ids'],
    },
  },
  {
    name: 'archive_email',
    description: 'Archive an email by removing it from the inbox.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail account' },
        message_id: { type: 'string', description: 'Email message ID' },
      },
      required: ['email', 'message_id'],
    },
  },
  {
    name: 'mark_as_read',
    description: 'Mark an email as read.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail account' },
        message_id: { type: 'string', description: 'Email message ID' },
      },
      required: ['email', 'message_id'],
    },
  },
  {
    name: 'mark_as_unread',
    description: 'Mark an email as unread.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Gmail account' },
        message_id: { type: 'string', description: 'Email message ID' },
      },
      required: ['email', 'message_id'],
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
        text = accounts.length
          ? `Authenticated Gmail accounts:\n${accounts.map(a => `  • ${a}`).join('\n')}`
          : 'No Gmail accounts authenticated yet. Use initiate_auth to add one.';
        break;
      }

      case 'initiate_auth': {
        const { email } = args;
        if (pendingSessions.has(email)) {
          const existing = pendingSessions.get(email);
          text =
            `Authentication already in progress for ${email}.\n\n` +
            `Please open this URL if you haven't already:\n${existing.authUrl}\n\n` +
            `Then call complete_auth with email: ${email}`;
          break;
        }
        const session = await initiateAuth();
        pendingSessions.set(email, session);
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
        storeTokens(email, tokens);
        pendingSessions.delete(email);
        text = `Successfully authenticated ${email}!`;
        break;
      }

      case 'remove_account': {
        removeAccount(args.email);
        text = `Removed account: ${args.email}`;
        break;
      }

      case 'search_emails': {
        const results = await searchEmails(args.email, args.query, args.max_results);
        if (!results.length) {
          text = 'No emails found matching your query.';
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
        const msg = await getEmail(args.email, args.message_id);
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
        const sent = await sendEmail(args.email, {
          to: args.to,
          subject: args.subject,
          body: args.body,
          cc: args.cc,
          bcc: args.bcc,
        });
        text = `Email sent. Message ID: ${sent.id}`;
        break;
      }

      case 'reply_to_email': {
        const replied = await replyToEmail(args.email, args.message_id, args.body);
        text = `Reply sent. Message ID: ${replied.id}`;
        break;
      }

      case 'create_draft': {
        const draft = await createDraft(args.email, {
          to: args.to,
          subject: args.subject,
          body: args.body,
          cc: args.cc,
          bcc: args.bcc,
        });
        text = `Draft created. Draft ID: ${draft.id}`;
        break;
      }

      case 'list_labels': {
        const labels = await listLabels(args.email);
        text = labels.map(l => `${l.name}  (ID: ${l.id})`).join('\n');
        break;
      }

      case 'add_label': {
        await modifyLabels(args.email, args.message_id, args.label_ids, []);
        text = `Labels added to message ${args.message_id}.`;
        break;
      }

      case 'remove_label': {
        await modifyLabels(args.email, args.message_id, [], args.label_ids);
        text = `Labels removed from message ${args.message_id}.`;
        break;
      }

      case 'archive_email': {
        await modifyLabels(args.email, args.message_id, [], ['INBOX']);
        text = `Message ${args.message_id} archived.`;
        break;
      }

      case 'mark_as_read': {
        await modifyLabels(args.email, args.message_id, [], ['UNREAD']);
        text = `Message ${args.message_id} marked as read.`;
        break;
      }

      case 'mark_as_unread': {
        await modifyLabels(args.email, args.message_id, ['UNREAD'], []);
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
