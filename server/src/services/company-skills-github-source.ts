import { isIP } from "node:net";

export type GitHubRepoImportUrlCandidate = {
  hostname: string;
  owner: string;
  repo: string;
  hasExplicitMarker: boolean;
  isGitHubDotCom: boolean;
  isAmbiguous: boolean;
};

export function isLikelyGitHubEnterpriseHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  const [firstLabel = ""] = normalized.split(".");
  return normalized.includes(".")
    ? firstLabel === "git" || firstLabel === "ghe" || firstLabel === "github"
    : true;
}

function normalizeGitHubHostname(rawHostname: string | null | undefined) {
  if (typeof rawHostname !== "string") return null;
  const trimmed = rawHostname.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(`https://${trimmed}`);
    const normalized = parsed.hostname.trim().toLowerCase();

    if (
      !normalized
      || parsed.username
      || parsed.password
      || parsed.port
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
      || normalized !== trimmed.toLowerCase()
      || isIP(normalized) !== 0
      || normalized === "localhost"
      || normalized.endsWith(".localhost")
      || normalized.endsWith(".githubusercontent.com")
      || normalized === "gist.github.com"
    ) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

export function parseGitHubRepoImportUrlCandidate(rawUrl: string): GitHubRepoImportUrlCandidate | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "https:") return null;
    const hostname = normalizeGitHubHostname(parsed.hostname);
    if (!hostname) return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    if (segments.length > 2 && segments[2] !== "tree" && segments[2] !== "blob") return null;
    const owner = segments[0]!;
    const rawRepoSegment = segments[1]!;
    const repo = rawRepoSegment.replace(/\.git$/i, "");
    if (!owner || !repo) return null;
    if (/\.md$/i.test(repo)) return null;

    const isGitHubDotCom = hostname === "github.com" || hostname === "www.github.com";
    const hasExplicitMarker = /\.git$/i.test(rawRepoSegment)
      || segments[2] === "tree"
      || segments[2] === "blob";
    return {
      hostname,
      owner,
      repo,
      hasExplicitMarker,
      isGitHubDotCom,
      isAmbiguous: !isGitHubDotCom && !hasExplicitMarker,
    };
  } catch {
    return null;
  }
}

export function looksLikeGitHubRepoImportUrl(rawUrl: string) {
  const candidate = parseGitHubRepoImportUrlCandidate(rawUrl);
  return Boolean(candidate && !candidate.isAmbiguous);
}

export function normalizeGitHubCredentialAssociationHostname(rawHostname: string | null | undefined) {
  return normalizeGitHubHostname(rawHostname);
}
