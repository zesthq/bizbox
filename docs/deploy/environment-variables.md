---
title: Environment Variables
summary: Full environment variable reference
---

All environment variables that Bizbox uses for server configuration.

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `BIZBOX_BIND` | `loopback` | Reachability preset: `loopback`, `lan`, `tailnet`, or `custom` |
| `BIZBOX_BIND_HOST` | (unset) | Required when `BIZBOX_BIND=custom` |
| `HOST` | `127.0.0.1` | Legacy host override; prefer `BIZBOX_BIND` for new setups |
| `DATABASE_URL` | (embedded) | PostgreSQL connection string |
| `BIZBOX_HOME` | `~/.paperclip` | Base directory for all Bizbox data |
| `BIZBOX_INSTANCE_ID` | `default` | Instance identifier (for multiple local instances) |
| `BIZBOX_DEPLOYMENT_MODE` | `local_trusted` | Runtime mode override |
| `BIZBOX_DEPLOYMENT_EXPOSURE` | `private` | Exposure policy when deployment mode is `authenticated` |
| `BIZBOX_API_URL` | (auto-derived) | Bizbox API base URL. When set externally (e.g., via Kubernetes ConfigMap, load balancer, or reverse proxy), the server preserves the value instead of deriving it from the listen host and port. Useful for deployments where the public-facing URL differs from the local bind address. |

## Secrets

| Variable | Default | Description |
|----------|---------|-------------|
| `BIZBOX_SECRETS_MASTER_KEY` | (from file) | 32-byte encryption key (base64/hex/raw) |
| `BIZBOX_SECRETS_MASTER_KEY_FILE` | `~/.paperclip/.../secrets/master.key` | Path to key file |
| `BIZBOX_SECRETS_STRICT_MODE` | `false` | Require secret refs for sensitive env vars |

## Agent Runtime (Injected into agent processes)

These are set automatically by the server when invoking agents:

| Variable | Description |
|----------|-------------|
| `BIZBOX_AGENT_ID` | Agent's unique ID |
| `BIZBOX_COMPANY_ID` | Company ID |
| `BIZBOX_API_URL` | Bizbox API base URL (inherits the server-level value; see Server Configuration above) |
| `BIZBOX_API_KEY` | Short-lived JWT for API auth |
| `BIZBOX_RUN_ID` | Current heartbeat run ID |
| `BIZBOX_TASK_ID` | Issue that triggered this wake |
| `BIZBOX_WAKE_REASON` | Wake trigger reason |
| `BIZBOX_WAKE_COMMENT_ID` | Comment that triggered this wake |
| `BIZBOX_APPROVAL_ID` | Resolved approval ID |
| `BIZBOX_APPROVAL_STATUS` | Approval decision |
| `BIZBOX_LINKED_ISSUE_IDS` | Comma-separated linked issue IDs |

## LLM Provider Keys (for adapters)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude Local adapter) |
| `OPENAI_API_KEY` | OpenAI API key (for Codex Local adapter) |
