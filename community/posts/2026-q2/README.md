# Q2 2026 Roadmap Announcement

This directory contains the Q2 2026 roadmap update prepared for community posting.

## Files

- `q2-2026-roadmap-devto.md` - DEV.to version with front matter
- `q2-2026-roadmap-discourse.md` - Discourse version with discussion prompts

## Posting Instructions

### DEV.to Posting (via API)

The DEV.to version is ready to post via the DEV.to API to the `joincitro` organization:

```bash
# Post to DEV.to (published: false means it will be a draft)
curl -X POST https://dev.to/api/articles \
  -H "api-key: ${DEVTO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @<(cat community/posts/2026-q2/q2-2026-roadmap-devto.md | jq -Rs '{article: {body_markdown: .}}')
```

After posting as a draft:
1. Review on dev.to/dashboard
2. Add cover image if desired
3. Publish when approved

### Discourse Posting (Manual)

The Discourse version should be posted manually:
1. Navigate to the Bizbox community Discourse
2. Create a new topic in the "Announcements" category
3. Copy the content from `q2-2026-roadmap-discourse.md`
4. Add tags: `roadmap`, `release-notes`, `community`
5. Pin the topic for visibility

## Review Checklist

Before Dennis approves:
- [ ] Both versions are factually accurate
- [ ] Links are working (GitHub repo, roadmap file, milestones)
- [ ] Front matter is correct for DEV.to
- [ ] Discourse version has discussion prompts
- [ ] Content aligns with build-in-public guardrails (no internal-only context)
- [ ] Tone is appropriate (technical, honest, helpful)

## Approval Chain

1. ✅ Tech Reviewer agent (technical accuracy)
2. ✅ DevRel Lead (editorial, narrative, brand)
3. ⏳ Rotating engineer (final technical check)
4. ⏳ Dennis (final approval & publishing authority)

## Distribution After Approval

After Dennis approves, the `content-syndication` task will handle:
- Posting to DEV.to API (as draft → published)
- Posting to Discourse manually or via API if available
- Cross-posting to other channels as configured

## Notes

- This is Q2 2026's quarterly roadmap update (follows Q1 2026)
- Next update: July 2026 (Q3)
- Cadence: quarterly on the roadmap, but we also ship weekly Build Logs and monthly Deep Dives
