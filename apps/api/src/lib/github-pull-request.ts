const GITHUB_PULL_REQUEST_PATTERN = /https?:\/\/(?:www\.)?github\.com\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)\/pull\/(\d+)/gi;

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
