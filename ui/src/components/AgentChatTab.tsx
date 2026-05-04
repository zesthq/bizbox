/**
 * AgentChatTab — renders an agent's recent runs as a chat-style timeline
 * using IssueChatThread in embedded/read-only mode.
 *
 * Converts HeartbeatRun[] into IssueChatLinkedRun[] for finished runs
 * and polls liveRunsForCompany (filtered to this agent) for active runs.
 */
import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { HeartbeatRun } from "@paperclipai/shared";
import { heartbeatsApi } from "../api/heartbeats";
import type { LiveRunForIssue } from "../api/heartbeats";
import { IssueChatThread } from "./IssueChatThread";
import type { IssueChatLinkedRun } from "../lib/issue-chat-messages";
import { queryKeys } from "../lib/queryKeys";

const EMPTY_COMMENTS: [] = [];
const EMPTY_TIMELINE_EVENTS: [] = [];
const handleNoOp = async () => {};

/** Statuses that indicate the run is still active */
const ACTIVE_STATUSES = new Set(["queued", "running"]);

interface AgentChatTabProps {
  agentId: string;
  companyId: string;
  /** Heartbeat runs already fetched by AgentDetail */
  runs: HeartbeatRun[];
}

export const AgentChatTab = memo(function AgentChatTab({
  agentId,
  companyId,
  runs,
}: AgentChatTabProps) {
  // Poll for live runs scoped to this agent
  const { data: companyLiveRuns } = useQuery({
    queryKey: [...queryKeys.heartbeats(companyId, agentId), "live"] as const,
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    refetchInterval: 3000,
  });

  const agentLiveRuns = useMemo<LiveRunForIssue[]>(
    () => (companyLiveRuns ?? []).filter((r) => r.agentId === agentId),
    [companyLiveRuns, agentId],
  );

  const liveRunIds = useMemo(
    () => new Set(agentLiveRuns.map((r) => r.id)),
    [agentLiveRuns],
  );

  // Convert finished HeartbeatRuns to IssueChatLinkedRun[], excluding live ones
  const linkedRuns = useMemo<IssueChatLinkedRun[]>(
    () =>
      runs
        .filter((r) => !ACTIVE_STATUSES.has(r.status) && !liveRunIds.has(r.id))
        .map((r) => ({
          runId: r.id,
          status: r.status,
          agentId: r.agentId,
          createdAt: r.createdAt,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          hasStoredOutput: (r.logBytes ?? 0) > 0,
        })),
    [runs, liveRunIds],
  );

  return (
    <IssueChatThread
      comments={EMPTY_COMMENTS}
      linkedRuns={linkedRuns}
      timelineEvents={EMPTY_TIMELINE_EVENTS}
      liveRuns={agentLiveRuns}
      companyId={companyId}
      onAdd={handleNoOp}
      showComposer={false}
      showJumpToLatest={false}
      variant="full"
      emptyMessage="No runs recorded for this agent yet."
      enableLiveTranscriptPolling
      includeSucceededRunsWithoutOutput
    />
  );
});
