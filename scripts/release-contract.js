import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schema, specificationVersion } from '../src/index.js';

export const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const specificationTag = (version) => `specification-v${version}`;
export const schemaUrlForVersion = (version) => `https://raw.githubusercontent.com/it-perspectives/open-site/${specificationTag(version)}/schemas/opensite-${version}.schema.json`;

export function validateSpecificationRelease({
  metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')),
  formatVersion = specificationVersion, documentSchema = schema, env = process.env,
} = {}) {
  if (!versionPattern.test(formatVersion) || metadata.version !== formatVersion ||
      metadata.name !== '@it-perspectives/opensite' || documentSchema.properties.opensite.const !== formatVersion ||
      documentSchema.$id !== schemaUrlForVersion(formatVersion) || documentSchema.properties.$schema.const !== documentSchema.$id) {
    throw new Error('Release package identity, versions, or immutable schema URLs disagree.');
  }
  if (env.GITHUB_REF_TYPE === 'tag' && env.GITHUB_REF_NAME !== specificationTag(formatVersion)) {
    throw new Error('Release tag must match the specification and package version.');
  }
  return formatVersion;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${validateSpecificationRelease()}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
