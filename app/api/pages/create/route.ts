import { NextResponse } from "next/server";
import { createNotionPage } from "@/lib/notion";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      parentPageId?: string;
      accessCode?: string;
      notionToken?: string;
    };

    const title = body.title?.trim() || "Untitled";
    const parentPageId = body.parentPageId?.trim() || "";
    const accessCode = body.accessCode?.trim() || "";
    const notionToken = body.notionToken?.trim() || "";
    const appPassword = process.env.APP_PASSWORD?.trim() || "";
    const usingPersonalToken = Boolean(notionToken);

    const hasValidAccessCode = Boolean(appPassword && accessCode === appPassword);
    if (!hasValidAccessCode) {
      const ip = getClientIp(request);
      const { allowed, remaining, resetAt } = checkRateLimit(ip, "create");
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

    if (!parentPageId) {
      return NextResponse.json(
        { error: "Pick a parent page — the integration needs to be shared with it first." },
        { status: 400 }
      );
    }

    const page = await createNotionPage(title, parentPageId, notionToken);
    return NextResponse.json({ id: page.id, url: page.url, title });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create page." },
      { status: 500 }
    );
  }
}
