# Releases

OpenSite 0.1.0 is an initial draft. The package name
`@it-perspectives/opensite` is proposed; npm namespace ownership and publishing
permissions have not been established by this checkout.

## Prepare local artifacts

```sh
npm ci --ignore-scripts
npm run release:prepare
node scripts/smoke-package.js
```

Preparation verifies the checkout and writes these files to ignored `dist/`:

- `it-perspectives-opensite-0.1.0.tgz`: npm package with source, declarations,
  CLI, schema, examples, documentation, and license.
- `opensite-0.1.0.schema.json`: standalone JSON Schema.
- `opensite-0.1.0-SPEC.md`: normative specification snapshot.
- `opensite-0.1.0.yaml` and `.json`: paired example snapshots.
- `SHA256SUMS`: SHA-256 checksums of the five artifacts above.

The version in `package.json`, the library, schema, and examples must agree.
Preparation does not require a clean working tree and can run before a commit.
It does not imply release readiness, remote CI success, or publication.

To try the package in another local repository after preparation:

```sh
npm install --save-dev /absolute/path/to/open-site/dist/it-perspectives-opensite-0.1.0.tgz
```

The smoke script exercises an isolated temporary consumer with the packed
package's real dependency graph. It checks imports, the schema export,
query validation, URL construction, examples, and the CLI. No test framework
or browser is installed or required.

## Publish deliberately

Before a real release, review the contract and locator semantics,
confirm successful CI, finalize CHANGELOG and `info.version` guidance, inspect
the tarball, and verify the npm scope owner. Publish a reviewed commit and
immutable versioned artifacts through the project's agreed release process.

CI only validates and uploads build artifacts; it does not publish packages,
create GitHub releases, or deploy a site. There is intentionally no deploy
command or automatic publisher in this initial repository.

The schema `$id` is a versioned filename in this repository; that file MUST
remain immutable after publication. Offline consumers should vendor it. A
branch URL becomes available only after the file is pushed to that branch;
the local CLI does not depend on its remote availability.
