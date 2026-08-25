import { parseInlineMarkup, type ArticleBodyBlock, type InlineSegment } from "@/lib/articles";

function InlineText({ segments }: { segments: InlineSegment[] }) {
  return (
    <>
      {segments.map((segment, i) => {
        switch (segment.kind) {
          case "bold":
            return <strong key={i}>{segment.text}</strong>;
          case "italic":
            return <em key={i}>{segment.text}</em>;
          case "link":
            return (
              <a
                key={i}
                href={segment.href}
                className="text-brand-blue underline hover:text-brand-navy"
                target={segment.href.startsWith("/") ? undefined : "_blank"}
                rel={segment.href.startsWith("/") ? undefined : "noopener noreferrer"}
              >
                {segment.text}
              </a>
            );
          default:
            return <span key={i}>{segment.text}</span>;
        }
      })}
    </>
  );
}

/**
 * Renders an article's `body` block list as real semantic HTML — shared
 * by the public article page and the admin editor's preview, so "what the
 * admin sees in preview" and "what a visitor sees" can never drift apart.
 * Never uses dangerouslySetInnerHTML: every block type maps to a fixed
 * element, and inline markup (**bold**, *italic*, [text](url)) is parsed
 * into typed segments (see parseInlineMarkup) before being rendered as
 * plain React children.
 */
export function ArticleBody({ blocks }: { blocks: ArticleBodyBlock[] }) {
  return (
    <div className="space-y-4 text-base leading-relaxed text-gray-800 dark:text-gray-200">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return (
              <h2
                key={index}
                className="pt-2 text-xl font-semibold text-gray-900 dark:text-gray-50"
              >
                <InlineText segments={parseInlineMarkup(block.text)} />
              </h2>
            );
          case "paragraph":
            return (
              <p key={index} className="whitespace-pre-wrap">
                <InlineText segments={parseInlineMarkup(block.text)} />
              </p>
            );
          case "bulleted_list":
            return (
              <ul key={index} className="list-disc space-y-1 pl-6">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <InlineText segments={parseInlineMarkup(item)} />
                  </li>
                ))}
              </ul>
            );
          case "numbered_list":
            return (
              <ol key={index} className="list-decimal space-y-1 pl-6">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <InlineText segments={parseInlineMarkup(item)} />
                  </li>
                ))}
              </ol>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
