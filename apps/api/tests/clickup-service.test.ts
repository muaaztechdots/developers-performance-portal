import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import { fetchClickUpTicket, parseClickUpTaskId } from "../src/integrations/clickup/service.js";

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
  });

  it("still returns ticket content when comments are unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/comment")) return new Response(null, { status: 403 });
      return Response.json({ id: "ticket-test-2", name: "PDF export", text_content: "Export details" });
    }));

    const result = await fetchClickUpTicket("ticket-test-2");

    expect(result.ticket.title).toBe("PDF export");
    expect(result.comments).toEqual([]);
  });
});
