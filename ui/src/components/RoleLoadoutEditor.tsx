import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { LoaderCircle, Camera, Sparkles, Shield, Swords, BrainCircuit, X } from "lucide-react";
import { AGENT_ROLE_LABELS, type AgentRole } from "@paperclipai/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AgentIcon, AgentIconPicker } from "./AgentIconPicker";
import {
  MEMORY_LOADOUT_CATALOG,
  MEMORY_SLOT_COUNT,
  SKILL_SLOT_COUNT,
  TOOL_LOADOUT_CATALOG,
  TOOL_SLOT_COUNT,
  addToFirstOpenSlot,
  assignIntoSlots,
  removeFromSlots,
  roleAccentClassName,
  type LoadoutCatalogEntry,
} from "../lib/agent-loadout";

type LoadoutKind = "skill" | "tool" | "memory";

export interface RoleLoadoutSkillEntry {
  key: string;
  name: string;
  description: string;
  detail?: string | null;
  readOnly?: boolean;
  badge?: string | null;
}

interface RoleLoadoutEditorProps {
  mode: "create" | "edit";
  role: AgentRole | string;
  name: string;
  title: string;
  nickname: string;
  icon: string | null | undefined;
  portraitAssetPath: string | null;
  selectedSkills: string[];
  selectedToolKeys: string[];
  selectedMemoryKeys: string[];
  skillInventory: RoleLoadoutSkillEntry[];
  onNameChange?: (value: string) => void;
  onTitleChange?: (value: string) => void;
  onNicknameChange: (value: string) => void;
  onIconChange: (value: string) => void;
  onPortraitUpload?: (file: File) => void;
  onPortraitRemove?: () => void;
  portraitUploading?: boolean;
  portraitDisabled?: boolean;
  onSelectedSkillsChange: (next: string[]) => void;
  onSelectedToolKeysChange: (next: string[]) => void;
  onSelectedMemoryKeysChange: (next: string[]) => void;
  topControls?: ReactNode;
  machineConfig?: ReactNode;
  footer?: ReactNode;
  statusBanner?: ReactNode;
}

interface DragState {
  kind: LoadoutKind;
  key: string;
  source: "inventory" | "slot";
  slotIndex: number | null;
}

const SKILL_SLOT_LABELS = [
  "Core Discipline",
  "Support Discipline",
  "Specialist Discipline",
  "Wildcard Discipline",
];

const TOOL_SLOT_LABELS = [
  "Primary Tool",
  "Secondary Tool",
  "Field Tool",
];

const MEMORY_SLOT_LABELS = [
  "Immediate Recall",
  "Company Recall",
  "Project Recall",
];

const LOADOUT_PANEL_COPY = {
  skill: "Skills change the real agent skill loadout.",
  tool: "Tools are visual loadout selections in v1.",
  memory: "Memory slots are visual loadout selections in v1.",
} as const;

function fallbackInitials(name: string, role: string) {
  const source = name.trim() || role.trim() || "AG";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function droppableId(kind: LoadoutKind, slotIndex: number) {
  return `drop:${kind}:${slotIndex}`;
}

function inventoryId(kind: LoadoutKind, key: string) {
  return `inventory:${kind}:${key}`;
}

function slotCardId(kind: LoadoutKind, slotIndex: number, key: string) {
  return `slot:${kind}:${slotIndex}:${key}`;
}

function parseDragState(id: string): DragState | null {
  const parts = id.split(":");
  if (parts.length < 3) return null;
  const [source, kind, rawIndex, rawKey] = parts;
  if (source === "inventory") {
    return {
      source,
      kind: kind as LoadoutKind,
      slotIndex: null,
      key: rawIndex,
    };
  }
  if (source === "slot" && parts.length >= 4) {
    return {
      source,
      kind: kind as LoadoutKind,
      slotIndex: Number.parseInt(rawIndex, 10),
      key: rawKey,
    };
  }
  return null;
}

function parseDropTarget(id: string): { kind: LoadoutKind; slotIndex: number } | null {
  const parts = id.split(":");
  if (parts.length !== 3 || parts[0] !== "drop") return null;
  return {
    kind: parts[1] as LoadoutKind,
    slotIndex: Number.parseInt(parts[2] ?? "", 10),
  };
}

function InventoryCard({
  id,
  title,
  description,
  icon,
  accentClassName,
  selected,
  badge,
  readOnly = false,
  onClick,
}: {
  id: string;
  title: string;
  description: string;
  icon: string;
  accentClassName: string;
  selected: boolean;
  badge?: string | null;
  readOnly?: boolean;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled: readOnly,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border border-border/70 bg-card p-3 text-left transition-all",
        "hover:border-primary/40 hover:bg-accent/30",
        selected && "border-primary/60 bg-accent/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]",
        readOnly && "cursor-default opacity-80",
        isDragging && "opacity-50",
      )}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      {...attributes}
      {...listeners}
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70", accentClassName)} />
      <div className="relative flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/80">
          <AgentIcon icon={icon} className="h-4 w-4 text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{title}</span>
            {badge ? (
              <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          <div className="mt-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>{selected ? "Equipped" : "Inventory"}</span>
            {readOnly ? <span>Locked</span> : <span>Drag or click</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function LoadoutSlot({
  kind,
  slotIndex,
  slotLabel,
  entry,
  accentClassName,
  onRemove,
}: {
  kind: LoadoutKind;
  slotIndex: number;
  slotLabel: string;
  entry: { key: string; name: string; description: string; icon: string } | null;
  accentClassName: string;
  onRemove: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId(kind, slotIndex),
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative overflow-hidden rounded-[22px] border bg-card/95 p-3 transition-all",
        isOver ? "border-primary/70 shadow-[0_0_0_1px_hsl(var(--primary)/0.22)]" : "border-border/70",
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70", accentClassName)} />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{slotLabel}</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {kind === "skill" ? "Live" : "Visual"}
          </div>
        </div>
        {entry ? (
          <AssignedSlotCard
            id={slotCardId(kind, slotIndex, entry.key)}
            icon={entry.icon}
            name={entry.name}
            description={entry.description}
            onRemove={onRemove}
          />
        ) : (
          <div className="mt-3 flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/55 px-4 text-center text-xs leading-5 text-muted-foreground">
            Drop a {kind} card here
          </div>
        )}
      </div>
    </div>
  );
}

function AssignedSlotCard({
  id,
  icon,
  name,
  description,
  onRemove,
}: {
  id: string;
  icon: string;
  name: string;
  description: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "mt-3 rounded-2xl border border-border/70 bg-background/85 p-3 shadow-sm transition-opacity",
        isDragging && "opacity-50",
      )}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card">
          <AgentIcon icon={icon} className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="truncate text-sm font-semibold">{name}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
              aria-label={`Remove ${name}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventorySection({
  kind,
  title,
  description,
  inventory,
  selectedKeys,
  onAdd,
  onRemove,
}: {
  kind: LoadoutKind;
  title: string;
  description: string;
  inventory: Array<{
    key: string;
    name: string;
    description: string;
    icon: string;
    accentClassName: string;
    readOnly?: boolean;
    badge?: string | null;
  }>;
  selectedKeys: string[];
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <section className="space-y-3 rounded-[26px] border border-border/70 bg-card/75 p-4 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.8)]">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {kind === "skill" ? <Sparkles className="h-4 w-4 text-primary" /> : null}
          {kind === "tool" ? <Swords className="h-4 w-4 text-primary" /> : null}
          {kind === "memory" ? <BrainCircuit className="h-4 w-4 text-primary" /> : null}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {LOADOUT_PANEL_COPY[kind]}
        </p>
      </div>
      <div className="space-y-3">
        {inventory.map((entry) => {
          const selected = selectedKeys.includes(entry.key);
          return (
            <InventoryCard
              key={entry.key}
              id={inventoryId(kind, entry.key)}
              title={entry.name}
              description={entry.description}
              icon={entry.icon}
              accentClassName={entry.accentClassName}
              selected={selected}
              badge={entry.badge}
              readOnly={entry.readOnly}
              onClick={
                entry.readOnly
                  ? undefined
                  : () => {
                      if (selected) {
                        onRemove(entry.key);
                      } else {
                        onAdd(entry.key);
                      }
                    }
              }
            />
          );
        })}
      </div>
    </section>
  );
}

export function RoleLoadoutEditor({
  mode,
  role,
  name,
  title,
  nickname,
  icon,
  portraitAssetPath,
  selectedSkills,
  selectedToolKeys,
  selectedMemoryKeys,
  skillInventory,
  onNameChange,
  onTitleChange,
  onNicknameChange,
  onIconChange,
  onPortraitUpload,
  onPortraitRemove,
  portraitUploading = false,
  portraitDisabled = false,
  onSelectedSkillsChange,
  onSelectedToolKeysChange,
  onSelectedMemoryKeysChange,
  topControls,
  machineConfig,
  footer,
  statusBanner,
}: RoleLoadoutEditorProps) {
  const portraitInputId = useId();
  const portraitInputRef = useRef<HTMLInputElement | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeDrag, setActiveDrag] = useState<DragState | null>(null);
  const roleLabel = AGENT_ROLE_LABELS[role as AgentRole] ?? role;
  const themeAccent = roleAccentClassName(role);

  const skillEntriesByKey = useMemo(
    () => new Map(skillInventory.map((entry) => [entry.key, entry])),
    [skillInventory],
  );
  const toolEntriesByKey = useMemo(
    () => new Map(TOOL_LOADOUT_CATALOG.map((entry) => [entry.key, entry])),
    [],
  );
  const memoryEntriesByKey = useMemo(
    () => new Map(MEMORY_LOADOUT_CATALOG.map((entry) => [entry.key, entry])),
    [],
  );

  function updateSelection(kind: LoadoutKind, next: string[]) {
    if (kind === "skill") onSelectedSkillsChange(next);
    if (kind === "tool") onSelectedToolKeysChange(next);
    if (kind === "memory") onSelectedMemoryKeysChange(next);
  }

  function currentSelection(kind: LoadoutKind) {
    if (kind === "skill") return selectedSkills;
    if (kind === "tool") return selectedToolKeys;
    return selectedMemoryKeys;
  }

  function slotCount(kind: LoadoutKind) {
    if (kind === "skill") return SKILL_SLOT_COUNT;
    if (kind === "tool") return TOOL_SLOT_COUNT;
    return MEMORY_SLOT_COUNT;
  }

  function handleAssign(kind: LoadoutKind, key: string, slotIndex?: number) {
    const next = slotIndex === undefined
      ? addToFirstOpenSlot(currentSelection(kind), key, slotCount(kind))
      : assignIntoSlots(currentSelection(kind), key, slotIndex, slotCount(kind));
    updateSelection(kind, next);
  }

  function handleRemove(kind: LoadoutKind, key: string) {
    updateSelection(kind, removeFromSlots(currentSelection(kind), key));
  }

  function handleDragStart(event: DragStartEvent) {
    const parsed = parseDragState(String(event.active.id));
    setActiveDrag(parsed);
  }

  function handleDragEnd(event: DragEndEvent) {
    const active = parseDragState(String(event.active.id));
    const overId = event.over?.id ? String(event.over.id) : null;
    setActiveDrag(null);
    if (!active || !overId) return;
    const target = parseDropTarget(overId);
    if (!target || target.kind !== active.kind) return;
    handleAssign(active.kind, active.key, target.slotIndex);
  }

  const skillCards = useMemo(
    () =>
      skillInventory.map((entry) => ({
        ...entry,
        icon: "sparkles",
        accentClassName: entry.readOnly
          ? "from-neutral-500/20 via-neutral-300/5 to-transparent"
          : "from-primary/30 via-primary/10 to-transparent",
      })),
    [skillInventory],
  );

  const activeOverlay = activeDrag
    ? activeDrag.kind === "skill"
      ? skillEntriesByKey.get(activeDrag.key)
      : activeDrag.kind === "tool"
        ? toolEntriesByKey.get(activeDrag.key)
        : memoryEntriesByKey.get(activeDrag.key)
    : null;

  return (
    <div className="space-y-6">
      {statusBanner}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="space-y-4">
          {topControls}

          <div className="grid gap-4 xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(320px,360px)]">
            <section className="relative overflow-hidden rounded-[30px] border border-border/70 bg-card shadow-[0_24px_54px_-42px_rgba(0,0,0,0.8)]">
              <div className={cn("absolute inset-x-0 top-0 h-36 bg-gradient-to-br opacity-80", themeAccent)} />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_38%)]" />
              <div className="relative space-y-5 p-5">
                <div className="space-y-4 rounded-[24px] border border-border/70 bg-background/92 p-4 backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        {mode === "create" ? "Role Creation" : "Role Loadout"}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold">{roleLabel}</h2>
                    </div>
                    <AgentIconPicker value={icon} onChange={onIconChange}>
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                        aria-label="Choose fallback icon"
                      >
                        <AgentIcon icon={icon} className="h-4 w-4" />
                      </button>
                    </AgentIconPicker>
                  </div>

                  <div className="space-y-3">
                    <label
                      htmlFor={portraitInputId}
                      className="group relative mx-auto block w-fit cursor-pointer rounded-[28px] focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
                    >
                      <input
                        ref={portraitInputRef}
                        id={portraitInputId}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={portraitDisabled || !onPortraitUpload}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file || !onPortraitUpload) return;
                          onPortraitUpload(file);
                          event.target.value = "";
                        }}
                      />
                      <span className="absolute inset-0 z-10 rounded-[28px] bg-black/0 transition-colors group-hover:bg-black/14 group-focus-within:bg-black/14" />
                      <span className="absolute bottom-2 right-2 z-20 flex size-10 items-center justify-center rounded-full border border-background bg-primary text-primary-foreground shadow-sm">
                        {portraitUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      </span>
                      <Avatar size="lg" className="data-[size=lg]:size-44 rounded-[28px] border border-border/70 bg-card shadow-xl">
                        {portraitAssetPath ? <AvatarImage src={portraitAssetPath} alt={nickname || name || roleLabel} className="object-cover" /> : null}
                        <AvatarFallback className="rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.02))]">
                          {portraitAssetPath ? null : <AgentIcon icon={icon} className="h-12 w-12 text-foreground" />}
                          {!portraitAssetPath ? (
                            <span className="sr-only">{fallbackInitials(name, roleLabel)}</span>
                          ) : null}
                        </AvatarFallback>
                      </Avatar>
                    </label>

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => portraitInputRef.current?.click()}
                        disabled={portraitDisabled || !onPortraitUpload}
                      >
                        {portraitUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        {portraitAssetPath ? "Change portrait" : "Upload portrait"}
                      </Button>
                      {portraitAssetPath && onPortraitRemove ? (
                        <Button type="button" variant="outline" onClick={onPortraitRemove} disabled={portraitDisabled}>
                          <X className="h-4 w-4" />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Nickname</label>
                      <Input
                        value={nickname}
                        onChange={(event) => onNicknameChange(event.target.value)}
                        placeholder="The Archivist"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Agent name</label>
                      <Input
                        value={name}
                        onChange={(event) => onNameChange?.(event.target.value)}
                        placeholder="Agent name"
                        disabled={!onNameChange}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Title</label>
                      <Input
                        value={title}
                        onChange={(event) => onTitleChange?.(event.target.value)}
                        placeholder="VP of Engineering"
                        disabled={!onTitleChange}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="relative overflow-hidden rounded-[30px] border border-border/70 bg-card shadow-[0_24px_54px_-42px_rgba(0,0,0,0.8)]">
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-80", themeAccent)} />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_28%),linear-gradient(180deg,rgba(0,0,0,0.18),transparent_35%,rgba(0,0,0,0.22))]" />
              <div className="relative space-y-5 p-5">
                <div className="rounded-[24px] border border-border/70 bg-background/88 p-4 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Character Sheet</p>
                      <h3 className="mt-1 text-xl font-semibold">{nickname.trim() || name.trim() || roleLabel}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {roleLabel}{title.trim() ? ` · ${title.trim()}` : ""}
                      </p>
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-border/70 bg-card">
                      <Shield className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    {SKILL_SLOT_LABELS.map((slotLabel, index) => {
                      const key = selectedSkills[index] ?? null;
                      const entry = key
                        ? {
                            key,
                            name: skillEntriesByKey.get(key)?.name ?? key,
                            description: skillEntriesByKey.get(key)?.description ?? "Selected skill",
                            icon: "sparkles",
                          }
                        : null;
                      return (
                        <LoadoutSlot
                          key={slotLabel}
                          kind="skill"
                          slotIndex={index}
                          slotLabel={slotLabel}
                          entry={entry}
                          accentClassName="from-primary/25 via-primary/5 to-transparent"
                          onRemove={() => {
                            if (key) handleRemove("skill", key);
                          }}
                        />
                      );
                    })}
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {TOOL_SLOT_LABELS.map((slotLabel, index) => {
                      const key = selectedToolKeys[index] ?? null;
                      const source = key ? toolEntriesByKey.get(key) ?? null : null;
                      const entry = source
                        ? { key: source.key, name: source.name, description: source.description, icon: source.icon }
                        : null;
                      return (
                        <LoadoutSlot
                          key={slotLabel}
                          kind="tool"
                          slotIndex={index}
                          slotLabel={slotLabel}
                          entry={entry}
                          accentClassName="from-sky-400/20 via-sky-300/5 to-transparent"
                          onRemove={() => {
                            if (key) handleRemove("tool", key);
                          }}
                        />
                      );
                    })}
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {MEMORY_SLOT_LABELS.map((slotLabel, index) => {
                      const key = selectedMemoryKeys[index] ?? null;
                      const source = key ? memoryEntriesByKey.get(key) ?? null : null;
                      const entry = source
                        ? { key: source.key, name: source.name, description: source.description, icon: source.icon }
                        : null;
                      return (
                        <LoadoutSlot
                          key={slotLabel}
                          kind="memory"
                          slotIndex={index}
                          slotLabel={slotLabel}
                          entry={entry}
                          accentClassName="from-fuchsia-400/20 via-fuchsia-300/5 to-transparent"
                          onRemove={() => {
                            if (key) handleRemove("memory", key);
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            <div className="space-y-4">
              <InventorySection
                kind="skill"
                title="Skill Inventory"
                description="Drag company skills into discipline slots or click to auto-equip."
                inventory={skillCards}
                selectedKeys={selectedSkills}
                onAdd={(key) => handleAssign("skill", key)}
                onRemove={(key) => handleRemove("skill", key)}
              />
              <InventorySection
                kind="tool"
                title="Tool Inventory"
                description="Curated board-facing tool packs for visual role composition."
                inventory={TOOL_LOADOUT_CATALOG}
                selectedKeys={selectedToolKeys}
                onAdd={(key) => handleAssign("tool", key)}
                onRemove={(key) => handleRemove("tool", key)}
              />
              <InventorySection
                kind="memory"
                title="Memory Inventory"
                description="Visual memory profiles that describe how the role should remember work."
                inventory={MEMORY_LOADOUT_CATALOG}
                selectedKeys={selectedMemoryKeys}
                onAdd={(key) => handleAssign("memory", key)}
                onRemove={(key) => handleRemove("memory", key)}
              />
            </div>
          </div>

          {machineConfig ? (
            <section className="overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-[0_22px_50px_-40px_rgba(0,0,0,0.82)]">
              <div className="border-b border-border/70 bg-accent/20 px-5 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Machine Config</p>
                <h3 className="mt-1 text-sm font-semibold">Execution settings and adapter configuration</h3>
              </div>
              <div className="p-5">{machineConfig}</div>
            </section>
          ) : null}

          {footer}
        </div>

        <DragOverlay>
          {activeOverlay ? (
            <div className="w-[280px] max-w-[75vw]">
              <InventoryCard
                id="overlay"
                title={activeOverlay.name}
                description={activeOverlay.description}
                icon={"icon" in activeOverlay ? activeOverlay.icon : "sparkles"}
                accentClassName={"accentClassName" in activeOverlay ? activeOverlay.accentClassName : "from-primary/30 via-primary/10 to-transparent"}
                selected={true}
                readOnly
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
