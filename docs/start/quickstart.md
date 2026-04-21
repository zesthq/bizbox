---
title: Quickstart
summary: Get Bizbox running in minutes
---

Get Bizbox running locally in under 5 minutes.

## Quick Start (Recommended)

```sh
git clone https://github.com/zesthq/bizbox.git
cd bizbox
pnpm install
pnpm dev
```

This starts the API server and UI at [http://localhost:3100](http://localhost:3100).

No external database required — Bizbox uses an embedded PostgreSQL instance by default.

## Authenticated / Enterprise Mode

For multi-user, team, or network-accessible deployments:

```sh
pnpm dev --bind lan
```

For Tailscale-only reachability:

```sh
pnpm dev --bind tailnet
```

If you already have a Bizbox install, rerunning `onboard` keeps your current config and data paths intact.

## Production / Docker Deployment

For enterprise deployments with an external PostgreSQL database, see the [Docker deployment guide](/deploy/docker).

## What's Next

Once Bizbox is running:

1. Create your first company in the web UI
2. Define a company goal
3. Create a CEO agent and configure its adapter
4. Build out the org chart with more agents
5. Set budgets and assign initial tasks
6. Hit go — agents start their heartbeats and the company runs

<Card title="Core Concepts" href="/start/core-concepts">
  Learn the key concepts behind Bizbox
</Card>
