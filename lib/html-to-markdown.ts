/**
 * Converts clipboard HTML (e.g. from ChatGPT) to Markdown.
 * Runs client-side only — uses browser DOMParser.
 */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return convertNode(doc.body).trim();
}

function convertNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  // Code block — must come before inline code check
  if (tag === "pre") {
    const codeEl = el.querySelector("code");
    const lang = extractLang(codeEl);
    const content = (codeEl ?? el).textContent ?? "";
    return `\n\`\`\`${lang}\n${content.replace(/\n$/, "")}\n\`\`\`\n`;
  }

  // Inline code
  if (tag === "code") {
    const text = el.textContent ?? "";
    return "`" + text + "`";
  }

  const inner = () => childrenToMarkdown(el);

  switch (tag) {
    case "h1": return `\n# ${inner().trim()}\n`;
    case "h2": return `\n## ${inner().trim()}\n`;
    case "h3": return `\n### ${inner().trim()}\n`;
    case "h4": return `\n#### ${inner().trim()}\n`;
    case "h5": return `\n##### ${inner().trim()}\n`;
    case "h6": return `\n###### ${inner().trim()}\n`;

    case "p": return `\n${inner().trim()}\n`;

    case "strong":
    case "b":    return `**${inner()}**`;

    case "em":
    case "i":    return `*${inner()}*`;

    case "del":
    case "s":    return `~~${inner()}~~`;

    case "a": {
      const href = el.getAttribute("href") ?? "";
      const text = inner().trim();
      if (!href || href === text) return text;
      return `[${text}](${href})`;
    }

    case "ul": return "\n" + convertList(el, false) + "\n";
    case "ol": return "\n" + convertList(el, true) + "\n";

    case "li": {
      // handled by convertList — fallback
      return `- ${inner().trim()}\n`;
    }

    case "blockquote": {
      const lines = inner().trim().split("\n");
      return "\n" + lines.map((l) => `> ${l}`).join("\n") + "\n";
    }

    case "hr": return "\n---\n";

    case "br": return "\n";

    case "table": return convertTable(el);

    // Elements to skip entirely
    case "script":
    case "style":
    case "svg":
    case "img":
      return "";

    // Transparent / inline wrappers — just recurse
    default: return inner();
  }
}

function childrenToMarkdown(el: Element): string {
  return Array.from(el.childNodes).map(convertNode).join("");
}

function convertList(el: Element, ordered: boolean): string {
  const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === "li");
  return items
    .map((li, idx) => {
      const checkbox = li.querySelector('input[type="checkbox"]');
      const prefix = checkbox
        ? checkbox.hasAttribute("checked") || (checkbox as HTMLInputElement).checked
          ? "- [x] "
          : "- [ ] "
        : ordered
        ? `${idx + 1}. `
        : "- ";

      // Remove the checkbox from text extraction
      checkbox?.remove();

      // Nested list inside this item
      const nested = li.querySelector("ul, ol");
      let nestedMd = "";
      if (nested) {
        nestedMd =
          "\n" +
          convertNode(nested)
            .trim()
            .split("\n")
            .map((l) => `  ${l}`)
            .join("\n");
        nested.remove();
      }

      const text = childrenToMarkdown(li).trim();
      return `${prefix}${text}${nestedMd}`;
    })
    .join("\n");
}

function convertTable(el: Element): string {
  const rows = Array.from(el.querySelectorAll("tr"));
  if (rows.length === 0) return "";

  const toRow = (row: Element) =>
    "| " +
    Array.from(row.querySelectorAll("td, th"))
      .map((cell) => childrenToMarkdown(cell as Element).trim().replace(/\|/g, "\\|"))
      .join(" | ") +
    " |";

  const header = toRow(rows[0]);
  const sep =
    "| " +
    Array.from(rows[0].querySelectorAll("td, th"))
      .map(() => "---")
      .join(" | ") +
    " |";

  const body = rows.slice(1).map(toRow).join("\n");

  return `\n${header}\n${sep}\n${body}\n`;
}

function extractLang(codeEl: Element | null): string {
  if (!codeEl) return "";
  const cls = Array.from(codeEl.classList).find((c) => c.startsWith("language-"));
  return cls ? cls.replace("language-", "") : "";
}
