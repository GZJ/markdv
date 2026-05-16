import markdownIt from "markdown-it";
import hljs from "highlight.js";
import DOMPurify from "dompurify";
import { slugifyHeading, type TocItem } from "./toc";

export type RenderedMarkdown = {
  html: string;
  toc: TocItem[];
};

const md = markdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code: string, language: string) {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }

    return hljs.highlightAuto(code).value;
  },
});

export function renderMarkdown(source: string): RenderedMarkdown {
  const tokens = md.parse(source, {});
  const seen = new Map<string, number>();
  const toc: TocItem[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "heading_open") {
      continue;
    }

    const inline = tokens[index + 1];
    if (!inline || inline.type !== "inline") {
      continue;
    }

    const text = inline.content.trim();
    const level = Number(token.tag.replace("h", ""));
    const id = slugifyHeading(text, seen);
    token.attrSet("id", id);
    toc.push({ id, text, level });
  }

  const unsafeHtml = md.renderer.render(tokens, md.options, {});
  const html = DOMPurify.sanitize(unsafeHtml, {
    USE_PROFILES: { html: true },
  });

  return { html, toc };
}