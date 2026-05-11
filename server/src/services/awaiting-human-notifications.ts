const CLICKUP_CHAT_MESSAGE_MAX_CHARS = 1_800;
const DEFAULT_CLICKUP_CHANNEL_NAME = "engineering";
const MAX_TITLE_LENGTH = 120;
const MAX_SUMMARY_LENGTH = 280;
const MAX_DETAIL_BULLETS = 5;
const MAX_BULLET_LENGTH = 220;
const CLICKUP_CHANNEL_LOOKUP_PAGE_SIZE = 100;

export interface AwaitingHumanNotificationPayload {
  title: string;
  summary: string;
  link: string;
  cta: string;
  labels: string[];
  kind?: string | null;
  audience?: string | null;
  body?: string | null;
}

export interface SendAwaitingHumanNotificationInput {
  companyId: string;
  issueId: string;
  handoffKind: "request_confirmation" | "ask_user_questions" | "human_owned_blocker";
  notification: AwaitingHumanNotificationPayload;
}

export interface AwaitingHumanNotificationResult {
  status: "sent" | "skipped" | "failed";
  channel: "clickup-chat";
  detail: string;
  externalId?: string | null;
}

type ClickUpChatConfig = {
  personalToken: string;
  workspaceId: string;
  channelId: string;
  channelName: string;
};

function truncateText(value: string, maxLength: number) {
  const compact = compactWhitespace(value);
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function compactWhitespace(value: string) {
  return value.split(/\s+/).filter(Boolean).join(" ");
}

function trimTotal(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function extractBullets(body: string | null | undefined) {
  if (!body) return [] as string[];
  const bullets: string[] = [];
  for (const rawLine of body.split("\n")) {
    let line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      line = line.slice(2).trim();
    }
    bullets.push(truncateText(line, MAX_BULLET_LENGTH));
    if (bullets.length >= MAX_DETAIL_BULLETS) break;
  }
  return bullets;
}

function readClickUpChatConfig(): ClickUpChatConfig {
  return {
    personalToken: process.env.CLICKUP_PERSONAL_TOKEN?.trim() ?? "",
    workspaceId: process.env.CLICKUP_WORKSPACE_ID?.trim() ?? "",
    channelId: process.env.CLICKUP_ENGINEERING_CHANNEL_ID?.trim() ?? "",
    channelName: process.env.CLICKUP_ENGINEERING_CHANNEL_NAME?.trim() || DEFAULT_CLICKUP_CHANNEL_NAME,
  };
}

function renderClickUpMessage(notification: AwaitingHumanNotificationPayload) {
  const title = truncateText(notification.title, MAX_TITLE_LENGTH);
  const summary = truncateText(notification.summary, MAX_SUMMARY_LENGTH);
  const bullets = extractBullets(notification.body);
  const contextLine = [
    notification.kind?.trim() || null,
    notification.audience?.trim() || null,
  ].filter((value): value is string => Boolean(value)).join(" · ");
  const lines = [
    `**${title}**`,
    "",
    summary,
  ];

  if (contextLine) {
    lines.push("");
    lines.push(`Context: ${contextLine}`);
  }

  if (notification.labels.length > 0) {
    lines.push(`Labels: ${notification.labels.join(", ")}`);
  }

  if (bullets.length > 0) {
    lines.push("");
    lines.push("Key points:");
    lines.push(...bullets.map((bullet) => `- ${bullet}`));
  }

  lines.push("");
  lines.push(`Source: ${notification.link.trim()}`);

  if (notification.cta.trim().length > 0) {
    lines.push(`Next step: ${truncateText(notification.cta, 180)}`);
  }

  return trimTotal(lines.join("\n"), CLICKUP_CHAT_MESSAGE_MAX_CHARS);
}

async function resolveClickUpChannelId(config: ClickUpChatConfig): Promise<string | null> {
  if (config.channelId) return config.channelId;
  if (!config.personalToken || !config.workspaceId || !config.channelName) return null;

  const normalizedTarget = config.channelName.trim().toLowerCase();
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(
      `https://api.clickup.com/api/v3/workspaces/${encodeURIComponent(config.workspaceId)}/chat/channels`,
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(CLICKUP_CHANNEL_LOOKUP_PAGE_SIZE));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: config.personalToken,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`channel-lookup-failed:${response.status}:${truncateText(body, 240)}`);
    }

    const payload = await response.json() as { data?: Array<{ id?: unknown; name?: unknown }> };
    const channels = payload.data ?? [];
    for (const channel of channels) {
      const name = typeof channel.name === "string" ? channel.name.trim().toLowerCase() : "";
      if (name === normalizedTarget) {
        const id = typeof channel.id === "string" ? channel.id.trim() : String(channel.id ?? "").trim();
        if (id) return id;
      }
    }

    if (channels.length < CLICKUP_CHANNEL_LOOKUP_PAGE_SIZE) {
      return null;
    }
  }

  return null;
}

export async function sendAwaitingHumanNotification(
  input: SendAwaitingHumanNotificationInput,
): Promise<AwaitingHumanNotificationResult> {
  const config = readClickUpChatConfig();
  if (!config.personalToken) {
    return { status: "skipped", channel: "clickup-chat", detail: "missing-credential: CLICKUP_PERSONAL_TOKEN" };
  }
  if (!config.workspaceId) {
    return { status: "skipped", channel: "clickup-chat", detail: "missing-target: CLICKUP_WORKSPACE_ID" };
  }

  try {
    const channelId = await resolveClickUpChannelId(config);
    if (!channelId) {
      return {
        status: "skipped",
        channel: "clickup-chat",
        detail: `missing-target: CLICKUP_ENGINEERING_CHANNEL_ID or ${config.channelName}`,
      };
    }

    const response = await fetch(
      `https://api.clickup.com/api/v3/workspaces/${encodeURIComponent(config.workspaceId)}/chat/channels/${encodeURIComponent(channelId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: config.personalToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "message",
          content: renderClickUpMessage(input.notification),
          content_format: "text/md",
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        status: "failed",
        channel: "clickup-chat",
        detail: `http-error:${response.status}:${truncateText(body, 240)}`,
      };
    }

    const payload = await response.json() as { id?: unknown; data?: { id?: unknown } };
    const externalId = typeof payload.data?.id === "string"
      ? payload.data.id
      : typeof payload.id === "string"
        ? payload.id
        : null;

    return {
      status: "sent",
      channel: "clickup-chat",
      detail: "sent",
      externalId,
    };
  } catch (error) {
    return {
      status: "failed",
      channel: "clickup-chat",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
