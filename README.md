# multi-gmail-mcp

A custom [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets **Claude Desktop manage multiple Gmail accounts** simultaneously. Built in JavaScript using the official MCP SDK and the Google Gmail API.

---

## Features

- Authenticate and manage **multiple Gmail accounts** (personal, work, etc.)
- **Search** emails using full Gmail search syntax
- **Read** full email content with MIME parsing
- **Send** emails, **reply** in thread, and **create drafts**
- **Organize** with labels: add, remove, list
- **Archive**, **mark as read/unread**
- Tokens stored securely in a local SQLite database (`~/.gmail-mcp-tokens.db`) — never committed to git
- Auto-refreshes OAuth tokens when they expire

---

## Requirements

- Node.js >= 22.5.0
- A Google Cloud project with the Gmail API enabled
- Claude Desktop

---

## Installation

```bash
git clone https://github.com/your-username/multi-gmail-mcp.git
cd multi-gmail-mcp
npm install
```

---

## Google Cloud Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project
2. Enable the **Gmail API** (APIs & Services → Library → search "Gmail API")
3. Configure the **OAuth consent screen**:
   - User type: External
   - Add scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`, `gmail.labels`
   - Add your Gmail addresses as test users
4. Create **OAuth credentials**:
   - Credentials → Create Credentials → OAuth client ID
   - Application type: **Desktop app**
   - Download the JSON file
5. Save the downloaded file as `~/.gmail-mcp-oauth.json`

Alternatively, export the credentials as environment variables in the Claude Desktop config (see below).

---

## Authenticating Gmail Accounts

Use the CLI to authenticate accounts **before** using Claude Desktop. This opens a browser window for Google sign-in.

```bash
# List currently authenticated accounts
node src/cli.js list

# Add a Gmail account (opens browser)
node src/cli.js add you@gmail.com
node src/cli.js add work@company.com

# Remove an account
node src/cli.js remove you@gmail.com
```

Tokens are saved to `~/.gmail-mcp-tokens.db` automatically and refreshed on each use.

---

## Claude Desktop Configuration

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "multi-gmail": {
      "command": "node",
      "args": ["/absolute/path/to/multi-gmail-mcp/src/server.js"]
    }
  }
}
```

If you prefer environment variables over `~/.gmail-mcp-oauth.json`:

```json
{
  "mcpServers": {
    "multi-gmail": {
      "command": "node",
      "args": ["/absolute/path/to/multi-gmail-mcp/src/server.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id.apps.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

Restart Claude Desktop after saving. You should see the hammer icon with 15 tools available.

---

## Available MCP Tools

### Account Management

| Tool | Description |
|---|---|
| `list_accounts` | List all authenticated Gmail accounts |
| `initiate_auth` | Start OAuth flow — returns a URL to open in browser |
| `complete_auth` | Finalize auth after completing Google sign-in |
| `remove_account` | Remove an account and its stored credentials |

### Reading Email

| Tool | Description |
|---|---|
| `search_emails` | Search with Gmail syntax (`is:unread`, `from:`, `after:`, etc.) |
| `get_email` | Fetch full email content by message ID |

### Writing Email

| Tool | Description |
|---|---|
| `send_email` | Send an email (supports To, CC, BCC) |
| `reply_to_email` | Reply in thread, preserving References headers |
| `create_draft` | Save an email as a draft |

### Organization

| Tool | Description |
|---|---|
| `list_labels` | List all Gmail labels for an account |
| `add_label` | Add one or more labels to a message |
| `remove_label` | Remove one or more labels from a message |
| `archive_email` | Remove from Inbox (equivalent to archiving) |
| `mark_as_read` | Remove the UNREAD label |
| `mark_as_unread` | Add the UNREAD label |

---

## Example Prompts for Claude Desktop

```
List all my authenticated Gmail accounts.
```

```
Search my work@company.com inbox for unread emails from this week.
```

```
Show me the full content of that last email.
```

```
Send an email from personal@gmail.com to friend@example.com
with subject "Dinner plans" and body "Are you free Saturday?"
```

```
Reply to that email from my work account saying I'll review it tomorrow.
```

```
Check both my accounts for any emails from GitHub and archive them.
```

---

## Security

- OAuth credentials (`~/.gmail-mcp-oauth.json`) and token database (`~/.gmail-mcp-tokens.db`) live in your home directory and are **never committed to git**
- The `.gitignore` excludes `*.db`, `.gmail-mcp-oauth.json`, and `.env`
- Tokens are refreshed automatically and stored only locally
- The MCP server communicates over stdio — no network port is opened

---

## Project Structure

```
multi-gmail-mcp/
├── package.json
└── src/
    ├── server.js         # MCP server — defines and handles all 15 tools
    ├── gmail-client.js   # Gmail API wrapper (search, send, reply, labels)
    ├── auth.js           # OAuth2 flow with auto-refresh
    ├── db.js             # SQLite token storage using node:sqlite
    └── cli.js            # CLI helper for pre-authenticating accounts
```

---

## Troubleshooting

**"No OAuth credentials found"**  
Make sure `~/.gmail-mcp-oauth.json` exists or `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` env vars are set in the Claude Desktop config.

**"Account not found. Authenticate it first"**  
Run `node src/cli.js add your@gmail.com` before using that account in Claude.

**Tools not appearing in Claude Desktop**  
Check that the absolute path in `claude_desktop_config.json` is correct and restart Claude Desktop.

**Token expired errors**  
Tokens auto-refresh if a valid `refresh_token` is stored. If refresh fails, remove the account and re-authenticate via the CLI.
