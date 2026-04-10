import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

type NotionPage = {
  id: string;
  url: string;
  archived: boolean;
  properties: Record<string, { type: string; title?: { plain_text: string }[] }>;
};

type SearchResponse = {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
};

function extractTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title" && prop.title && prop.title.length > 0) {
      return prop.title.map((t) => t.plain_text).join("").trim();
    }
  }
  return "(Untitled)";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { accessCode?: string; notionToken?: string };
    const accessCode = body.accessCode?.trim() || "";
    const notionToken = body.notionToken?.trim() || "";
    const sharedToken = process.env.NOTION_TOKEN?.trim() || "";
    const appPassword = process.env.APP_PASSWORD?.trim() || "";
    const usingPersonalToken = Boolean(notionToken);

    const hasValidAccessCode = Boolean(appPassword && accessCode === appPassword);
    if (!hasValidAccessCode) {
      const ip = getClientIp(request);
      const { allowed, remaining, resetAt } = checkRateLimit(ip, "pages");
      if (!allowed) {
        return NextResponse.json(
          { error: `Rate limit exceeded. Try again in ${Math.ceil((resetAt - Date.now()) / 1000)}s.` },
          { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
        );
      }
    }

    if (!usingPersonalToken && appPassword && accessCode !== appPassword) {
      return NextResponse.json({ error: "Invalid access code." }, { status: 401 });
    }

    const token = notionToken || sharedToken;

    if (!token) {
      return NextResponse.json(
        { error: "No Notion token available. Paste your own token or configure NOTION_TOKEN." },
        { status: 400 }
      );
    }

    const allPages: { id: string; title: string; url: string }[] = [];
    let cursor: string | null = null;

    do {
      const searchBody: Record<string, unknown> = {
        filter: { value: "page", property: "object" },
        page_size: 100
      };
      if (cursor) {
        searchBody.start_cursor = cursor;
      }

      const res = await fetch(`${NOTION_API_BASE}/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Notion-Version": NOTION_VERSION
        },
        body: JSON.stringify(searchBody),
        cache: "no-store"
      });

      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        return NextResponse.json(
          { error: err.message || `Notion API error (${res.status})` },
          { status: res.status }
        );
      }

      const data = (await res.json()) as SearchResponse;

      for (const page of data.results) {
        if (!page.archived) {
          allPages.push({ id: page.id, title: extractTitle(page), url: page.url });
        }
      }

      cursor = data.has_more ? data.next_cursor : null;
    } while (cursor);

    allPages.sort((a, b) => a.title.localeCompare(b.title));

    return NextResponse.json({ pages: allPages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 }
    );
  }
}
