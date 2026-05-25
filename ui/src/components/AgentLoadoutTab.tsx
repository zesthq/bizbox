import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { assetsApi } from "../api/assets";
import { companySkillsApi } from "../api/companySkills";
import { queryKeys } from "../lib/queryKeys";
import { RoleLoadoutEditor, type RoleLoadoutSkillEntry } from "./RoleLoadoutEditor";
import { buildAgentMetadata, readAgentLoadoutDraft } from "../lib/agent-loadout";
import { applyAgentSkillSnapshot, arraysEqual, isReadOnlyUnmanagedSkillEntry } from "../lib/agent-skills-state";

interface AgentLoadoutTabProps {
  agent: Agent;
  companyId: string;
  onDirtyChange: (dirty: boolean) => void;
  onSaveActionChange: (fn: (() => void) | null) => void;
  onCancelActionChange: (fn: (() => void) | null) => void;
  onSavingChange: (saving: boolean) => void;
}

export function AgentLoadoutTab({
  agent,
  companyId,
  onDirtyChange,
  onSaveActionChange,
  onCancelActionChange,
  onSavingChange,
}: AgentLoadoutTabProps) {
  const queryClient = useQueryClient();
  const initialLoadout = readAgentLoadoutDraft(agent.metadata);
  const [nameDraft, setNameDraft] = useState(agent.name);
  const [titleDraft, setTitleDraft] = useState(agent.title ?? "");
  const [iconDraft, setIconDraft] = useState(agent.icon ?? "bot");
  const [nicknameDraft, setNicknameDraft] = useState(initialLoadout.nickname);
  const [portraitAssetPath, setPortraitAssetPath] = useState<string | null>(initialLoadout.portraitAssetPath);
  const [selectedToolKeys, setSelectedToolKeys] = useState<string[]>(initialLoadout.tools);
  const [selectedMemoryKeys, setSelectedMemoryKeys] = useState<string[]>(initialLoadout.memory);
  const [skillDraft, setSkillDraft] = useState<string[]>([]);
  const [lastSavedSkills, setLastSavedSkills] = useState<string[]>([]);
  const lastSavedSkillsRef = useRef<string[]>([]);
  const hasHydratedSkillSnapshotRef = useRef(false);
  const skipNextSkillAutosaveRef = useRef(true);

  const { data: skillSnapshot } = useQuery({
    queryKey: queryKeys.agents.skills(agent.id),
    queryFn: () => agentsApi.skills(agent.id, companyId),
    enabled: Boolean(companyId),
  });

  const { data: companySkills } = useQuery({
    queryKey: queryKeys.companySkills.list(companyId),
    queryFn: () => companySkillsApi.list(companyId),
    enabled: Boolean(companyId),
  });

  useEffect(() => {
    const nextLoadout = readAgentLoadoutDraft(agent.metadata);
    setNameDraft(agent.name);
    setTitleDraft(agent.title ?? "");
    setIconDraft(agent.icon ?? "bot");
    setNicknameDraft(nextLoadout.nickname);
    setPortraitAssetPath(nextLoadout.portraitAssetPath);
    setSelectedToolKeys(nextLoadout.tools);
    setSelectedMemoryKeys(nextLoadout.memory);
    setSkillDraft([]);
    setLastSavedSkills([]);
    lastSavedSkillsRef.current = [];
    hasHydratedSkillSnapshotRef.current = false;
    skipNextSkillAutosaveRef.current = true;
  }, [agent]);

  const syncSkills = useMutation({
    mutationFn: (desiredSkills: string[]) => agentsApi.syncSkills(agent.id, desiredSkills, companyId),
    onSuccess: async (snapshot) => {
      queryClient.setQueryData(queryKeys.agents.skills(agent.id), snapshot);
      lastSavedSkillsRef.current = snapshot.desiredSkills;
      setLastSavedSkills(snapshot.desiredSkills);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.urlKey) }),
      ]);
    },
  });

  useEffect(() => {
    if (!skillSnapshot) return;
    const nextState = applyAgentSkillSnapshot(
      {
        draft: skillDraft,
        lastSaved: lastSavedSkillsRef.current,
        hasHydratedSnapshot: hasHydratedSkillSnapshotRef.current,
      },
      skillSnapshot.desiredSkills,
    );
    skipNextSkillAutosaveRef.current = nextState.shouldSkipAutosave;
    hasHydratedSkillSnapshotRef.current = nextState.hasHydratedSnapshot;
    setSkillDraft(nextState.draft);
    lastSavedSkillsRef.current = nextState.lastSaved;
    setLastSavedSkills(nextState.lastSaved);
  }, [skillDraft, skillSnapshot]);

  useEffect(() => {
    if (!skillSnapshot) return;
    if (skipNextSkillAutosaveRef.current) {
      skipNextSkillAutosaveRef.current = false;
      return;
    }
    if (syncSkills.isPending) return;
    if (arraysEqual(skillDraft, lastSavedSkillsRef.current)) return;
    const timeout = window.setTimeout(() => {
      if (!arraysEqual(skillDraft, lastSavedSkillsRef.current)) {
        syncSkills.mutate(skillDraft);
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [skillDraft, skillSnapshot, syncSkills]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const metadata = buildAgentMetadata(agent.metadata, {
        nickname: nicknameDraft,
        portraitAssetPath,
        tools: selectedToolKeys,
        memory: selectedMemoryKeys,
      });

      return agentsApi.update(
        agent.id,
        {
          name: nameDraft.trim() || agent.name,
          title: titleDraft.trim() || null,
          icon: iconDraft,
          metadata,
        },
        companyId,
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.urlKey) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) }),
      ]);
    },
  });

  const uploadPortrait = useMutation({
    mutationFn: async (file: File) => {
      const asset = await assetsApi.uploadImage(companyId, file, `agents/${agent.id}/portrait`);
      return asset.contentPath;
    },
    onSuccess: (path) => {
      setPortraitAssetPath(path);
    },
  });

  const skillInventory = useMemo<RoleLoadoutSkillEntry[]>(() => {
    const companySkillByKey = new Map((companySkills ?? []).map((skill) => [skill.key, skill]));
    const companySkillKeys = new Set((companySkills ?? []).map((skill) => skill.key));
    const adapterEntryByKey = new Map((skillSnapshot?.entries ?? []).map((entry) => [entry.key, entry]));

    const optional = (companySkills ?? []).map((skill) => {
      const adapterEntry = adapterEntryByKey.get(skill.key);
      const required = adapterEntry?.required ?? false;
      return {
        key: skill.key,
        name: skill.name,
        description: skill.description ?? skill.key,
        detail: adapterEntry?.detail ?? null,
        readOnly: required,
        badge: required ? "Required" : null,
      };
    });

    const requiredFromAdapter = (skillSnapshot?.entries ?? [])
      .filter((entry) => entry.required && !companySkillByKey.has(entry.key))
      .map((entry) => ({
        key: entry.key,
        name: entry.runtimeName ?? entry.key,
        description: entry.detail ?? "Required by this adapter.",
        readOnly: true,
        badge: "Required",
      }));

    const unmanaged = (skillSnapshot?.entries ?? [])
      .filter((entry) => isReadOnlyUnmanagedSkillEntry(entry, companySkillKeys))
      .map((entry) => ({
        key: entry.key,
        name: entry.runtimeName ?? entry.key,
        description: entry.detail ?? "Managed outside Bizbox.",
        readOnly: true,
        badge: "External",
      }));

    return dedupeSkillRows([...optional, ...requiredFromAdapter, ...unmanaged]);
  }, [companySkills, skillSnapshot]);

  const draftMetadata = useMemo(
    () => buildAgentMetadata(agent.metadata, {
      nickname: nicknameDraft,
      portraitAssetPath,
      tools: selectedToolKeys,
      memory: selectedMemoryKeys,
    }),
    [agent.metadata, nicknameDraft, portraitAssetPath, selectedToolKeys, selectedMemoryKeys],
  );

  const initialMetadata = useMemo(
    () => buildAgentMetadata(agent.metadata, initialLoadout),
    [agent.metadata, initialLoadout],
  );

  const isDirty =
    nameDraft.trim() !== agent.name ||
    (titleDraft.trim() || null) !== (agent.title ?? null) ||
    iconDraft !== (agent.icon ?? "bot") ||
    JSON.stringify(draftMetadata) !== JSON.stringify(initialMetadata);

  useEffect(() => {
    onDirtyChange(isDirty);
    onSaveActionChange(isDirty ? () => saveMutation.mutate() : null);
    onCancelActionChange(
      isDirty
        ? () => {
            const reset = readAgentLoadoutDraft(agent.metadata);
            setNameDraft(agent.name);
            setTitleDraft(agent.title ?? "");
            setIconDraft(agent.icon ?? "bot");
            setNicknameDraft(reset.nickname);
            setPortraitAssetPath(reset.portraitAssetPath);
            setSelectedToolKeys(reset.tools);
            setSelectedMemoryKeys(reset.memory);
          }
        : null,
    );
  }, [agent, isDirty, onCancelActionChange, onDirtyChange, onSaveActionChange, saveMutation, draftMetadata]);

  useEffect(() => {
    onSavingChange(saveMutation.isPending);
  }, [onSavingChange, saveMutation.isPending]);

  useEffect(() => {
    return () => {
      onDirtyChange(false);
      onSaveActionChange(null);
      onCancelActionChange(null);
      onSavingChange(false);
    };
  }, [onCancelActionChange, onDirtyChange, onSaveActionChange, onSavingChange]);

  const statusBanner = saveMutation.error instanceof Error
    ? (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {saveMutation.error.message}
      </div>
    )
    : uploadPortrait.error instanceof Error
      ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {uploadPortrait.error.message}
        </div>
      )
      : skillSnapshot?.warnings.length
        ? (
          <div className="space-y-1 rounded-md border border-amber-300/40 bg-amber-50/60 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-200">
            {skillSnapshot.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        )
        : null;

  return (
    <RoleLoadoutEditor
      mode="edit"
      role={agent.role}
      name={nameDraft}
      title={titleDraft}
      nickname={nicknameDraft}
      icon={iconDraft}
      portraitAssetPath={portraitAssetPath}
      selectedSkills={skillDraft}
      selectedToolKeys={selectedToolKeys}
      selectedMemoryKeys={selectedMemoryKeys}
      skillInventory={skillInventory}
      onNameChange={setNameDraft}
      onTitleChange={setTitleDraft}
      onNicknameChange={setNicknameDraft}
      onIconChange={setIconDraft}
      onPortraitUpload={(file) => uploadPortrait.mutate(file)}
      onPortraitRemove={() => setPortraitAssetPath(null)}
      portraitUploading={uploadPortrait.isPending}
      portraitDisabled={saveMutation.isPending}
      onSelectedSkillsChange={setSkillDraft}
      onSelectedToolKeysChange={setSelectedToolKeys}
      onSelectedMemoryKeysChange={setSelectedMemoryKeys}
      statusBanner={statusBanner}
      topControls={(
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-sm text-muted-foreground">
          <span>Skills sync through the existing agent skills API. Tools and memory remain visual role loadouts in v1.</span>
          {syncSkills.isPending ? <span>Saving skills…</span> : null}
        </div>
      )}
    />
  );
}

function dedupeSkillRows(entries: RoleLoadoutSkillEntry[]): RoleLoadoutSkillEntry[] {
  const seen = new Set<string>();
  const next: RoleLoadoutSkillEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    next.push(entry);
  }
  return next;
}
