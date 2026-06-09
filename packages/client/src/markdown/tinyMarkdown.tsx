// tinyMarkdown.tsx — the ⚑ watch-step markdown subset (design handback §4): paragraphs,
// **bold**, `inline code`, and 4-space-indented runs → terrarium code block (pre.code).
// Deliberately tiny + deterministic; NOT a general markdown engine. RichText is a markdown
// string in v1; the corpus (content/nodes/*.yaml watch bodies) uses exactly this subset.
import type { ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) out.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    else out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const INDENTED = /^ {4}/;

export function TinyMarkdown({ text }: { text: string }): React.ReactElement {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactElement[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (INDENTED.test(line)) {
      // code block: consume indented lines (and blank lines BETWEEN indented lines)
      const code: string[] = [];
      while (i < lines.length) {
        const l = lines[i]!;
        if (INDENTED.test(l)) {
          code.push(l.slice(4));
          i++;
        } else if (l.trim() === "" && i + 1 < lines.length && INDENTED.test(lines[i + 1]!)) {
          code.push("");
          i++;
        } else {
          break;
        }
      }
      blocks.push(
        <pre key={key++} className="code">
          {code.join("\n")}
        </pre>,
      );
      continue;
    }
    // paragraph: hard-wrapped source lines join with a space
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !INDENTED.test(lines[i]!)) {
      para.push(lines[i]!.trim());
      i++;
    }
    blocks.push(<p key={key++}>{renderInline(para.join(" "))}</p>);
  }
  return <>{blocks}</>;
}
