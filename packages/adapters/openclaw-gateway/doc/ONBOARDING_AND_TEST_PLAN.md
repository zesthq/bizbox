# OpenClaw Gateway Onboarding and Test Plan

## Scope
This plan is now **gateway-only**. Paperclip supports OpenClaw through `openclaw_gateway` only.

- Removed path: legacy `openclaw` adapter (`/v1/responses`, `/hooks/*`, SSE/webhook transport switching)
- Supported path: `openclaw_gateway` over WebSocket (`ws://` or `wss://`)

## Requirements
1. OpenClaw test image must be stock/clean every run.
2. Onboarding must work from one primary prompt pasted into OpenClaw (optional one follow-up ping allowed).
3. Token-only cloud-first setup is the default; pairing is available only as an advanced/manual path.
4. Invite/access flow must be secure:
- invite prompt endpoint is board-permission protected
- CEO agent is allowed to invoke the invite prompt endpoint for their own company
5. E2E pass criteria must include the 3 functional task cases.

## Current Product Flow
1. Board/CEO opens company settings.
2. Click `Generate OpenClaw Invite Prompt`.
3. Paste generated prompt into OpenClaw chat.
4. OpenClaw submits invite acceptance with:
- `adapterType: "openclaw_gateway"`
- `agentDefaultsPayload.url: ws://... | wss://...`
- `agentDefaultsPayload.headers["x-openclaw-token"]`
 - `agentDefaultsPayload.disableDeviceAuth: true`
5. Board approves join request.
6. OpenClaw claims API key and installs/uses Paperclip skill.
7. Pairing is only expected for advanced/manual setups that explicitly enable device auth.

## Technical Contract (Gateway)
`agentDefaultsPayload` minimum:
```json
{
  "url": "ws://127.0.0.1:18789",
  "headers": { "x-openclaw-token": "<gateway-token>" },
  "disableDeviceAuth": true
}
```

Recommended fields:
```json
{
  "paperclipApiUrl": "http://host.docker.internal:3100",
  "waitTimeoutMs": 120000,
  "sessionKeyStrategy": "issue",
  "role": "operator",
  "scopes": ["operator.admin"]
}
```

Security/pairing defaults:
- `disableDeviceAuth`: default true
- `devicePrivateKeyPem`: only needed for explicit token + device pairing setups

## Codex Automation Workflow

### 0) Reset and boot
```bash
OPENCLAW_DOCKER_DIR=/tmp/openclaw-docker
if [ -d "$OPENCLAW_DOCKER_DIR" ]; then
  docker compose -f "$OPENCLAW_DOCKER_DIR/docker-compose.yml" down --remove-orphans || true
fi

docker image rm openclaw:local || true
OPENCLAW_RESET_STATE=1 OPENCLAW_BUILD=1 ./scripts/smoke/openclaw-docker-ui.sh
```

### 1) Start Paperclip
```bash
pnpm dev --bind lan
curl -fsS http://127.0.0.1:3100/api/health
```

### 2) Invite + join + approval
- create invite prompt via `POST /api/companies/:companyId/openclaw/invite-prompt`
- paste prompt to OpenClaw
- approve join request
- assert created agent:
  - `adapterType == openclaw_gateway`
  - token header exists and length >= 16
  - `disableDeviceAuth == true`

### 3) Advanced pairing stabilization
- for an explicit pairing-mode setup, if first run returns `pairing required`, approve pending device in OpenClaw
- rerun task and confirm success
- assert later runs do not require re-pairing for same agent

### 4) Functional E2E assertions
1. Task assigned to OpenClaw is completed and closed.
2. Task asking OpenClaw to send main-webchat message succeeds (message visible in main chat).
3. In `/new` OpenClaw session, OpenClaw can still create a Paperclip task.

## Manual Smoke Checklist
Use [doc/OPENCLAW_ONBOARDING.md](../../../../doc/OPENCLAW_ONBOARDING.md) as the operator runbook.

## Regression Gates
Required before merge:
```bash
pnpm -r typecheck
pnpm test:run
pnpm build
```

If full suite is too heavy locally, run at least:
```bash
pnpm --filter @paperclipai/server test:run -- openclaw-gateway
pnpm --filter @paperclipai/server typecheck
pnpm --filter @paperclipai/ui typecheck
pnpm --filter paperclipai typecheck
```
