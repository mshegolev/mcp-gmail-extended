# Security

multi-gmail-mcp handles OAuth tokens for Gmail accounts. This document explains exactly what is stored, what permissions are requested, and how to revoke or report issues.

---

## Token Storage

| File | Location | Contents |
|------|----------|----------|
| `~/.gmail-mcp-oauth.json` | Your home directory | Google OAuth client ID and secret (your Google Cloud credentials) |
| `~/.gmail-mcp-tokens.db` | Your home directory | Per-account access tokens and refresh tokens (SQLite) |

**Both files live in your home directory, outside any project folder.** They are never committed to git — the project `.gitignore` explicitly excludes `*.db`, `.gmail-mcp-oauth.json`, and `.env`.

Tokens are stored in plaintext SQLite on disk, protected only by your OS filesystem permissions (mode `600` is recommended). No additional encryption is applied at rest — the same trust model as SSH keys or `~/.netrc`.

---

## Network Behavior

The server communicates with Claude Desktop exclusively over **stdio** (standard input/output). It opens **no TCP ports**, binds to **no sockets**, and makes **no inbound network connections**.

The only outbound network calls made by the server are:

- `oauth2.googleapis.com` — to refresh expired access tokens
- `gmail.googleapis.com` — to fulfill MCP tool requests (read threads, send mail, manage labels)

No telemetry, analytics, or crash-reporting endpoints are contacted. No data is forwarded to any third party other than Google.

---

## OAuth Scopes

The following Gmail API scopes are requested during account setup:

| Scope | Why it is needed |
|-------|-----------------|
| `https://www.googleapis.com/auth/gmail.readonly` | Read emails and threads |
| `https://www.googleapis.com/auth/gmail.send` | Send emails via Claude |
| `https://www.googleapis.com/auth/gmail.modify` | Archive, mark read/unread, move to trash |
| `https://www.googleapis.com/auth/gmail.labels` | Create and manage labels |

No other Google APIs (Drive, Calendar, Contacts, etc.) are requested or accessible through this tool.

---

## Revoking Access

To stop the tool from accessing a Gmail account:

**Option 1 — Remove the account locally:**
```bash
gmail-mcp-cli remove your@gmail.com
```
This deletes the stored tokens from `~/.gmail-mcp-tokens.db`.

**Option 2 — Revoke via Google (recommended for full removal):**

1. Go to [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
2. Find the app that matches your Google Cloud project name
3. Click **Remove Access**

This invalidates the tokens server-side even if local files are not deleted.

**Option 3 — Nuke everything:**
```bash
rm ~/.gmail-mcp-tokens.db ~/.gmail-mcp-oauth.json
```
Then revoke via Google as above.

---

## Threat Model

This tool is designed for single-user local use. It assumes:

- Your local machine and home directory are trusted
- Claude Desktop is a trusted process
- You manage your own Google Cloud OAuth credentials

It is **not** designed for multi-user environments, shared machines, or server deployments. Do not run it in those contexts without additional isolation.

---

## Reporting a Vulnerability

If you discover a security issue, please **do not open a public GitHub issue**.

Report privately via GitHub's security advisory feature:

1. Go to the repository on GitHub
2. Click **Security** → **Report a vulnerability**
3. Describe the issue, steps to reproduce, and potential impact

You can expect an acknowledgement within 72 hours. Please allow reasonable time for a fix before any public disclosure.
