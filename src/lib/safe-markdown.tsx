/**
 * Safe Markdown rendering — Phase 15C
 *
 * Renders a limited subset of Markdown using React elements only.
 * No dangerouslySetInnerHTML. No raw HTML passthrough.
 */

import { Fragment, type ReactNode } from "react";

const MAX_LENGTH = 50_000;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, "https://placeholder.local");
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>);
    }
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key++} className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        if (isSafeUrl(href)) {
          nodes.push(
            <a
              key={key++}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {label}
            </a>,
          );
        } else {
          nodes.push(<Fragment key={key++}>{label}</Fragment>);
        }
      }
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  }

  return nodes.length ? nodes : [text];
}

interface SafeMarkdownProps {
  content: string;
  className?: string;
  collapseAfterLines?: number;
}

export function SafeMarkdown({ content, className, collapseAfterLines }: SafeMarkdownProps) {
  const safe = escapeHtml(content.slice(0, MAX_LENGTH));
  const lines = safe.split("\n");

  const displayLines =
    collapseAfterLines && lines.length > collapseAfterLines
      ? lines.slice(0, collapseAfterLines)
      : lines;

  return (
    <div className={className}>
      {displayLines.map((line, i) => (
        <p key={i} className={line.trim() === "" ? "h-2" : "mb-1 last:mb-0 whitespace-pre-wrap"}>
          {parseInline(line)}
        </p>
      ))}
      {collapseAfterLines && lines.length > collapseAfterLines && (
        <p className="text-xs text-muted-foreground mt-1">… message truncated</p>
      )}
    </div>
  );
}
