import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { AdapterConfigFieldsProps } from "../types";
import { Field, DraftInput, help } from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function SecretField({
  label,
  value,
  onCommit,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <DraftInput
          value={value}
          onCommit={onCommit}
          immediate
          type={visible ? "text" : "password"}
          className={inputClass + " pl-8"}
          placeholder={placeholder}
        />
      </div>
    </Field>
  );
}

export function OttoAgentConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  return (
    <div className="space-y-3">
      <Field label="Gateway URL" hint={help.webhookUrl}>
        <DraftInput
          value={
            isCreate
              ? values!.url ?? ""
              : eff("adapterConfig", "url", String(config.url ?? ""))
          }
          onCommit={(v) =>
            isCreate ? set!({ url: v }) : mark("adapterConfig", "url", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="https://your-otto-gateway/api/paperclip"
        />
      </Field>

      <SecretField
        label="API Key"
        value={
          isCreate
            ? values!.apiKey ?? ""
            : eff("adapterConfig", "apiKey", String(config.apiKey ?? ""))
        }
        onCommit={(v) =>
          isCreate
            ? set!({ apiKey: v })
            : mark("adapterConfig", "apiKey", v || undefined)
        }
        placeholder="Issued by your Otto operator — keep this secret"
      />

      <Field label="Timeout (seconds)">
        <DraftInput
          value={
            isCreate
              ? String(values!.timeoutSec ?? 1800)
              : String(eff("adapterConfig", "timeoutSec", config.timeoutSec ?? 1800))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ timeoutSec: v ? Number(v) : 1800 })
              : mark("adapterConfig", "timeoutSec", v ? Number(v) : undefined)
          }
          immediate
          className={inputClass}
          placeholder="1800"
        />
      </Field>

      {!isCreate && (
        <>
          <Field label="Model override">
            <DraftInput
              value={eff("adapterConfig", "model", String(config.model ?? ""))}
              onCommit={(v) => mark("adapterConfig", "model", v || undefined)}
              immediate
              className={inputClass}
              placeholder="e.g. copilot/claude-sonnet-4-5 (leave blank for gateway default)"
            />
          </Field>

          <Field label="Toolsets (comma-separated)">
            <DraftInput
              value={eff("adapterConfig", "toolsets", String(config.toolsets ?? ""))}
              onCommit={(v) => mark("adapterConfig", "toolsets", v || undefined)}
              immediate
              className={inputClass}
              placeholder="e.g. web,terminal (leave blank for all)"
            />
          </Field>
        </>
      )}
    </div>
  );
}
