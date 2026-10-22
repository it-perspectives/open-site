# Releases

## Shared CI/CD

OpenSite calls [open-tooling v0.1.0](https://github.com/it-perspectives/open-tooling/releases/tag/v0.1.0), pinned to `0ac78fd5a1bc8c567d453e36e8e13224df62d74d` in both `uses` and `tooling-ref`. Update both pins together.

[.open-project.json](../.open-project.json) declares the specification/npm package, source inputs and project hooks. The website and VS Code extension are explicitly disabled with reasons. Both CI and release use the temporary `require-complete: false` migration setting; their inventories report `complete: false`. Implement those products and remove the exception in both callers before requiring a full family bundle.

PRs, pushes to main and manual runs call shared verification on Node.js 22, 24 and 26 on Ubuntu 24.04. Project hooks retain the domain tests, TypeScript consumer checks, example lint and the installed npm consumer smoke test. The whole matrix gates publication, and the saved Node 24 products are reused without rebuilding.

## Common build output

With the pinned tooling checked out alongside OpenSite and dependencies installed:

```sh
node ../open-tooling/bin/open-tooling.js check
node ../open-tooling/bin/open-tooling.js build
node ../open-tooling/bin/open-tooling.js verify-artifacts --artifacts dist/open-tooling
```

The build writes these files to ignored `dist/open-tooling/`:

- `it-perspectives-opensite-0.1.0.tgz`: npm package with API, declarations, CLI and schema.
- `opensite-0.1.0.schema.json`: standalone JSON Schema.
- `opensite-0.1.0-SPEC.md`: normative specification.
- `opensite-0.1.0.yaml` and `.json`: paired examples.
- `opensite-specification-0.1.0-source.tar.gz`: configured source, manifest, lockfile, tests and workflows.
- `CHANGELOG.md` and `release-notes.md`: complete history and selected version's entry.
- `release.json`: source/tooling identity, component versions, omitted products and artifact inventory.
- `SHA256SUMS`: checksums of all payload files and `release.json`.

A successful CI run stores this directory in the **open-products** Actions artifact for 14 days. This replaces `opensite-draft-artifacts` and `opensite-release-assets`. Source archives exclude generated `dist/`, dependencies and Git metadata. A local build may have uncommitted sources and is marked `sourceDirty: true`; such artifacts cannot be published.

The existing `npm run release:prepare` and `node scripts/smoke-package.js` remain local specification-only compatibility commands producing the older flat `dist/` bundle. CI uses the common builder. The smoke hook also accepts the exact `OPEN_TOOLING_NPM_TARBALL` supplied by that builder.

## Release a version

Update package/library/schema/example versions, schema filename and immutable URL, TypeScript literals and the SPEC heading together. Also update `specification.version` and schema/example paths in `.open-project.json` and the lockfile. `info.version` belongs to the application contract and remains independent.

Add exactly one nonempty `## X.Y.Z — Title` entry to the root changelog. Review the artifacts and commit all release sources on main. For the initial unpublished version:

```sh
npm run deploy 0.1.0
```

The command requires clean main, matching metadata, an available origin and unused local/remote `specification-v0.1.0` tags. A historical `v0.1.0` also blocks reusing that version. It reruns local release preparation and the isolated npm consumer test, checks unchanged HEAD, creates an annotated tag and atomically pushes main plus that tag. It does not bump versions, make commits, publish npm, or wait for CI.

On push failure the local tag remains. Inspect the remote state, then retry the exact reviewed tag without force. Never move historical tags or published schema URLs; release a new version for later changes. The schema's immutable tag URL becomes available after that tag is pushed.

## GitHub release

A `specification-vX.Y.Z` tag calls the shared release workflow. It builds and verifies the same package on all three supported Node majors, downloads the saved Node 24 artifact, checks commit/tag/repository and the closed inventory, and uploads every file to a draft GitHub release. It downloads and verifies the uploaded bytes before making the release public. Its description is the selected changelog entry.

The caller grants the contents/OIDC/packages permissions required by the shared workflow; verification jobs remain read-only. All optional registry destinations are disabled in this manifest, so this project currently publishes GitHub assets only. The common publisher can resume a partial draft and accepts matching existing releases; conflicting files fail rather than being overwritten.

No website is deployed or extension published by this project yet. A green local check does not establish GitHub CI success, registry ownership or deployed-site conformance.

## npm publication

The proposed package name is `@it-perspectives/opensite`; confirm scope ownership and publishing access before enabling automatic npm publication. It is currently `publishing.npm: false`. A maintainer can publish the verified tarball separately:

```sh
npm publish ./dist/open-tooling/it-perspectives-opensite-0.1.0.tgz --access public
```

Check the checksum and install the exact version in a fresh consumer before announcing it. No npm token or persistent publication secret is introduced.

The shared behavior and setup requirements are documented in the [open-tooling release contract](https://github.com/it-perspectives/open-tooling/blob/v0.1.0/docs/releases.md).
