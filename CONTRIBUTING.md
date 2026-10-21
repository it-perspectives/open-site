# Contributing

Requires Node.js 22+ and npm. Install dependencies with
`npm ci --ignore-scripts`. The contract format is independent of Node.js.

Before proposing a change, update the normative [specification](SPEC.md),
versioned schema, paired YAML/JSON examples, validator, public TypeScript
declarations, and relevant documentation together. Add conformance cases for
new semantics and rejected inputs. Preserve published specification artifacts.

Run `npm run verify`. Check changes to locator descriptors against their
framework-independent semantics in [SPEC.md](SPEC.md) and keep schema and
TypeScript declarations aligned. Verification requires no browser or test runner.

`npm run release:prepare` prepares local distributable artifacts and checksums.
`node scripts/smoke-package.js` installs the tarball into a temporary consumer
and checks the public API, schema, examples, and executable. It may access npm
to obtain runtime dependencies. Neither script publishes, tags, commits, or pushes.

Keep pull requests focused. Explain which QA-facing behavior changes and
which checks were run. Distinguish document validation, CI execution,
publication, and application acceptance in the consumer's own test suite.
