const GITHUB_PULL_REQUEST_PATTERN = /\b(?:https?:\/\/)?(?:www\.)?github\.com\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)\/pull\/(\d+)/gi;

export type GitHubPullRequestReference = {
  owner: string;
  repository: string;
  number: number;
  url: string;
};

export function parseGitHubPullRequestUrl(value: string | null): GitHubPullRequestReference | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 4 || segments[2]?.toLowerCase() !== "pull" || !/^\d+$/.test(segments[3] ?? "")) return null;
    const [owner, repository] = segments;
    if (!owner || !repository) return null;

    const number = Number(segments[3]);
    return {
      owner,
      repository,
      number,
      url: `https://github.com/${owner}/${repository}/pull/${number}`
    };
  } catch {
    return null;
  }
}

export function extractGitHubPullRequestUrls(text: string) {
  const urls = new Set<string>();

  for (const match of text.matchAll(GITHUB_PULL_REQUEST_PATTERN)) {
    urls.add(`https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`);
  }

  return [...urls];
}

export function findGitHubPullRequestUrl(comments: Array<{ text: string }>) {
  for (const comment of comments) {
    const [url] = extractGitHubPullRequestUrls(comment.text);
    if (url) return url;
  }

  return null;
}

export function findGitHubPullRequestUrlInText(values: Array<string | null | undefined>) {
  for (const value of values) {
    if (!value) continue;
    const [url] = extractGitHubPullRequestUrls(value);
    if (url) return url;
  }

  return null;
}
