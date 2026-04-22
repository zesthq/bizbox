import { unprocessable } from "../errors.js";
import { isLikelyGitHubEnterpriseHostname } from "./company-skills-github-source.js";

function isGitHubDotCom(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "github.com" || h === "www.github.com";
}

export type GitHubRequestAuth = {
  token?: string | null;
};

function isAllowedGitHubFetchHost(url: string) {
  try {
    const { hostname } = new URL(url);
    const normalized = hostname.trim().toLowerCase();
    return normalized === "api.github.com"
      || normalized === "github.com"
      || normalized === "www.github.com"
      || normalized === "raw.githubusercontent.com"
      || isLikelyGitHubEnterpriseHostname(normalized);
  } catch {
    return false;
  }
}

export function gitHubApiBase(hostname: string) {
  return isGitHubDotCom(hostname) ? "https://api.github.com" : `https://${hostname}/api/v3`;
}

export function resolveRawGitHubUrl(hostname: string, owner: string, repo: string, ref: string, filePath: string) {
  const p = filePath.replace(/^\/+/, "");
  return isGitHubDotCom(hostname)
    ? `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${p}`
    : `https://${hostname}/raw/${owner}/${repo}/${ref}/${p}`;
}

export function withGitHubAuthHeaders(
  init: RequestInit | undefined,
  auth?: GitHubRequestAuth,
): RequestInit | undefined {
  const token = auth?.token?.trim();
  if (!token) return init;

  const headers = new Headers(init?.headers ?? undefined);
  headers.set("authorization", `Bearer ${token}`);
  return { ...init, headers };
}

export async function ghFetch(url: string, init?: RequestInit, auth?: GitHubRequestAuth): Promise<Response> {
  if (auth?.token?.trim() && !isAllowedGitHubFetchHost(url)) {
    throw unprocessable(`Refusing to forward GitHub auth to non-GitHub URL: ${url}`);
  }

  try {
    return await fetch(url, withGitHubAuthHeaders(init, auth));
  } catch {
    let target = url;
    try {
      target = new URL(url).hostname;
    } catch {
      // Keep the original URL string when parsing fails so we do not mask the fetch error.
    }
    throw unprocessable(`Could not connect to ${target} — ensure the URL points to a GitHub or GitHub Enterprise instance`);
  }
}
