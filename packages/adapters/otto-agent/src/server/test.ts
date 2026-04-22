import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

function summarizeStatus(
  checks: AdapterEnvironmentCheck[],
): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const url = asString(config.url, "").trim();

  if (!url) {
    checks.push({
      code: "otto_agent_url_missing",
      level: "error",
      message: "No gateway URL configured.",
      hint: "Set adapterConfig.url to your Otto Agent HTTPS endpoint. Contact your Otto operator for credentials.",
    });
    return {
      adapterType: ctx.adapterType,
      status: "fail",
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    checks.push({
      code: "otto_agent_url_invalid",
      level: "error",
      message: `Invalid URL: ${url}`,
    });
    return {
      adapterType: ctx.adapterType,
      status: "fail",
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    checks.push({
      code: "otto_agent_url_protocol_invalid",
      level: "error",
      message: `Unsupported URL protocol: ${parsed.protocol}`,
      hint: "Use https:// for remote Otto Agent gateways.",
    });
  } else {
    checks.push({
      code: "otto_agent_url_ok",
      level: "info",
      message: `Gateway URL configured.`,
    });

    if (
      parsed.protocol === "http:" &&
      !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
    ) {
      checks.push({
        code: "otto_agent_url_plaintext",
        level: "error",
        message: "Plaintext HTTP is not permitted for remote Otto Agent gateways.",
        hint: "Use https:// — credentials sent over plaintext HTTP are not secure.",
      });
    }
  }

  const apiKey = asString(config.apiKey, "").trim();
  if (!apiKey) {
    checks.push({
      code: "otto_agent_apikey_missing",
      level: "error",
      message: "No API key configured.",
      hint: "Set adapterConfig.apiKey to the Bearer token issued by your Otto operator.",
    });
  } else {
    checks.push({
      code: "otto_agent_apikey_ok",
      level: "info",
      message: "API key configured.",
    });
  }

  const hasErrors = checks.some((c) => c.level === "error");
  if (!hasErrors) {
    try {
      const healthUrl = url.replace(/\/api\/paperclip\/?$/, "/health").replace(/\/$/, "") || url;
      const res = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        checks.push({
          code: "otto_agent_gateway_reachable",
          level: "info",
          message: `Gateway responded with HTTP ${res.status}.`,
        });
      } else {
        checks.push({
          code: "otto_agent_gateway_error",
          level: "warn",
          message: `Gateway responded with HTTP ${res.status}.`,
          hint: "Verify the URL and that the Otto Agent gateway is running.",
        });
      }
    } catch (err) {
      checks.push({
        code: "otto_agent_gateway_unreachable",
        level: "warn",
        message: `Could not reach gateway: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Verify the URL, firewall rules, and that the Otto Agent gateway is running.",
      });
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
