import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestResult,
  OpenClawConnectionState,
  OpenClawConnectionStatus,
} from "./types/agent.js";

const OPENCLAW_CONNECTION_CHECK_PRIORITY: ReadonlyArray<{
  status: OpenClawConnectionStatus;
  codes: readonly string[];
}> = [
  { status: "connected", codes: ["openclaw_gateway_probe_ok"] },
  { status: "invalid_token", codes: ["openclaw_gateway_invalid_token"] },
  { status: "pairing_required", codes: ["openclaw_gateway_pairing_required"] },
  {
    status: "unreachable",
    codes: [
      "openclaw_gateway_unreachable",
      "openclaw_gateway_probe_failed",
      "openclaw_gateway_probe_error",
    ],
  },
  {
    status: "not_configured",
    codes: ["openclaw_gateway_url_missing", "openclaw_gateway_auth_missing"],
  },
];

type OpenClawEnvironmentResult = Pick<
  AdapterEnvironmentTestResult,
  "status" | "checks" | "testedAt"
>;

function findPrioritizedOpenClawCheck(
  result: OpenClawEnvironmentResult,
): { check: AdapterEnvironmentCheck; status: OpenClawConnectionStatus } | null {
  for (const candidate of OPENCLAW_CONNECTION_CHECK_PRIORITY) {
    const match = result.checks.find((check) => candidate.codes.includes(check.code));
    if (match) {
      return { check: match, status: candidate.status };
    }
  }

  return null;
}

export function normalizeOpenClawConnectionState(
  result: OpenClawEnvironmentResult,
): OpenClawConnectionState {
  const match = findPrioritizedOpenClawCheck(result);

  return {
    status: match?.status ?? (
      result.status === "pass" || result.status === "warn" ? "connected" : "unreachable"
    ),
    checkedAt:
      typeof result.testedAt === "string" ? result.testedAt : new Date().toISOString(),
    message: match?.check.message ?? null,
  };
}
