import {
  createHttpAgentRuntimeBroker,
  type AgentRuntimeBroker,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

/**
 * Otto's broker uses the generic HTTP/OSBAPI transport. The gateway URL and
 * api key are read from the same adapter config that `execute` uses, so a
 * working Otto deployment automatically gains `/v2/runtime/*` reachability
 * the moment the remote gateway exposes the catalog endpoint.
 */
export const ottoAgentBroker: AgentRuntimeBroker = createHttpAgentRuntimeBroker({
  hostKind: "otto_agent",
  resolveBaseUrl: (config) => {
    const obj = parseObject(config);
    const url = asString(obj.url, "");
    return url.length > 0 ? url : null;
  },
  headersFromConfig: (config) => {
    const obj = parseObject(config);
    const apiKey = asString(obj.apiKey, "");
    if (!apiKey) return {} as Record<string, string>;
    return {
      authorization: `Bearer ${apiKey}`,
      "x-otto-api-key": apiKey,
    };
  },
});
