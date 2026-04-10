import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type {
  Root,
  RootContent,
  PhrasingContent,
  Heading,
  Paragraph,
  List,
  ListItem,
  Code,
  Blockquote,
  Link
} from "mdast";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MAX_TEXT_SEGMENT_LENGTH = 1800;
const MAX_BLOCKS_PER_REQUEST = 100;

export type ImportMode = "bullets" | "paragraphs" | "markdown";

// ─── Notion types ──────────────────────────────────────────────────────────────

type NotionAnnotations = {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
};

type NotionRichText = {
  type: "text";
  text: { content: string; link?: { url: string } };
  annotations?: NotionAnnotations;
};

export type NotionBlock =
  | { object: "block"; type: "paragraph"; paragraph: { rich_text: NotionRichText[] } }
  | { object: "block"; type: "heading_1"; heading_1: { rich_text: NotionRichText[] } }
  | { object: "block"; type: "heading_2"; heading_2: { rich_text: NotionRichText[] } }
  | { object: "block"; type: "heading_3"; heading_3: { rich_text: NotionRichText[] } }
  | { object: "block"; type: "bulleted_list_item"; bulleted_list_item: { rich_text: NotionRichText[] } }
  | { object: "block"; type: "numbered_list_item"; numbered_list_item: { rich_text: NotionRichText[] } }
  | { object: "block"; type: "to_do"; to_do: { rich_text: NotionRichText[]; checked: boolean } }
  | { object: "block"; type: "code"; code: { rich_text: NotionRichText[]; language: string } }
  | { object: "block"; type: "quote"; quote: { rich_text: NotionRichText[] } }
  | { object: "block"; type: "divider"; divider: Record<string, never> };

// ─── Utilities ────────────────────────────────────────────────────────────────

export function parseNotionPageId(pageUrl: string): string | null {
  const trimmed = pageUrl.trim();
  if (!trimmed) return null;

  const idMatch = trimmed.match(/[0-9a-fA-F]{32}/);
  if (idMatch?.[0]) return normalizeId(idMatch[0]);

  try {
    const url = new URL(trimmed);
    for (const candidate of [url.pathname, url.hash]) {
      const slugMatch = candidate.match(/([0-9a-fA-F]{32})/);
      if (slugMatch?.[1]) return normalizeId(slugMatch[1]);

      const hyphenated = candidate.match(
        /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/
      );
      if (hyphenated?.[1]) return hyphenated[1].toLowerCase();
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeId(raw: string): string {
  const c = raw.replace(/-/g, "").toLowerCase();
  return `${c.slice(0, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}-${c.slice(16, 20)}-${c.slice(20)}`;
}

function segmentText(
  content: string,
  annotations?: NotionAnnotations,
  link?: { url: string }
): NotionRichText[] {
  const result: NotionRichText[] = [];
  for (let i = 0; i < content.length; i += MAX_TEXT_SEGMENT_LENGTH) {
    const chunk = content.slice(i, i + MAX_TEXT_SEGMENT_LENGTH);
    const seg: NotionRichText = { type: "text", text: { content: chunk } };
    if (link) seg.text.link = link;
    if (annotations && Object.values(annotations).some(Boolean)) seg.annotations = annotations;
    result.push(seg);
  }
  return result.length > 0 ? result : [{ type: "text", text: { content: " " } }];
}

// ─── Markdown → Notion (via remark AST) ──────────────────────────────────────

const NOTION_LANGUAGES = new Set([
  "abap", "arduino", "bash", "basic", "c", "clojure", "coffeescript", "c++",
  "c#", "css", "dart", "diff", "docker", "elixir", "elm", "erlang", "flow",
  "fortran", "f#", "gherkin", "glsl", "go", "graphql", "groovy", "haskell",
  "html", "java", "javascript", "json", "julia", "kotlin", "latex", "less",
  "lisp", "livescript", "lua", "makefile", "markdown", "markup", "matlab",
  "mermaid", "nix", "objective-c", "ocaml", "pascal", "perl", "php",
  "plain text", "powershell", "prolog", "protobuf", "python", "r", "reason",
  "ruby", "rust", "scala", "scss", "shell", "sql", "swift", "typescript",
  "vb.net", "verilog", "vhdl", "visual basic", "webassembly", "xml", "yaml",
  "java/c/c++/c#"
]);

function resolveLanguage(lang: string | null | undefined): string {
  const normalized = (lang ?? "").toLowerCase().trim();
  if (NOTION_LANGUAGES.has(normalized)) return normalized;
  // Common aliases
  const aliases: Record<string, string> = {
    js: "javascript", ts: "typescript", py: "python", rb: "ruby",
    sh: "bash", zsh: "bash", yml: "yaml", md: "markdown",
    rs: "rust", cs: "c#", cpp: "c++", cc: "c++",
  };
  return aliases[normalized] ?? "plain text";
}

function convertPhrasing(
  nodes: PhrasingContent[],
  inherited: NotionAnnotations = {}
): NotionRichText[] {
  const result: NotionRichText[] = [];

  for (const node of nodes) {
    if (node.type === "text") {
      result.push(...segmentText(node.value, inherited));
    } else if (node.type === "strong") {
      result.push(...convertPhrasing(node.children, { ...inherited, bold: true }));
    } else if (node.type === "emphasis") {
      result.push(...convertPhrasing(node.children, { ...inherited, italic: true }));
    } else if (node.type === "delete") {
      result.push(...convertPhrasing(node.children, { ...inherited, strikethrough: true }));
    } else if (node.type === "inlineCode") {
      result.push(...segmentText(node.value, { ...inherited, code: true }));
    } else if (node.type === "link") {
      const link = node as Link;
      const url = link.url;
      const linkChildren = convertPhrasing(link.children as PhrasingContent[], inherited);
      for (const seg of linkChildren) {
        seg.text.link = { url };
      }
      result.push(...linkChildren);
    } else if (node.type === "image") {
      // represent as plain text fallback
      result.push(...segmentText(`[image: ${node.alt || node.url}]`, inherited));
    } else if (node.type === "break") {
      result.push({ type: "text", text: { content: "\n" } });
    } else if ("children" in node && Array.isArray((node as { children: PhrasingContent[] }).children)) {
      result.push(...convertPhrasing((node as { children: PhrasingContent[] }).children, inherited));
    }
  }

  return result.length > 0 ? result : [{ type: "text", text: { content: " " } }];
}

function richText(nodes: PhrasingContent[]): NotionRichText[] {
  return convertPhrasing(nodes);
}

function convertListItem(item: ListItem, ordered: boolean, checked: boolean | null): NotionBlock {
  // Flatten paragraph content from the list item
  const phrasingNodes: PhrasingContent[] = [];
  for (const child of item.children) {
    if (child.type === "paragraph") {
      phrasingNodes.push(...child.children);
    }
  }
  const rt = richText(phrasingNodes);

  if (checked !== null && checked !== undefined) {
    return { object: "block", type: "to_do", to_do: { rich_text: rt, checked } };
  }
  if (ordered) {
    return { object: "block", type: "numbered_list_item", numbered_list_item: { rich_text: rt } };
  }
  return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rt } };
}

function convertNode(node: RootContent): NotionBlock[] {
  const blocks: NotionBlock[] = [];

  switch (node.type) {
    case "heading": {
      const h = node as Heading;
      const rt = richText(h.children as PhrasingContent[]);
      const level = Math.min(h.depth, 3) as 1 | 2 | 3;
      const key = `heading_${level}` as "heading_1" | "heading_2" | "heading_3";
      blocks.push({ object: "block", type: key, [key]: { rich_text: rt } } as NotionBlock);
      break;
    }

    case "paragraph": {
      const p = node as Paragraph;
      blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: richText(p.children) } });
      break;
    }

    case "list": {
      const l = node as List;
      for (const item of l.children) {
        const checked = item.checked ?? null;
        blocks.push(convertListItem(item, l.ordered ?? false, checked));
      }
      break;
    }

    case "code": {
      const c = node as Code;
      const lang = resolveLanguage(c.lang);
      blocks.push({
        object: "block",
        type: "code",
        code: { rich_text: segmentText(c.value || " "), language: lang }
      });
      break;
    }

    case "blockquote": {
      const bq = node as Blockquote;
      // Flatten all phrasing from blockquote children
      const phrasingNodes: PhrasingContent[] = [];
      for (const child of bq.children) {
        if (child.type === "paragraph") {
          phrasingNodes.push(...child.children);
        }
      }
      blocks.push({ object: "block", type: "quote", quote: { rich_text: richText(phrasingNodes) } });
      break;
    }

    case "thematicBreak": {
      blocks.push({ object: "block", type: "divider", divider: {} });
      break;
    }

    case "html":
    case "definition":
    case "footnoteDefinition":
      // skip
      break;
  }

  return blocks;
}

export function parseMarkdownToBlocks(markdown: string): NotionBlock[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  const blocks: NotionBlock[] = [];
  for (const node of tree.children) {
    blocks.push(...convertNode(node));
  }
  return blocks;
}

// ─── Plain text modes ──────────────────────────────────────────────────────────

function chunkText(content: string): NotionRichText[] {
  if (!content) return [{ type: "text", text: { content: " " } }];
  const chunks: NotionRichText[] = [];
  for (let i = 0; i < content.length; i += MAX_TEXT_SEGMENT_LENGTH) {
    chunks.push({ type: "text", text: { content: content.slice(i, i + MAX_TEXT_SEGMENT_LENGTH) } });
  }
  return chunks;
}

export function createBlocksFromText(text: string, mode: ImportMode): NotionBlock[] {
  if (mode === "markdown") return parseMarkdownToBlocks(text);

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  if (mode === "bullets") {
    return normalized
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => ({
        object: "block" as const,
        type: "bulleted_list_item" as const,
        bulleted_list_item: { rich_text: chunkText(l) }
      }));
  }

  return normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({
      object: "block" as const,
      type: "paragraph" as const,
      paragraph: { rich_text: chunkText(p) }
    }));
}

// ─── Batch chunking ───────────────────────────────────────────────────────────

export function chunkBlocks(blocks: NotionBlock[]): NotionBlock[][] {
  const chunks: NotionBlock[][] = [];
  for (let i = 0; i < blocks.length; i += MAX_BLOCKS_PER_REQUEST) {
    chunks.push(blocks.slice(i, i + MAX_BLOCKS_PER_REQUEST));
  }
  return chunks;
}

// ─── Token resolution ─────────────────────────────────────────────────────────

function resolveNotionToken(tokenOverride?: string): string {
  const provided = tokenOverride?.trim();
  if (provided) return provided;
  const server = process.env.NOTION_TOKEN?.trim();
  if (server) return server;
  throw new Error(
    "Missing Notion token. Paste your own token in the form or add NOTION_TOKEN to the server environment."
  );
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function appendBlocksToPage(
  pageId: string,
  blocks: NotionBlock[],
  tokenOverride?: string
) {
  const token = resolveNotionToken(tokenOverride);
  const batches = chunkBlocks(blocks);

  for (const batch of batches) {
    const response = await fetch(`${NOTION_API_BASE}/blocks/${pageId}/children`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION
      },
      body: JSON.stringify({ children: batch }),
      cache: "no-store"
    });

    if (!response.ok) {
      const message = await extractNotionError(response);
      throw new Error(message);
    }
  }
}

export async function createNotionPage(
  title: string,
  parentPageId: string,
  tokenOverride?: string
): Promise<{ id: string; url: string }> {
  const token = resolveNotionToken(tokenOverride);

  const response = await fetch(`${NOTION_API_BASE}/pages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION
    },
    body: JSON.stringify({
      parent: { page_id: parentPageId },
      properties: {
        title: {
          title: [{ type: "text", text: { content: title || "Untitled" } }]
        }
      }
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await extractNotionError(response);
    throw new Error(message);
  }

  const data = (await response.json()) as { id: string; url: string };
  return { id: data.id, url: data.url };
}

async function extractNotionError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { code?: string; message?: string };
    if (payload.message) return `Notion API error (${response.status}): ${payload.message}`;
    if (payload.code) return `Notion API error (${response.status}): ${payload.code}`;
  } catch {
    return `Notion API error (${response.status}).`;
  }
  return `Notion API error (${response.status}).`;
}
