# Manage All Your Gmail Accounts Inside Claude Desktop — Now on the Official MCP Registry

> One AI assistant. Every inbox. Three commands to set up.

---

## The Problem

Claude Desktop's built-in Gmail connector only works with one Google account. If you have a personal inbox, a work account, and a side project address — you're constantly switching tabs, copy-pasting, and losing the conversational flow that makes Claude worth using in the first place.

I built a fix: a custom MCP server that gives Claude access to all your Gmail accounts simultaneously. It's now listed on the **official Anthropic MCP registry** and published on npm, so setup takes about 10 minutes.

---

## What It Does

Once installed, Claude gains 15 tools across four categories:

**Reading** — search any inbox using full Gmail syntax (`is:unread`, `from:`, `after:`, `has:attachment`), fetch complete email content

**Writing** — send emails, reply in thread (with correct headers), create drafts

**Organizing** — add/remove labels, archive, mark as read/unread

**Account management** — authenticate and switch between unlimited Gmail accounts

Every tool takes an `email` parameter, so Claude always knows which account to act on. You can mix accounts in a single conversation.

---

## Setup in 10 Minutes

### Step 1 — Install the package

```bash
npm install -g multi-gmail-mcp
```

That's it for the code. Two global commands are now available: `gmail-mcp` (the server) and `gmail-mcp-cli` (account manager).

### Step 2 — Google Cloud credentials

This is the only manual step, and you only do it once.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project
2. Enable the **Gmail API** (APIs & Services → Library)
3. Configure the **OAuth consent screen** — External, add your Gmail addresses as test users
4. Add scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`, `gmail.labels`
5. Create a **Desktop app** OAuth credential → download the JSON
6. Save it to `~/.gmail-mcp-oauth.json`

### Step 3 — Authenticate your Gmail accounts

```bash
gmail-mcp-cli add personal@gmail.com
gmail-mcp-cli add work@company.com
gmail-mcp-cli add side-project@gmail.com
```

Each command opens your browser to Google's consent screen. After you sign in, tokens are saved locally to `~/.gmail-mcp-tokens.db`. You only do this once per account — tokens auto-refresh forever.

```bash
gmail-mcp-cli list
# Authenticated Gmail accounts:
#   • personal@gmail.com
#   • work@company.com
#   • side-project@gmail.com
```

### Step 4 — Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "multi-gmail": {
      "command": "gmail-mcp"
    }
  }
}
```

Restart Claude Desktop. You'll see a hammer icon — click it and confirm 15 tools are loaded. You're done.

---

## What It Looks Like in Practice

**Cross-account search:**
```
You: What's unread across all my inboxes from the last 24 hours?

Claude: Here's what I found:
  personal@gmail.com — 4 unread
    • GitHub: "PR #47 was merged" (2h ago)
    • Friend: "Dinner Saturday?" (5h ago)
    ...
  work@company.com — 7 unread
    • Boss: "Q2 review rescheduled" (1h ago)
    ...
```

**Reply from a specific account:**
```
You: Reply to the dinner email from my personal account — tell them I'm in.

Claude: Replied from personal@gmail.com.
  To: friend@example.com
  Subject: Re: Dinner Saturday?
```

**Bulk organize:**
```
You: Archive everything older than a week in my side-project inbox that's already read.

Claude: [searches, then archives] Done — archived 23 messages from side-project@gmail.com.
```

**Draft across accounts:**
```
You: Draft a follow-up to the Q2 review email from my work account.
     Keep it short — say I'll send the updated deck by Friday.

Claude: Draft saved in work@company.com.
  Subject: Re: Q2 review rescheduled
```

---

## Security

- Your credentials (`~/.gmail-mcp-oauth.json`) and tokens (`~/.gmail-mcp-tokens.db`) live in your home directory — never in the project, never committed to git
- The server communicates over **stdio only** — no network ports opened
- OAuth scopes are the minimum required: read, send, modify, labels
- Tokens are refreshed automatically and stored only on your machine

---

## Find It on the Official MCP Registry

The server is listed on the official Anthropic MCP registry:

**Registry:** `io.github.gx-55/multi-gmail-mcp`
**npm:** [npmjs.com/package/multi-gmail-mcp](https://www.npmjs.com/package/multi-gmail-mcp)
**GitHub:** [github.com/gx-55/multi-gmail-mcp](https://github.com/gx-55/multi-gmail-mcp)

Verify it directly:
```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.gx-55"
```

---

If you're juggling multiple Gmail accounts and want them all inside Claude, give it a try. Setup is 10 minutes. Issues and PRs welcome on GitHub.

---

*Follow for more Claude and MCP content.*
