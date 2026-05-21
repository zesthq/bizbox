export function normalizeDocumentTitle(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stripInlineMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\\([\\`*_{}\[\]()#+\-.!])/g, "$1")
    .replace(/<\/?[^>]+>/g, "");
}

export function extractMarkdownH1(body: string | null | undefined) {
  if (typeof body !== "string") return null;
  const headingMatch = body.match(/^[ ]{0,3}#\s+(.+?)(?:\s+#+\s*)?$/m);
  return normalizeDocumentTitle(stripInlineMarkdown(headingMatch?.[1] ?? ""));
}

export function resolveDocumentTitle(
  title: string | null | undefined,
  format: string | null | undefined,
  body: string | null | undefined,
) {
  const normalizedTitle = normalizeDocumentTitle(title);
  if (normalizedTitle) return normalizedTitle;
  if (format !== "markdown") return null;
  return extractMarkdownH1(body);
}
