import type { UIAdapterModule } from "../types";
import { parseOttoAgentStdoutLine } from "@paperclipai/adapter-otto-agent/ui";
import { buildOttoAgentConfig } from "@paperclipai/adapter-otto-agent/ui";
import { OttoAgentConfigFields } from "./config-fields";

export const ottoAgentUIAdapter: UIAdapterModule = {
  type: "otto_agent",
  label: "Otto Agent",
  parseStdoutLine: parseOttoAgentStdoutLine,
  ConfigFields: OttoAgentConfigFields,
  buildAdapterConfig: buildOttoAgentConfig,
};
