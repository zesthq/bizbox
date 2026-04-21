<p align="center">
  <img src="doc/assets/header.png" alt="Bizbox — enterprise AI agent orchestration" width="720" />
</p>

<p align="center">
  <a href="#quickstart"><strong>Quickstart</strong></a> &middot;
  <a href="https://github.com/zesthq/bizbox"><strong>GitHub</strong></a>
</p>

<p align="center">
  <a href="https://github.com/zesthq/bizbox/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" /></a>
  <a href="https://github.com/zesthq/bizbox/stargazers"><img src="https://img.shields.io/github/stars/zesthq/bizbox?style=flat" alt="Stars" /></a>
</p>

<br/>

<div align="center">
  <video src="https://github.com/user-attachments/assets/773bdfb2-6d1e-4e30-8c5f-3487d5b70c8f" width="600" controls></video>
</div>

<br/>

## What is Bizbox?

# Enterprise-grade orchestration for AI-powered organizations

**If OpenClaw is an _employee_, Bizbox is the _company_**

Bizbox is an open-source, self-hosted Node.js server and React UI that orchestrates a team of AI agents to run a business — built with enterprise teams in mind. Bring your own agents, assign goals, and track your agents' work and costs from one secure, auditable dashboard.

It looks like a task manager — but under the hood it has org charts, budgets, governance, goal alignment, agent coordination, and the audit trails enterprises need.

**Manage business goals, not pull requests.**

|        | Step            | Example                                                            |
| ------ | --------------- | ------------------------------------------------------------------ |
| **01** | Define the goal | _"Build the #1 AI note-taking app to $1M MRR."_                    |
| **02** | Hire the team   | CEO, CTO, engineers, designers, marketers — any bot, any provider. |
| **03** | Approve and run | Review strategy. Set budgets. Hit go. Monitor from the dashboard.  |

<br/>

> **COMING SOON: Bizmart** — Download and run entire companies with one click. Browse pre-built company templates — full org structures, agent configs, and skills — and import them into your Bizbox instance in seconds.

<br/>

<div align="center">
<table>
  <tr>
    <td align="center"><strong>Works<br/>with</strong></td>
    <td align="center"><img src="doc/assets/logos/openclaw.svg" width="32" alt="OpenClaw" /><br/><sub>OpenClaw</sub></td>
    <td align="center"><img src="doc/assets/logos/claude.svg" width="32" alt="Claude" /><br/><sub>Claude Code</sub></td>
    <td align="center"><img src="doc/assets/logos/codex.svg" width="32" alt="Codex" /><br/><sub>Codex</sub></td>
    <td align="center"><img src="doc/assets/logos/cursor.svg" width="32" alt="Cursor" /><br/><sub>Cursor</sub></td>
    <td align="center"><img src="doc/assets/logos/bash.svg" width="32" alt="Bash" /><br/><sub>Bash</sub></td>
    <td align="center"><img src="doc/assets/logos/http.svg" width="32" alt="HTTP" /><br/><sub>HTTP</sub></td>
  </tr>
</table>

<em>If it can receive a heartbeat, it's hired.</em>

</div>

<br/>

## Bizbox is right for you if

- ✅ You want to run **autonomous AI companies** in an **enterprise environment**
- ✅ You need **audit trails, governance, and cost controls** that meet organizational standards
- ✅ You **coordinate many different agents** (OpenClaw, Codex, Claude, Cursor) toward a common goal
- ✅ You have **20 simultaneous Claude Code terminals** open and lose track of what everyone is doing
- ✅ You want agents running **autonomously 24/7**, but still want to audit work and chime in when needed
- ✅ You want to **monitor costs** and enforce budgets
- ✅ You want a process for managing agents that **feels like using a task manager**
- ✅ You want to manage your autonomous businesses **from your phone**
- ✅ You need **complete data isolation** between teams or business units

<br/>

## Features

<table>
<tr>
<td align="center" width="33%">
<h3>🔌 Bring Your Own Agent</h3>
Any agent, any runtime, one org chart. If it can receive a heartbeat, it's hired.
</td>
<td align="center" width="33%">
<h3>🎯 Goal Alignment</h3>
Every task traces back to the company mission. Agents know <em>what</em> to do and <em>why</em>.
</td>
<td align="center" width="33%">
<h3>💓 Heartbeats</h3>
Agents wake on a schedule, check work, and act. Delegation flows up and down the org chart.
</td>
</tr>
<tr>
<td align="center">
<h3>💰 Cost Control</h3>
Monthly budgets per agent. When they hit the limit, they stop. No runaway costs.
</td>
<td align="center">
<h3>🏢 Multi-Company</h3>
One deployment, many companies. Complete data isolation. One control plane for your portfolio.
</td>
<td align="center">
<h3>🎫 Ticket System</h3>
Every conversation traced. Every decision explained. Full tool-call tracing and immutable audit log.
</td>
</tr>
<tr>
<td align="center">
<h3>🛡️ Governance</h3>
You're the board. Approve hires, override strategy, pause or terminate any agent — at any time.
</td>
<td align="center">
<h3>📊 Org Chart</h3>
Hierarchies, roles, reporting lines. Your agents have a boss, a title, and a job description.
</td>
<td align="center">
<h3>📱 Mobile Ready</h3>
Monitor and manage your autonomous businesses from anywhere.
</td>
</tr>
<tr>
<td align="center">
<h3>🔒 Enterprise Security</h3>
Self-hosted with no third-party data exposure. Full control over your infrastructure and data.
</td>
<td align="center">
<h3>📋 Immutable Audit Trails</h3>
Every agent action and board decision is logged. Meet compliance and oversight requirements.
</td>
<td align="center">
<h3>🏗️ On-Premise Deployment</h3>
Deploy on your own infrastructure — bare metal, VM, Docker, or Kubernetes. No vendor lock-in.
</td>
</tr>
</table>

<br/>

## Problems Bizbox solves

| Without Bizbox                                                                                                                     | With Bizbox                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ❌ You have 20 Claude Code tabs open and can't track which one does what. On reboot you lose everything.                              | ✅ Tasks are ticket-based, conversations are threaded, sessions persist across reboots.                                                |
| ❌ You manually gather context from several places to remind your bot what you're actually doing.                                     | ✅ Context flows from the task up through the project and company goals — your agent always knows what to do and why.                  |
| ❌ Folders of agent configs are disorganized and you're re-inventing task management, communication, and coordination between agents. | ✅ Bizbox gives you org charts, ticketing, delegation, and governance out of the box — so you run a company, not a pile of scripts. |
| ❌ Runaway loops waste hundreds of dollars of tokens and max your quota before you even know what happened.                           | ✅ Cost tracking surfaces token budgets and throttles agents when they're out. Management prioritizes with budgets.                    |
| ❌ You have recurring jobs (customer support, social, reports) and have to remember to manually kick them off.                        | ✅ Heartbeats handle regular work on a schedule. Management supervises.                                                                |
| ❌ You have an idea, you have to find your repo, fire up Claude Code, keep a tab open, and babysit it.                                | ✅ Add a task in Bizbox. Your coding agent works on it until it's done. Management reviews their work.                              |
| ❌ No audit trail when something goes wrong. No way to prove who authorized what.                                                     | ✅ Every action is logged in an immutable activity audit trail. Every agent action and board decision is traceable.                   |
| ❌ Sensitive company data leaves your infrastructure when using cloud-hosted AI orchestration tools.                                  | ✅ Fully self-hosted. Your data stays on your infrastructure. No external orchestration service has access.                           |

<br/>

## Why Bizbox is special

Bizbox handles the hard orchestration details correctly — and adds the enterprise-grade properties teams need.

|                                   |                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Atomic execution.**             | Task checkout and budget enforcement are atomic, so no double-work and no runaway spend.                      |
| **Persistent agent state.**       | Agents resume the same task context across heartbeats instead of restarting from scratch.                     |
| **Runtime skill injection.**      | Agents can learn Bizbox workflows and project context at runtime, without retraining.                      |
| **Governance with rollback.**     | Approval gates are enforced, config changes are revisioned, and bad changes can be rolled back safely.        |
| **Goal-aware execution.**         | Tasks carry full goal ancestry so agents consistently see the "why," not just a title.                        |
| **Portable company templates.**   | Export/import orgs, agents, and skills with secret scrubbing and collision handling.                          |
| **True multi-company isolation.** | Every entity is company-scoped, so one deployment can run many companies with separate data and audit trails. |
| **Immutable audit trail.**        | Every agent action and board decision is durably logged — enabling compliance, forensics, and oversight.      |
| **Self-hosted and air-gappable.** | Run on your own infrastructure with no external dependencies. Data never leaves your environment.             |

<br/>

## What Bizbox is not

|                              |                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Not a chatbot.**           | Agents have jobs, not chat windows.                                                                                  |
| **Not an agent framework.**  | We don't tell you how to build agents. We tell you how to run a company made of them.                                |
| **Not a workflow builder.**  | No drag-and-drop pipelines. Bizbox models companies — with org charts, goals, budgets, and governance.            |
| **Not a prompt manager.**    | Agents bring their own prompts, models, and runtimes. Bizbox manages the organization they work in.               |
| **Not a single-agent tool.** | This is for teams. If you have one agent, you probably don't need Bizbox. If you have twenty — you definitely do. |
| **Not a code review tool.**  | Bizbox orchestrates work, not pull requests. Bring your own review process.                                       |

<br/>

## Quickstart

Open source. Self-hosted. No Bizbox account required.

```bash
git clone https://github.com/zesthq/bizbox.git
cd bizbox
pnpm install
pnpm dev
```

This starts the API server at `http://localhost:3100`. An embedded PostgreSQL database is created automatically — no setup required.

> **Requirements:** Node.js 20+, pnpm 9.15+

### Authenticated / Enterprise Mode

For multi-user or network-accessible deployments:

```bash
pnpm dev --bind lan
# or for Tailscale:
pnpm dev --bind tailnet
```

See [doc/DOCKER.md](doc/DOCKER.md) for production Docker deployments and [doc/DEVELOPING.md](doc/DEVELOPING.md) for the full development guide.

<br/>

## Deploy To Fly

This fork includes a Fly configuration for the `bizbox` app in [fly.toml](fly.toml). Fly needs Paperclip to run in authenticated mode because the server binds to `0.0.0.0`; `local_trusted` is only valid for loopback/local desktop use.

If you want a private Fly deployment with no public HTTP service and plan to reach it via `fly proxy`, use [fly.private.toml](fly.private.toml) instead. It keeps the same app/runtime settings but omits `[http_service]`.

First-time setup:

```bash
cp .env.example .env
# edit .env and set ORG=your-fly-org
make bootstrap
```

That creates the Fly app, provisions Fly Postgres, creates the persistent `/paperclip` volume, and sets the required auth secret plus public URL. The Makefile now loads `.env`, requires `ORG` for Fly bootstrap steps, passes Fly's non-interactive flags, and skips resources that already exist, so it is safe to rerun after a partial setup. If `BETTER_AUTH_SECRET` is already present, bootstrap preserves it instead of rotating sessions.

Defaults:

| Make variable | Default |
| --- | --- |
| `APP` | `bizbox` |
| `DB` | `bizbox-db` |
| `ORG` | Required |
| `REGION` | `syd` |
| `DB_VOL_GB` | `10` |
| `VOLUME` | `paperclip_data` |
| `VOL_GB` | `10` |

Set `ORG` in `.env` for the easiest setup flow, or override variables inline when needed:

```bash
make bootstrap APP=my-paperclip ORG=my-fly-org
```

If you prefer to run the steps manually:

```bash
make fly-setup
make fly-db
make fly-volume
make fly-secrets
```

Deploy:

```bash
make deploy
# or deploy the private variant:
fly deploy --app bizbox --config fly.private.toml
```

After the first successful deploy, open the first instance admin invite:

```bash
make admin-invite
```

This runs `pnpm paperclipai auth bootstrap-ceo` inside the Fly machine via `fly ssh console` and prints a one-time invite URL. Open that URL in your browser to claim the first admin account. You only need this while the instance says `Instance setup required`.

If deploy reports that the app was not found, the Fly app has not been created in the current Fly account/org yet. Run `make bootstrap` once first. If the `bizbox` app name is unavailable or you already created a different app, update `APP` in [Makefile](Makefile) and `app`/`PAPERCLIP_PUBLIC_URL` in [fly.toml](fly.toml), then run `make bootstrap`.

The checked-in Fly configs use `https://bizbox.fly.dev` as an example `PAPERCLIP_PUBLIC_URL`. Change that value in [fly.toml](fly.toml) or [fly.private.toml](fly.private.toml) if your real Fly hostname or custom domain differs.

On first boot, Fly mounts the persistent `/paperclip` volume as root-owned storage. The Docker entrypoint fixes ownership before starting Paperclip as the unprivileged `node` user; if you see `EACCES` errors under `/paperclip`, rebuild and redeploy so the latest entrypoint is in the image.

Useful operational commands:

```bash
make status
make logs
make ssh
make secrets
```

Required Fly runtime settings:

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Required signing secret for authenticated mode. `make fly-secrets` generates this with `openssl rand -hex 32`. |
| `PAPERCLIP_PUBLIC_URL` | Canonical public URL, for example `https://bizbox.fly.dev`. Used for auth callbacks, invite links, and hostname allowlisting. |
| `PAPERCLIP_DEPLOYMENT_MODE` | Must be `authenticated` on Fly. |
| `PAPERCLIP_DEPLOYMENT_EXPOSURE` | Keep `private` unless you are intentionally configuring a public authenticated deployment. |
| `PAPERCLIP_HOME` | Persistent Paperclip data root. In Fly this is mounted at `/paperclip`. |
| `PAPERCLIP_MIGRATION_AUTO_APPLY` | Applies pending migrations at startup. Set to `true` for this single-app Fly deployment. |

If you change the Fly app name, update both `APP` in [Makefile](Makefile) and `app`/`PAPERCLIP_PUBLIC_URL` in [fly.toml](fly.toml), then rerun `make fly-secrets`.

<br/>

## FAQ

**What does a typical setup look like?**
Locally, a single Node.js process manages an embedded Postgres and local file storage. For production, point it at your own Postgres and deploy however you like. Configure projects, agents, and goals — the agents take care of the rest.

For enterprise deployments, use Docker Compose with an external PostgreSQL instance. See [doc/DOCKER.md](doc/DOCKER.md) for full deployment options.

**Can I run multiple companies?**
Yes. A single deployment can run an unlimited number of companies with complete data isolation.

**How is Bizbox different from agents like OpenClaw or Claude Code?**
Bizbox _uses_ those agents. It orchestrates them into a company — with org charts, budgets, goals, governance, and accountability.

**Why should I use Bizbox instead of just pointing my OpenClaw to Asana or Trello?**
Agent orchestration has subtleties in how you coordinate who has work checked out, how to maintain sessions, monitoring costs, establishing governance - Bizbox does this for you.

(Bring-your-own-ticket-system is on the Roadmap)

**Do agents run continuously?**
By default, agents run on scheduled heartbeats and event-based triggers (task assignment, @-mentions). You can also hook in continuous agents like OpenClaw. You bring your agent and Bizbox coordinates.

**Is Bizbox suitable for enterprise use?**
Yes. Bizbox is a fork of [paperclipai/paperclip](https://github.com/paperclipai/paperclip) with an emphasis on enterprise usability: self-hosted deployment, complete data isolation, immutable audit trails, multi-user governance, cost controls, and on-premise compatibility. The architecture keeps your data on your own infrastructure with no external orchestration service required.

<br/>

## Development

```bash
pnpm dev              # Full dev (API + UI, watch mode)
pnpm dev:once         # Full dev without file watching
pnpm dev:server       # Server only
pnpm build            # Build all
pnpm typecheck        # Type checking
pnpm test             # Cheap default test run (Vitest only)
pnpm test:watch       # Vitest watch mode
pnpm test:e2e         # Playwright browser suite
pnpm db:generate      # Generate DB migration
pnpm db:migrate       # Apply migrations
```

`pnpm test` does not run Playwright. Browser suites stay separate and are typically run only when working on those flows or in CI.

See [doc/DEVELOPING.md](doc/DEVELOPING.md) for the full development guide.

<br/>

## Roadmap

- ✅ Plugin system (e.g. add a knowledge base, custom tracing, queues, etc)
- ✅ Get OpenClaw / claw-style agent employees
- ✅ companies.sh - import and export entire organizations
- ✅ Easy AGENTS.md configurations
- ✅ Skills Manager
- ✅ Scheduled Routines
- ✅ Better Budgeting
- ✅ Agent Reviews and Approvals
- ✅ Multiple Human Users
- ✅ Immutable Audit Trails
- ✅ Multi-company data isolation
- ⚪ Enterprise SSO / SAML integration
- ⚪ Role-based access control (RBAC) for board operators
- ⚪ Cloud / Sandbox agents (e.g. Cursor / e2b agents)
- ⚪ Artifacts & Work Products
- ⚪ Memory / Knowledge
- ⚪ Enforced Outcomes
- ⚪ Deep Planning
- ⚪ Work Queues
- ⚪ Self-Organization
- ⚪ Automatic Organizational Learning
- ⚪ CEO Chat
- ⚪ Kubernetes / Helm deployment
- ⚪ Desktop App

This is the short roadmap preview. See the full roadmap in [ROADMAP.md](ROADMAP.md).

<br/>

## Community & Plugins

Find plugins and extensions on [GitHub](https://github.com/zesthq/bizbox).

## Telemetry

Bizbox collects anonymous usage telemetry to help improve the product. No personal information, issue content, prompts, file paths, or secrets are ever collected. Private repository references are hashed with a per-install salt before being sent.

Telemetry is **enabled by default** and can be disabled with any of the following:

| Method               | How                                                     |
| -------------------- | ------------------------------------------------------- |
| Environment variable | `PAPERCLIP_TELEMETRY_DISABLED=1`                        |
| Standard convention  | `DO_NOT_TRACK=1`                                        |
| CI environments      | Automatically disabled when `CI=true`                   |
| Config file          | Set `telemetry.enabled: false` in your Bizbox config |

## Contributing

We welcome contributions. See the [contributing guide](CONTRIBUTING.md) for details.

<br/>

## Enterprise

Bizbox is designed for enterprise deployments:

- **Self-hosted** — deploy on your own infrastructure, no vendor lock-in
- **Docker-ready** — production Docker Compose with PostgreSQL, health checks, and volume persistence
- **On-premise compatible** — no required external network dependencies
- **Audit trails** — every agent action and board decision is logged
- **Data isolation** — complete company-level data separation in a single deployment
- **Cost controls** — hard budget limits prevent runaway agent spend
- **Governance** — approval gates for agent hires, strategy, and board overrides

See [doc/DOCKER.md](doc/DOCKER.md) for enterprise deployment guides.

<br/>

## Community

- [GitHub Issues](https://github.com/zesthq/bizbox/issues) — bugs and feature requests
- [GitHub Discussions](https://github.com/zesthq/bizbox/discussions) — ideas and RFC

<br/>

## About

Bizbox is a fork of [paperclipai/paperclip](https://github.com/paperclipai/paperclip), rebranded and extended for enterprise use by [Zest](https://github.com/zesthq).

<br/>

## License

MIT &copy; 2026 Bizbox / Zest

[![Star History Chart](https://api.star-history.com/image?repos=zesthq/bizbox&type=date&legend=top-left)](https://www.star-history.com/?repos=zesthq%2Fbizbox&type=date&legend=top-left)

<br/>

---

<p align="center">
  <img src="doc/assets/footer.jpg" alt="" width="720" />
</p>

<p align="center">
  <sub>Open source under MIT. Built for enterprises that want to run companies, not babysit agents.</sub>
</p>
