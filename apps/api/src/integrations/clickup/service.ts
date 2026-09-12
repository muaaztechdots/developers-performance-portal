import { config } from "../../config.js";

const CLICKUP_API_URL = "https://api.clickup.com/api/v2";
const CACHE_TTL_MS = 60_000;
const CLICKUP_REQUEST_INTERVAL_MS = config.NODE_ENV === "test" ? 0 : 750;
const CLICKUP_COMMENT_PAGE_SIZE = 25;
const DEFAULT_RATE_LIMIT_DELAY_MS = 60_000;
const MAX_RATE_LIMIT_DELAY_MS = 5 * 60_000;
const MAX_RATE_LIMIT_RETRIES = 2;

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
  comment?: Array<{
    text?: string;
    attributes?: { link?: string };
  }>;
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
  commentsFetched: boolean;
};

const cache = new Map<string, { expiresAt: number; data: ClickUpTicketData }>();
let requestQueue = Promise.resolve();
let nextRequestAt = 0;
let rateLimitedUntil = 0;

export class ClickUpRateLimitError extends Error {
  readonly retryAt: Date;

  constructor(retryAt: Date) {
    super(`ClickUp rate limit reached. Retry after ${retryAt.toISOString()}.`);
    this.name = "ClickUpRateLimitError";
    this.retryAt = retryAt;
  }
}

export function isClickUpRateLimitError(error: unknown): error is ClickUpRateLimitError {
  return error instanceof ClickUpRateLimitError;
}

export function clickUpRateLimitDelayMs(headers: Headers, now = Date.now()) {
  const resetHeader = headers.get("x-ratelimit-reset");
  const resetSeconds = resetHeader ? Number(resetHeader) : Number.NaN;
  if (Number.isFinite(resetSeconds)) {
    return Math.min(
      MAX_RATE_LIMIT_DELAY_MS,
      Math.max(0, (resetSeconds * 1_000) - now + 250)
    );
  }

  const retryAfterHeader = headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds)) {
    return Math.min(MAX_RATE_LIMIT_DELAY_MS, Math.max(0, retryAfterSeconds * 1_000));
  }

  return DEFAULT_RATE_LIMIT_DELAY_MS;
}

function wait(delayMs: number) {
  return delayMs > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, delayMs))
    : Promise.resolve();
}

function scheduleRequest<T>(request: () => Promise<T>) {
  const scheduled = requestQueue.then(async () => {
    const delayMs = Math.max(nextRequestAt, rateLimitedUntil) - Date.now();
    await wait(delayMs);
    const result = await request();
    nextRequestAt = Date.now() + CLICKUP_REQUEST_INTERVAL_MS;
    return result;
  });

  requestQueue = scheduled.then(() => undefined, () => undefined);
  return scheduled;
}

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
  for (let retryCount = 0; retryCount <= MAX_RATE_LIMIT_RETRIES; retryCount += 1) {
    const response = await scheduleRequest(() => fetch(`${CLICKUP_API_URL}${path}`, {
      method: "GET",
      headers: { Authorization: config.CLICKUP_API_TOKEN! },
      signal: AbortSignal.timeout(10_000)
    }));

    const remainingHeader = response.headers.get("x-ratelimit-remaining");
    const remaining = remainingHeader === null ? Number.NaN : Number(remainingHeader);
    if (Number.isFinite(remaining) && remaining <= 0) {
      rateLimitedUntil = Date.now() + clickUpRateLimitDelayMs(response.headers);
    }

    if (response.status === 429) {
      const retryDelayMs = clickUpRateLimitDelayMs(response.headers);
      rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + retryDelayMs);
      if (retryCount < MAX_RATE_LIMIT_RETRIES) continue;
      throw new ClickUpRateLimitError(new Date(rateLimitedUntil));
    }

    if (!response.ok) throw new Error(`ClickUp request failed with status ${response.status}.`);
    return response.json() as Promise<T>;
  }

  throw new Error("ClickUp request failed unexpectedly.");
}

function commentText(comment: ClickUpCommentResponse) {
  return comment.comment?.map((part) => {
      const text = part.text ?? "";
      const link = part.attributes?.link?.trim();
      if (!link || text.includes(link)) return text;
      return text ? `${text} (${link})` : link;
    }).join("").trim()
    || comment.comment_text?.trim()
    || "";
}

async function fetchClickUpComments(taskId: string) {
  const comments: ClickUpCommentResponse[] = [];
  const seenCursors = new Set<string>();
  let path = `/task/${encodeURIComponent(taskId)}/comment`;

  for (;;) {
    const page = await clickUpGet<ClickUpCommentsResponse>(path);
    const pageComments = page.comments ?? [];
    comments.push(...pageComments);
    if (pageComments.length < CLICKUP_COMMENT_PAGE_SIZE) break;

    const lastComment = pageComments.at(-1);
    if (lastComment?.id === undefined || !lastComment.date) break;
    const cursor = `${lastComment.date}:${lastComment.id}`;
    if (seenCursors.has(cursor)) break;
    seenCursors.add(cursor);
    path = `/task/${encodeURIComponent(taskId)}/comment?start=${encodeURIComponent(lastComment.date)}&start_id=${encodeURIComponent(String(lastComment.id))}`;
  }

  return { comments } satisfies ClickUpCommentsResponse;
}

export async function fetchClickUpTicket(taskId: string): Promise<ClickUpTicketData> {
  const cached = cache.get(taskId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (!config.CLICKUP_API_TOKEN) throw new Error("ClickUp integration is not configured.");

  const task = await clickUpGet<ClickUpTaskResponse>(`/task/${encodeURIComponent(taskId)}?include_markdown_description=true`);
  const commentResult = await fetchClickUpComments(taskId)
    .then((result) => ({ result, fetched: true as const }))
    .catch((error: unknown) => {
      if (isClickUpRateLimitError(error)) throw error;
      return { result: { comments: [] }, fetched: false as const };
    });

  if (!task.id || !task.name) throw new Error("ClickUp returned incomplete task data.");
  const data: ClickUpTicketData = {
    ticket: {
      id: task.id,
      title: task.name,
      description: task.markdown_description?.trim() || task.description?.trim() || task.text_content?.trim() || null,
      url: task.url || `https://app.clickup.com/t/${task.id}`
    },
    comments: (commentResult.result.comments ?? []).map((comment) => ({
      id: String(comment.id ?? crypto.randomUUID()),
      text: commentText(comment),
      author: comment.user?.username || comment.user?.email || "Unknown user",
      authorAvatar: comment.user?.profilePicture ?? null,
      createdAt: comment.date && /^\d+$/.test(comment.date)
        ? new Date(Number(comment.date)).toISOString()
        : null
    })).filter((comment) => comment.text),
    commentsFetched: commentResult.fetched
  };

  cache.set(taskId, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  return data;
}
