export type ArticleBodyBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bulleted_list"; items: string[] }
  | { type: "numbered_list"; items: string[] };

/** The Articles listing page's card shape — no body (see the backend's
 * PublicArticleListSerializer, which deliberately omits it). */
export type ArticleSummary = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  author_name: string;
  published_at: string | null;
  cover_image_url: string | null;
  tags: string[];
};

/** An individual article's own page — everything in ArticleSummary plus
 * the full body. */
export type ArticleDetail = ArticleSummary & {
  body: ArticleBodyBlock[];
};

export type ArticleStatus = "draft" | "published";

/** Article Creator's full read/write shape — everything ArticleDetail has
 * plus the admin-only lifecycle/audit fields. */
export type AdminArticle = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  author_name: string;
  body: ArticleBodyBlock[];
  cover_image_url: string | null;
  tags: string[];
  status: ArticleStatus;
  archived: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export function formatArticleDate(publishedAt: string | null): string {
  if (!publishedAt) return "";
  return new Date(publishedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatArticleDateTime(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ---------------------------------------------------------------------------
// Inline markup — a deliberately small, safe subset the admin editor's
// toolbar can insert into any block's text: **bold**, *italic*, and
// [label](url). Parsed here into plain data (never dangerouslySetInnerHTML)
// so the renderer always emits real React elements with a validated href —
// there's no way for this to inject arbitrary HTML/JS, matching the
// backend's validate_article_body allow-list.
// ---------------------------------------------------------------------------

export type InlineSegment =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "link"; text: string; href: string };

const INLINE_PATTERN = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)/g;

/** True for an href the public renderer is willing to output — same
 * allow-list as the backend's _validate_href. */
export function isSafeHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://") || href.startsWith("/");
}

export function parseInlineMarkup(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, match.index) });
    }
    const [, bold, italic, linkText, linkHref] = match;
    if (bold !== undefined) {
      segments.push({ kind: "bold", text: bold });
    } else if (italic !== undefined) {
      segments.push({ kind: "italic", text: italic });
    } else if (linkText !== undefined && linkHref !== undefined) {
      segments.push(
        isSafeHref(linkHref)
          ? { kind: "link", text: linkText, href: linkHref }
          : { kind: "text", text: match[0] },
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }
  return segments;
}
