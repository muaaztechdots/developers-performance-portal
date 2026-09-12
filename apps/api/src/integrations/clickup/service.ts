import { config } from "../../config.js";

const CLICKUP_API_URL = "https://api.clickup.com/api/v2";
const CACHE_TTL_MS = 60_000;

type ClickUpUser = {
  username?: string;
  email?: string;
  profilePicture?: string | null;
};

type ClickUpTaskResponse = {
  id?: string;
  name?: string;
  description?: string;
  text_content?: string;
  markdown_description?: string;
  url?: string;
};

type ClickUpCommentResponse = {
  id?: string | number;
  comment_text?: string;
  comment?: Array<{ text?: string }>;
  user?: ClickUpUser;
  date?: string;
};

type ClickUpCommentsResponse = {
  comments?: ClickUpCommentResponse[];
};

export type ClickUpTicketData = {
  ticket: {
    id: string;
    title: string;
    description: string | null;
    url: string;
  };
  comments: Array<{
    id: string;
    text: string;
    author: string;
    authorAvatar: string | null;
    createdAt: string | null;
  }>;
};

const cache = new Map<string, { expiresAt: number; data: ClickUpTicketData }>();

export function parseClickUpTaskId(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "app.clickup.com") return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0]?.toLowerCase() !== "t" || segments.length < 2) return null;
    const taskId = segments.at(-1)!;
    return /^[a-z0-9_-]+$/i.test(taskId) ? taskId : null;
  } catch {
    return null;
  }
}

export function clickUpIsConfigured() {
  return Boolean(config.CLICKUP_API_TOKEN);
}

async function clickUpGet<T>(path: string): Promise<T> {
  const response = await fetch(`${CLICKUP_API_URL}${path}`, {
    method: "GET",
    headers: { Authorization: config.CLICKUP_API_TOKEN! },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`ClickUp request failed with status ${response.status}.`);
  return response.json() as Promise<T>;
}

function commentText(comment: ClickUpCommentResponse) {
  return comment.comment_text?.trim()
    || comment.comment?.map((part) => part.text ?? "").join("").trim()
    || "";
}

export async function fetchClickUpTicket(taskId: string): Promise<ClickUpTicketData> {
  const cached = cache.get(taskId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (!config.CLICKUP_API_TOKEN) throw new Error("ClickUp integration is not configured.");

  const [task, commentResult] = await Promise.all([
    clickUpGet<ClickUpTaskResponse>(`/task/${encodeURIComponent(taskId)}?include_markdown_description=true`),
    clickUpGet<ClickUpCommentsResponse>(`/task/${encodeURIComponent(taskId)}/comment`).catch(() => ({ comments: [] }))
  ]);

  if (!task.id || !task.name) throw new Error("ClickUp returned incomplete task data.");
  const data: ClickUpTicketData = {
    ticket: {
      id: task.id,
      title: task.name,
      description: task.markdown_description?.trim() || task.description?.trim() || task.text_content?.trim() || null,
      url: task.url || `https://app.clickup.com/t/${task.id}`
    },
    comments: (commentResult.comments ?? []).map((comment) => ({
      id: String(comment.id ?? crypto.randomUUID()),
      text: commentText(comment),
      author: comment.user?.username || comment.user?.email || "Unknown user",
      authorAvatar: comment.user?.profilePicture ?? null,
      createdAt: comment.date && /^\d+$/.test(comment.date)
        ? new Date(Number(comment.date)).toISOString()
        : null
    })).filter((comment) => comment.text)
  };

  cache.set(taskId, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  return data;
}
