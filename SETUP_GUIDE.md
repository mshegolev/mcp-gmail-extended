# Setup Guide — Multi-Gmail MCP

This guide walks you through installing and configuring the Multi-Gmail MCP server so Claude Desktop can access all your Gmail accounts.

**Total setup time: ~10 minutes**

---

## What You'll Need

- Node.js 22.5 or later — check with `node --version` ([download here](https://nodejs.org))
- Claude Desktop installed
- A Google account (Gmail)

---

## Step 1 — Install the Package

```bash
npm install -g multi-gmail-mcp
```

Verify it installed correctly:

```bash
gmail-mcp-cli list
# No authenticated accounts.
```

---

## Step 2 — Google Cloud Setup

You need to create your own Google Cloud credentials. This is a one-time process and takes about 5 minutes.

### 2a — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project** → **New Project**
3. Name it anything (e.g. `my-gmail-mcp`) → **Create**

### 2b — Enable the Gmail API

1. Go to **APIs & Services** → **Library**
2. Search for **Gmail API** → click it → **Enable**

### 2c — Configure the OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** → **Create**
3. Fill in:
   - App name: `Gmail MCP` (anything works)
   - User support email: your Gmail address
   - Developer contact: your Gmail address
4. Click **Save and Continue**
5. On the **Scopes** page click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.labels`
6. Click **Save and Continue**
7. On the **Test Users** page → **Add Users** → add all Gmail addresses you want to use
8. Click **Save and Continue** → **Back to Dashboard**

### 2d — Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Desktop app**
4. Name: `Gmail MCP` → **Create**
5. Click **Download JSON**
6. Save the downloaded file to your home directory as:

```bash
mv ~/Downloads/client_secret_*.json ~/.gmail-mcp-oauth.json
```

---

## Step 3 — Authenticate Your Gmail Accounts

Run this for each Gmail account you want Claude to access:

```bash
gmail-mcp-cli add personal@gmail.com --label personal
gmail-mcp-cli add work@company.com --label work
```

Each command opens your browser to Google's sign-in page. After you sign in, the tokens are saved automatically.

Verify your accounts are registered:

```bash
gmail-mcp-cli list
# Account map:
#   [personal]   → personal@gmail.com
#   [work]       → work@company.com
```

> **Tip:** Labels let Claude understand "check my work inbox" vs "reply from personal" — always set them.

---

## Step 4 — Configure Claude Desktop

Open your Claude Desktop config file:

```bash
open "~/Library/Application Support/Claude/claude_desktop_config.json"
```

Add the `multi-gmail` entry inside `mcpServers`:

```json
{
  "mcpServers": {
    "multi-gmail": {
      "command": "gmail-mcp"
    }
  }
}
```

If you already have other MCP servers, just add the `"multi-gmail"` block alongside them.

**Restart Claude Desktop.**

---

## Step 5 — Verify It's Working

Click the **hammer icon** in Claude Desktop. You should see **17 tools** listed under `multi-gmail`.

Try this prompt:

```
List my Gmail accounts.
```

Claude should respond with your account map. Then try:

```
Search my work inbox for unread emails from this week.
```

---

## Managing Accounts

```bash
# List all authenticated accounts
gmail-mcp-cli list

# Add a new account
gmail-mcp-cli add another@gmail.com --label startup

# Update a label
gmail-mcp-cli label another@gmail.com side-project

# Remove an account
gmail-mcp-cli remove another@gmail.com
```

---

## Example Prompts

```
Use my work account for this conversation.
```
```
Search my personal inbox for emails from Amazon this month.
```
```
Reply to that email from my work account saying I'll follow up tomorrow.
```
```
Draft an email from my startup account to investor@vc.com with subject "Quick update".
```
```
Archive everything older than 2 weeks in my work inbox that's already read.
```
```
Check all my accounts are authenticated before we start.
```

---

## Troubleshooting

**"No OAuth credentials found"**
Make sure `~/.gmail-mcp-oauth.json` exists. Re-download it from Google Cloud Console → Credentials if needed.

**"Account not found. Authenticate it first"**
Run `gmail-mcp-cli add your@gmail.com` for that account before using it in Claude.

**"Token is invalid or has been revoked"**
Re-authenticate the affected account:
```bash
gmail-mcp-cli remove your@gmail.com
gmail-mcp-cli add your@gmail.com --label yourlabel
```

**Tools not showing in Claude Desktop**
- Confirm `gmail-mcp` is in your PATH: `which gmail-mcp`
- Check the config file is valid JSON
- Restart Claude Desktop fully (Quit, not just close)

**"This app isn't verified" warning from Google**
Click **Advanced** → **Go to Gmail MCP (unsafe)** — this is expected for personal OAuth apps that haven't gone through Google's verification process.

---

## Security

- Your Google credentials (`~/.gmail-mcp-oauth.json`) and tokens (`~/.gmail-mcp-tokens.db`) are stored only on your machine
- No data is sent to any third-party server — all API calls go directly from your machine to Google
- The MCP server runs locally over stdio — no network port is opened
- OAuth scopes are the minimum required: read, send, modify, labels

---

## Support

- GitHub Issues: [github.com/gx-55/multi-gmail-mcp/issues](https://github.com/gx-55/multi-gmail-mcp/issues)
- npm: [npmjs.com/package/multi-gmail-mcp](https://www.npmjs.com/package/multi-gmail-mcp)
