import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import {
  asRecord,
  isLoopbackHost,
  nonEmpty,
  resolveAuthToken,
  toStringArray,
  toStringRecord,
} from "../shared/config.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function rawDataToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data)) {
    return Buffer.concat(
      data.map((entry) => (Buffer.isBuffer(entry) ? entry : Buffer.from(String(entry), "utf8"))),
    ).toString("utf8");
  }
  return String(data ?? "");
}

async function probeGateway(input: {
  url: string;
  headers: Record<string, string>;
  authToken: string | null;
  role: string;
  scopes: string[];
  timeoutMs: number;
}): Promise<
  | { kind: "ok" }
  | { kind: "pairing_required"; requestId: string | null; message: string | null }
  | { kind: "invalid_token"; code: string | null; message: string | null }
  | { kind: "unreachable"; message: string | null }
  | { kind: "failed"; message: string | null }
> {
  return await new Promise((resolve) => {
    const ws = new WebSocket(input.url, { headers: input.headers, maxPayload: 2 * 1024 * 1024 });
    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve({ kind: "unreachable", message: "Timed out while reaching the OpenClaw gateway." });
    }, input.timeoutMs);

    let completed = false;

    const finish = (
      status:
        | { kind: "ok" }
        | { kind: "pairing_required"; requestId: string | null; message: string | null }
        | { kind: "invalid_token"; code: string | null; message: string | null }
        | { kind: "unreachable"; message: string | null }
        | { kind: "failed"; message: string | null },
    ) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(status);
    };

    ws.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawDataToString(raw));
      } catch {
        return;
      }
      const event = asRecord(parsed);
      if (event?.type === "event" && event.event === "connect.challenge") {
        const nonce = nonEmpty(asRecord(event.payload)?.nonce);
        if (!nonce) {
          finish({ kind: "failed", message: "Gateway challenge response was missing a nonce." });
          return;
        }

        const connectId = randomUUID();
        ws.send(
          JSON.stringify({
            type: "req",
            id: connectId,
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: "gateway-client",
                version: "paperclip-probe",
                platform: process.platform,
                mode: "probe",
              },
              role: input.role,
              scopes: input.scopes,
              ...(input.authToken
                ? {
                    auth: {
                      token: input.authToken,
                    },
                  }
                : {}),
            },
          }),
        );
        return;
      }

      if (event?.type === "res") {
        if (event.ok === true) {
          finish({ kind: "ok" });
        } else {
          const errorRecord = asRecord(event.error);
          const errorDetails = asRecord(errorRecord?.details);
          const errorCode = nonEmpty(errorRecord?.code)?.toUpperCase() ?? null;
          const detailCode = nonEmpty(errorDetails?.code)?.toUpperCase() ?? null;
          const message = nonEmpty(errorRecord?.message) ?? null;
          const requestId = nonEmpty(errorDetails?.requestId);
          const pairingRequired =
            errorCode === "NOT_PAIRED" ||
            errorCode === "PAIRING_REQUIRED" ||
            detailCode === "PAIRING_REQUIRED" ||
            (message?.toLowerCase().includes("pairing required") ?? false);
          if (pairingRequired) {
            finish({ kind: "pairing_required", requestId, message });
            return;
          }
          finish({ kind: "invalid_token", code: errorCode ?? detailCode, message });
        }
      }
    });

    ws.on("error", (err) => {
      const errorCode =
        typeof (err as NodeJS.ErrnoException).code === "string"
          ? ((err as NodeJS.ErrnoException).code as string)
          : "";
      if (["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT", "ECONNRESET"].includes(errorCode)) {
        finish({ kind: "unreachable", message: err.message });
        return;
      }
      finish({ kind: "failed", message: err.message });
    });

    ws.on("close", () => {
      if (!completed) finish({ kind: "failed", message: "OpenClaw gateway closed the connection." });
    });
  });
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const urlValue = asString(config.url, "").trim();

  if (!urlValue) {
    checks.push({
      code: "openclaw_gateway_url_missing",
      level: "error",
      message: "OpenClaw gateway adapter requires a WebSocket URL.",
      hint: "Set adapterConfig.url to ws://host:port (or wss://).",
    });
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  let url: URL | null = null;
  try {
    url = new URL(urlValue);
  } catch {
    checks.push({
      code: "openclaw_gateway_url_invalid",
      level: "error",
      message: `Invalid URL: ${urlValue}`,
    });
  }

  if (url && url.protocol !== "ws:" && url.protocol !== "wss:") {
    checks.push({
      code: "openclaw_gateway_url_protocol_invalid",
      level: "error",
      message: `Unsupported URL protocol: ${url.protocol}`,
      hint: "Use ws:// or wss://.",
    });
  }

  if (url) {
    checks.push({
      code: "openclaw_gateway_url_valid",
      level: "info",
      message: `Configured gateway URL: ${url.toString()}`,
    });

    if (url.protocol === "ws:" && !isLoopbackHost(url.hostname)) {
      checks.push({
        code: "openclaw_gateway_plaintext_remote_ws",
        level: "warn",
        message: "Gateway URL uses plaintext ws:// on a non-loopback host.",
        hint: "Prefer wss:// for remote gateways.",
      });
    }
  }

  const headers = toStringRecord(config.headers);
  const authToken = resolveAuthToken(config, headers);
  const password = nonEmpty(config.password);
  const role = nonEmpty(config.role) ?? "operator";
  const scopes = toStringArray(config.scopes);

  if (authToken || password) {
    checks.push({
      code: "openclaw_gateway_auth_present",
      level: "info",
      message: "Gateway credentials are configured.",
    });
  } else {
    checks.push({
      code: "openclaw_gateway_auth_missing",
      level: "warn",
      message: "No gateway credentials detected in adapter config.",
      hint: "Set authToken/password or headers.x-openclaw-token for authenticated gateways.",
    });
  }

  if (url && (url.protocol === "ws:" || url.protocol === "wss:")) {
    try {
      const probeResult = await probeGateway({
        url: url.toString(),
        headers,
        authToken,
        role,
        scopes: scopes.length > 0 ? scopes : ["operator.admin"],
        timeoutMs: 3_000,
      });

      if (probeResult.kind === "ok") {
        checks.push({
          code: "openclaw_gateway_probe_ok",
          level: "info",
          message: "Gateway connect probe succeeded.",
        });
      } else if (probeResult.kind === "pairing_required") {
        checks.push({
          code: "openclaw_gateway_pairing_required",
          level: "warn",
          message: probeResult.message ?? "Gateway requires device pairing before the connection can be approved.",
          hint: probeResult.requestId
            ? `Approve pairing request ${probeResult.requestId} in OpenClaw, then retry.`
            : "Approve the pending device pairing in OpenClaw, then retry.",
        });
      } else if (probeResult.kind === "invalid_token") {
        checks.push({
          code: "openclaw_gateway_invalid_token",
          level: "error",
          message: probeResult.message ?? "OpenClaw rejected the gateway access token.",
          hint: "Verify the access token and retry the connection test.",
          ...(probeResult.code ? { detail: `Gateway code: ${probeResult.code}` } : {}),
        });
      } else if (probeResult.kind === "unreachable") {
        checks.push({
          code: "openclaw_gateway_unreachable",
          level: "error",
          message: probeResult.message ?? "Paperclip could not reach the OpenClaw gateway.",
          hint: "Check the gateway URL, networking, and private routing, then retry.",
        });
      } else {
        checks.push({
          code: "openclaw_gateway_probe_failed",
          level: "error",
          message: probeResult.message ?? "Gateway probe failed.",
          hint: "Verify network reachability and gateway URL from the Paperclip server host.",
        });
      }
    } catch (err) {
      checks.push({
        code: "openclaw_gateway_probe_error",
        level: "warn",
        message: err instanceof Error ? err.message : "Gateway probe failed",
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
