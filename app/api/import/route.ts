import { NextResponse } from "next/server";
import {
  appendBlocksToPage,
  chunkBlocks,
  createBlocksFromText,
  parseNotionPageId,
  type ImportMode
} from "@/lib/notion";

type Payload = {
  pageUrl?: string;
  text?: string;
  mode?: ImportMode;
  accessCode?: string;
  notionToken?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Payload;
    const pageUrl = payload.pageUrl?.trim() || "";
    const text = payload.text || "";
    const mode: ImportMode =
      payload.mode === "paragraphs" ? "paragraphs"
      : payload.mode === "markdown" ? "markdown"
      : "bullets";
    const accessCode = payload.accessCode?.trim() || "";
    const notionToken = payload.notionToken?.trim() || "";
    const sharedToken = process.env.NOTION_TOKEN?.trim() || "";
    const appPassword = process.env.APP_PASSWORD?.trim() || "";
    const usingPersonalToken = Boolean(notionToken);

    if (!pageUrl) {
      return NextResponse.json(
        { error: "Please paste a Notion page URL." },
        { status: 400 }
      );
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Please paste some text to import." },
        { status: 400 }
      );
    }

    if (!usingPersonalToken && appPassword && accessCode !== appPassword) {
      return NextResponse.json(
        {
          error:
            "That access code is not valid. Enter the site's access code or paste your own Notion token."
        },
        { status: 401 }
      );
    }

    if (!usingPersonalToken && !sharedToken) {
      return NextResponse.json(
        {
          error:
            "No shared Notion token is configured on this deployment. Paste your own Notion integration token to continue."
        },
        { status: 400 }
      );
    }

    const pageId = parseNotionPageId(pageUrl);

    if (!pageId) {
      return NextResponse.json(
        {
          error:
            "I couldn't parse a Notion page ID from that URL. Use a direct page link from Notion."
        },
        { status: 400 }
      );
    }

    const blocks = createBlocksFromText(text, mode);

    if (!blocks.length) {
      return NextResponse.json(
        { error: "No importable content was found after trimming empty text." },
        { status: 400 }
      );
    }

    await appendBlocksToPage(pageId, blocks, notionToken);

    return NextResponse.json({
      success: true,
      blockCount: blocks.length,
      batchCount: chunkBlocks(blocks).length,
      authMode: usingPersonalToken ? "personal-token" : "shared-token"
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected import error."
      },
      { status: 500 }
    );
  }
}
