# Container build provenance

The Docker workflow produces signed SLSA Build Provenance v1 for the exact image
digest published at `ghcr.io/zesthq/bizbox`. This implements the provenance
generation/distribution requirements of SLSA v1.2 Build L1 for that container
artifact. The final digest identifies the image index for multi-platform builds.

The GitHub attestation records the repository, source commit, workflow path/ref,
builder, and workflow invocation. It is published in both GitHub's attestation
store and the container registry. BuildKit may also attach its own build
metadata; the GitHub-signed SLSA v1 attestation is separate.

## Finding and verifying provenance

- Repository **Actions → Attestations** lists published GitHub attestations.
- Successful Docker runs print the statement under **Verify and print provenance**.
- The `bizbox-image-provenance` workflow artifact contains
  `bizbox.provenance.json`, `bizbox.sigstore.json`, and `verification.json`.
- GitHub is the canonical provenance store; workflow artifacts expire under
  repository retention settings. Registry attestations follow GHCR retention.

CI verifies the signed attestation against the actual registry image, expected
repository/workflow, source commit, and GitHub-hosted runner before succeeding.
Consumers should use digest references and check the expected source ref as well:

```sh
gh attestation verify oci://ghcr.io/zesthq/bizbox@sha256:DIGEST \
  --repo zesthq/bizbox \
  --signer-workflow zesthq/bizbox/.github/workflows/docker.yml \
  --source-ref refs/heads/master --deny-self-hosted-runners
```

Use the expected tag ref instead of `master` for tagged release builds.

## Testing before merge

Dispatch the Docker workflow on the feature branch. Its normal metadata rules
publish a commit-derived image tag, without updating `latest` for a feature
branch. The optional platform selector permits a real single-architecture build
for quicker validation; pushes retain the existing amd64/arm64 output.

```sh
gh workflow run docker.yml --ref BRANCH -f platforms=linux/amd64
gh run watch RUN_ID --exit-status
gh run download RUN_ID --name bizbox-image-provenance --dir evidence
```

This change covers the Docker distribution. npm release packages have a separate
publishing pipeline and are not covered by the container attestation.
