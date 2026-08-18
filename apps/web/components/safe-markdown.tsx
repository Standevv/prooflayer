"use client";

import { useMemo } from "react";

/**
 * Sanitize a string to prevent XSS attacks.
 * Strips all HTML tags, removes event handlers, and neutralizes unsafe link schemes.
 */
function sanitize(text: string): string {
  let result = text;
  // Strip HTML tags
  result = result.replace(/<[^>]*>/g, "");
  // Remove event handlers (onerror, onclick, etc.)
  result = result.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, "");
  // Remove javascript: and data: URIs in href-like contexts
  result = result.replace(/javascript\s*:/gi, "");
  result = result.replace(/data\s*:/gi, "");
  return result;
}

type ParsedNode =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "hr" };

/**
 * Parse simple Markdown into structured nodes.
 * Supports: headings (##), paragraphs, bullet lists, horizontal rules.
 */
function parseMarkdown(text: string): ParsedNode[] {
  const lines = text.split("\n");
  const nodes: ParsedNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === "") {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      nodes.push({ type: "hr" });
      i++;
      continue;
    }

    // Headings (## or ###)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      nodes.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Bullet list (- or * at start)
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const listLine = lines[i].trim();
        const listMatch = listLine.match(/^[-*]\s+(.+)$/);
        if (listMatch) {
          items.push(listMatch[1]);
          i++;
        } else if (listLine === "") {
          break;
        } else {
          break;
        }
      }
      if (items.length > 0) {
        nodes.push({ type: "list", items });
      }
      continue;
    }

    // Paragraph (collect consecutive non-empty lines)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const pLine = lines[i].trim();
      if (pLine === "") break;
      if (/^#{1,6}\s+/.test(pLine)) break;
      if (/^[-*]\s+/.test(pLine)) break;
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(pLine)) break;
      paraLines.push(pLine);
      i++;
    }
    if (paraLines.length > 0) {
      nodes.push({ type: "paragraph", text: paraLines.join(" ") });
    }
  }

  return nodes;
}

/**
 * Render inline Markdown formatting: **bold** and `code`.
 * Returns React elements with safe text content.
 */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold** and `code` patterns
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // Bold text
      parts.push(
        <strong key={match.index} className="font-semibold text-accent">
          {match[2]}
        </strong>,
      );
    } else if (match[3]) {
      // Inline code
      parts.push(
        <code
          key={match.index}
          className="mx-0.5 rounded-[3px] border border-edge bg-overlay-hover px-1 py-0.5 font-mono text-[10px] text-secondary"
        >
          {match[3]}
        </code>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

/**
 * SafeMarkdown renders simple Markdown content safely.
 * - Strips all HTML to prevent XSS
 * - Renders headings, paragraphs, bullet lists, bold, inline code
 * - No external dependencies required
 */
export function SafeMarkdown({ content, className }: SafeMarkdownProps) {
  const sanitized = useMemo(() => sanitize(content), [content]);
  const nodes = useMemo(() => parseMarkdown(sanitized), [sanitized]);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {nodes.map((node, index) => {
        switch (node.type) {
          case "heading": {
            const Tag = node.level <= 3 ? "h3" : node.level <= 5 ? "h4" : "h5";
            const sizeClass =
              node.level <= 3
                ? "text-[13px] font-semibold"
                : node.level <= 5
                  ? "text-[12px] font-semibold"
                  : "text-[11px] font-semibold";
            return (
              <Tag
                key={index}
                className={`mt-4 mb-2 first:mt-0 ${sizeClass} text-primary`}
              >
                {renderInline(node.text)}
              </Tag>
            );
          }

          case "paragraph":
            return (
              <p
                key={index}
                className="mb-2 text-[12px] leading-5 text-primary last:mb-0"
              >
                {renderInline(node.text)}
              </p>
            );

          case "list":
            return (
              <ul
                key={index}
                className="mb-2 ml-4 list-inside list-disc space-y-1"
              >
                {node.items.map((item, itemIndex) => (
                  <li
                    key={itemIndex}
                    className="text-[12px] leading-5 text-primary"
                  >
                    <span className="mr-1 text-tertiary">&#x2022;</span>
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            );

          case "hr":
            return (
              <hr
                key={index}
                className="my-3 border-t border-edge"
              />
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
