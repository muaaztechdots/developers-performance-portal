import { config } from "../../config.js";
import { parseGitHubPullRequestUrl } from "../../lib/github-pull-request.js";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const FILES_PER_PAGE = 100;
const MAX_FILE_PAGES = 30;

type GitHubPullResponse = {
  html_url?: string;
  number?: number;
  title?: string;
  state?: string;
  draft?: boolean;
  merged?: boolean;
  user?: { login?: string; avatar_url?: string | null };
  head?: { ref?: string };
  base?: { ref?: string };
  additions?: number;
  deletions?: number;
  changed_files?: number;
};

type GitHubFileResponse = {
  filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
  patch?: string;
  previous_filename?: string;
  blob_url?: string;
};

export type GitHubPullRequestData = {
  pullRequest: {
    url: string;
    number: number;
    title: string;
    state: string;
    draft: boolean;
    merged: boolean;
    author: string;
    authorAvatar: string | null;
    sourceBranch: string;
    targetBranch: string;
    additions: number;
    deletions: number;
    changedFiles: number;
  };
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch: string | null;
    previousFilename: string | null;
    blobUrl: string | null;
  }>;
  filesTruncated: boolean;
};

export type GitHubErrorKind = "AUTH_REQUIRED" | "RATE_LIMITED" | "NOT_FOUND" | "UNAVAILABLE";

export class GitHubRequestError extends Error {
  readonly kind: GitHubErrorKind;
  readonly status: number;
  readonly retryAt: Date | null;

  constructor(kind: GitHubErrorKind, status: number, message: string, retryAt: Date | null = null) {
    super(message);
    this.name = "GitHubRequestError";
    this.kind = kind;
    this.status = status;
    this.retryAt = retryAt;
  }
}

export function isGitHubRequestError(error: unknown): error is GitHubRequestError {
  return error instanceof GitHubRequestError;
}

export function githubIsConfigured() {
  return Boolean(config.GITHUB_TOKEN);
}

function requestHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "developers-performance-dashboard"
  };
  if (config.GITHUB_TOKEN) headers.Authorization = `Bearer ${config.GITHUB_TOKEN}`;
  return headers;
}

async function githubGet<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API_URL}${path}`, {
      method: "GET",
      headers: requestHeaders(),
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    throw new GitHubRequestError("UNAVAILABLE", 503, error instanceof Error ? error.message : "GitHub could not be reached.");
  }

  if (!response.ok) {
    const responseBody = await response.json().catch(() => null) as { message?: string } | null;
    const message = responseBody?.message || `GitHub request failed with status ${response.status}.`;
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (response.status === 429 || (response.status === 403 && remaining === "0")) {
      const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const retryAt = Number.isFinite(resetSeconds) && resetSeconds > 0
        ? new Date(resetSeconds * 1_000)
        : Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? new Date(Date.now() + retryAfterSeconds * 1_000)
          : null;
      throw new GitHubRequestError("RATE_LIMITED", response.status, message, retryAt);
    }
    if (response.status === 401 || response.status === 403) {
      throw new GitHubRequestError("AUTH_REQUIRED", response.status, message);
    }
    if (response.status === 404) {
      throw new GitHubRequestError(config.GITHUB_TOKEN ? "NOT_FOUND" : "AUTH_REQUIRED", response.status, message);
    }
    throw new GitHubRequestError("UNAVAILABLE", response.status, message);
  }

  return response.json() as Promise<T>;
}

export async function fetchGitHubPullRequest(pullRequestUrl: string): Promise<GitHubPullRequestData> {
  const reference = parseGitHubPullRequestUrl(pullRequestUrl);
  if (!reference) throw new GitHubRequestError("NOT_FOUND", 400, "The GitHub pull request URL is invalid.");

  const basePath = `/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(reference.repository)}/pulls/${reference.number}`;
  const pull = await githubGet<GitHubPullResponse>(basePath);
  const files: GitHubFileResponse[] = [];
  let filesTruncated = false;

  for (let page = 1; page <= MAX_FILE_PAGES; page += 1) {
    const pageFiles = await githubGet<GitHubFileResponse[]>(`${basePath}/files?per_page=${FILES_PER_PAGE}&page=${page}`);
    files.push(...pageFiles);
    if (pageFiles.length < FILES_PER_PAGE) break;
    if (page === MAX_FILE_PAGES) filesTruncated = true;
  }

  if (!pull.number || !pull.title) {
    throw new GitHubRequestError("UNAVAILABLE", 502, "GitHub returned incomplete pull request data.");
  }

  return {
    pullRequest: {
      url: pull.html_url || reference.url,
      number: pull.number,
      title: pull.title,
      state: pull.state || "unknown",
      draft: Boolean(pull.draft),
      merged: Boolean(pull.merged),
      author: pull.user?.login || "Unknown author",
      authorAvatar: pull.user?.avatar_url ?? null,
      sourceBranch: pull.head?.ref || "unknown",
      targetBranch: pull.base?.ref || "unknown",
      additions: pull.additions ?? 0,
      deletions: pull.deletions ?? 0,
      changedFiles: pull.changed_files ?? files.length
    },
    files: files.map((file) => ({
      filename: file.filename || "Unknown file",
      status: file.status || "modified",
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      changes: file.changes ?? 0,
      patch: file.patch ?? null,
      previousFilename: file.previous_filename ?? null,
      blobUrl: file.blob_url ?? null
    })),
    filesTruncated
  };
}
