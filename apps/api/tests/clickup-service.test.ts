import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import {
  clickUpRateLimitDelayMs,
  fetchClickUpTicket,
  parseClickUpTaskId
} from "../src/integrations/clickup/service.js";

const originalToken = config.CLICKUP_API_TOKEN;

beforeEach(() => {
  config.CLICKUP_API_TOKEN = "test-token";
});

afterEach(() => {
  config.CLICKUP_API_TOKEN = originalToken;
  vi.unstubAllGlobals();
});

describe("ClickUp task link parser", () => {
  it("extracts task IDs from supported ClickUp links", () => {
    expect(parseClickUpTaskId("https://app.clickup.com/t/42060460/86eypw2vh")).toBe("86eypw2vh");
    expect(parseClickUpTaskId("https://app.clickup.com/t/86eypw2vh")).toBe("86eypw2vh");
  });

  it("ignores non-ClickUp and malformed links", () => {
    expect(parseClickUpTaskId("https://jira.example.com/browse/BE-4")).toBeNull();
    expect(parseClickUpTaskId("https://app.clickup.com.evil.example/t/86eypw2vh")).toBeNull();
    expect(parseClickUpTaskId("not-a-url")).toBeNull();
    expect(parseClickUpTaskId(null)).toBeNull();
  });

  it("normalizes ClickUp task content and comments", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/comment")) {
        return Response.json({
          comments: [{ id: 42, comment: [{ text: "Looks " }, { text: "good" }], user: { username: "Sadaf" }, date: "1789063200000" }]
        });
      }
      return Response.json({ id: "ticket-test-1", name: "Audit logs", markdown_description: "Ticket description", url: "https://app.clickup.com/t/ticket-test-1" });
    }));

    const result = await fetchClickUpTicket("ticket-test-1");

    expect(result.ticket).toMatchObject({ title: "Audit logs", description: "Ticket description" });
    expect(result.comments[0]).toMatchObject({ id: "42", text: "Looks good", author: "Sadaf" });
    expect(result.commentsFetched).toBe(true);
  });

  it("still returns ticket content when comments are unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/comment")) return new Response(null, { status: 403 });
      return Response.json({ id: "ticket-test-2", name: "PDF export", text_content: "Export details" });
    }));

    const result = await fetchClickUpTicket("ticket-test-2");

    expect(result.ticket.title).toBe("PDF export");
    expect(result.comments).toEqual([]);
    expect(result.commentsFetched).toBe(false);
  });

  it("preserves URLs stored in ClickUp rich-text link attributes", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/comment")) {
        return Response.json({
          comments: [{
            id: 43,
            comment: [{ text: "Review PR", attributes: { link: "https://github.com/TechDots/api/pull/31" } }],
            user: { username: "Engineer" }
          }]
        });
      }
      return Response.json({ id: "ticket-rich-link-test", name: "Rich link ticket" });
    }));

    const result = await fetchClickUpTicket("ticket-rich-link-test");

    expect(result.comments[0]?.text).toBe("Review PR (https://github.com/TechDots/api/pull/31)");
  });

  it("loads older comment pages", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/comment?")) {
        return Response.json({ comments: [{ id: 26, comment_text: "Older PR", date: "1000" }] });
      }
      if (url.endsWith("/comment")) {
        return Response.json({
          comments: Array.from({ length: 25 }, (_, index) => ({
            id: index + 1,
            comment_text: `Comment ${index + 1}`,
            date: String(2_000 - index)
          }))
        });
      }
      return Response.json({ id: "ticket-comment-pages-test", name: "Paginated comments" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchClickUpTicket("ticket-comment-pages-test");

    expect(result.comments).toHaveLength(26);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("ClickUp rate limit handling", () => {
  it("uses ClickUp's reset timestamp to calculate the retry delay", () => {
    const now = Date.parse("2026-09-12T10:00:00.000Z");
    const resetAt = Math.floor((now + 30_000) / 1_000);
    const headers = new Headers({ "X-RateLimit-Reset": String(resetAt) });

    expect(clickUpRateLimitDelayMs(headers, now)).toBe(30_250);
  });

  it("falls back to one minute when reset headers are missing", () => {
    expect(clickUpRateLimitDelayMs(new Headers(), 0)).toBe(60_000);
  });

  it("retries a rate-limited request before continuing with comments", async () => {
    let taskRequests = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/comment")) return Response.json({ comments: [] });
      taskRequests += 1;
      if (taskRequests === 1) {
        return new Response(null, {
          status: 429,
          headers: { "X-RateLimit-Reset": "0" }
        });
      }
      return Response.json({ id: "ticket-rate-limit-test", name: "Retried ticket" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchClickUpTicket("ticket-rate-limit-test");

    expect(result.ticket.title).toBe("Retried ticket");
    expect(taskRequests).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
