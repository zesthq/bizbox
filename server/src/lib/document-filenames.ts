import { resolveDocumentTitle } from "./document-titles.js";

function slugifyFilenamePart(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : null;
}

export function buildDocumentFilename(
  key: string | null | undefined,
  title: string | null | undefined,
  format?: string | null | undefined,
  body?: string | null | undefined,
) {
  const normalizedKey = key?.trim() || "document";
  const titleSlug = slugifyFilenamePart(resolveDocumentTitle(title, format, body));
  const shouldPreferTitle = (normalizedKey === "document" || normalizedKey === "deliverable") && titleSlug;
  return `${shouldPreferTitle ? titleSlug : normalizedKey}.md`;
}
