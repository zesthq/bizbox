import type { ServerAdapterModule } from "@paperclipai/adapter-utils";
import { execute } from "./server/execute.js";
import { testEnvironment } from "./server/test.js";

export const type = "otto_agent";
export const label = "Otto Agent";

export const models: { id: string; label: string }[] = [
  { id: "copilot/claude-sonnet-4-5", label: "Claude Sonnet 4.5 (Copilot)" },
  { id: "copilot/claude-opus-4-5", label: "Claude Opus 4.5 (Copilot)" },
  { id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5 (Direct)" },
  { id: "anthropic/claude-opus-4-5", label: "Claude Opus 4.5 (Direct)" },
  { id: "openai/gpt-4o", label: "GPT-4o (Direct)" },
];

export const agentConfigurationDoc = `# otto_agent adapter configuration

Adapter: otto_agent

Use when:
- You want Paperclip to invoke a remote Otto Agent gateway over HTTPS.
- The Otto Agent instance is hosted separately from your Paperclip deployment.

Don't use when:
- You are running Hermes Agent locally (use hermes_local instead).
- You do not have an Otto Agent endpoint and API key provisioned.

To get an Otto Agent endpoint and credentials, contact your Otto operator.
Do not share your API key — it authenticates all requests to the gateway.

Core fields:
- url (string, required): HTTPS URL to the Otto gateway endpoint
- apiKey (string, required): Bearer token issued by your Otto operator

Optional fields:
- model (string, optional): LLM model override (e.g. "copilot/claude-sonnet-4-5")
- timeoutSec (number, optional): request timeout in seconds (default: 1800)
- toolsets (string, optional): comma-separated toolsets to enable on the gateway
- env (object, optional): extra environment variables forwarded to the gateway session

Session persistence:
- Otto returns a sessionId on each run; Paperclip stores and resends it automatically.
- Use sessionKeyStrategy: "issue" (default) to maintain one session per Paperclip issue.

Security notes:
- Always use https:// — plaintext HTTP will be rejected for non-loopback hosts.
- Never embed your API key in source code or commit it to version control.
- Set apiKey via your deployment secrets manager or environment variables.
`;

const adapter: ServerAdapterModule = {
  type,
  execute,
  testEnvironment,
  models,
  agentConfigurationDoc,
};

export { execute, testEnvironment };
export default adapter;
