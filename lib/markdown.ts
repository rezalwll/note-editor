function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).،؛!?])/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).،؛!?])/g, "$1<em>$2</em>");
}

export function looksLikeMarkdown(value: string) {
  return (
    /(^|\n)\s{0,3}(?:#{1,6}\s+|[-+*]\s+|\d+[.)]\s+|>\s+|```|---\s*$)/m.test(
      value,
    ) || /(?:\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`)/.test(value)
  );
}

export function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (/^```/.test(trimmed)) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unorderedItem = line.match(/^\s*[-+*]\s+(.+)$/);
    if (unorderedItem) {
      const items = [unorderedItem[1]];
      while (index + 1 < lines.length) {
        const nextItem = lines[index + 1].match(/^\s*[-+*]\s+(.+)$/);
        if (!nextItem) break;
        items.push(nextItem[1]);
        index += 1;
      }
      html.push(
        `<ul>${items.map((item) => `<li><p>${renderInlineMarkdown(item)}</p></li>`).join("")}</ul>`,
      );
      continue;
    }

    const orderedItem = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (orderedItem) {
      const items = [orderedItem[1]];
      while (index + 1 < lines.length) {
        const nextItem = lines[index + 1].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!nextItem) break;
        items.push(nextItem[1]);
        index += 1;
      }
      html.push(
        `<ol>${items.map((item) => `<li><p>${renderInlineMarkdown(item)}</p></li>`).join("")}</ol>`,
      );
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      html.push(`<blockquote><p>${renderInlineMarkdown(quote[1])}</p></blockquote>`);
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      html.push("<hr>");
      continue;
    }

    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  return html.join("") || "<p></p>";
}
