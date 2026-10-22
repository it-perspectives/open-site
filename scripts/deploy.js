import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { versionPattern, specificationTag } from './release-contract.js';
import { extractReleaseNotes } from './release-notes.js';

function runCommand(command, args, { cwd, capture = false }) {
  const output = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (output.error) throw output.error;
  if (output.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (exit ${output.status}).${output.stderr ? `\n${output.stderr.trim()}` : ''}`);
  return output.stdout?.trim() ?? '';
}

export function deployRelease(args, { cwd = process.cwd(), run = runCommand } = {}) {
  const [version] = args;
  if (args.length !== 1 || !versionPattern.test(version)) throw new Error('Usage: npm run deploy X.Y.Z.');
  const metadata = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
  if (metadata.version !== version) throw new Error(`Requested version ${version} does not match package.json (${metadata.version}). Prepare and commit the version first.`);
  extractReleaseNotes(readFileSync(resolve(cwd, 'CHANGELOG.md'), 'utf8'), version);

  const git = (gitArgs, capture = true) => run('git', gitArgs, { cwd, capture });
  const assertReady = () => {
    if (git(['branch', '--show-current']) !== 'main') throw new Error('Release must be run from the main branch.');
    if (git(['status', '--porcelain', '--untracked-files=all'])) throw new Error('Working tree must be clean. Commit release changes before deploying.');
  };
  assertReady();
  const commit = git(['rev-parse', '--verify', 'HEAD']);
  const tag = specificationTag(version);
  if (git(['tag', '--list', tag])) throw new Error(`Local tag ${tag} already exists. Tags must not be overwritten.`);
  if (git(['ls-remote', '--refs', 'origin', `refs/tags/${tag}`])) throw new Error(`Remote tag ${tag} already exists. Tags must not be overwritten.`);
  const legacy = `v${version}`;
  if (git(['tag', '--list', legacy]) || git(['ls-remote', '--refs', 'origin', `refs/tags/${legacy}`])) throw new Error(`Historical tag ${legacy} already exists. Release a new specification version instead.`);

  run('npm', ['run', 'release:prepare'], { cwd });
  run(process.execPath, ['scripts/smoke-package.js'], { cwd });
  assertReady();
  if (git(['rev-parse', '--verify', 'HEAD']) !== commit) throw new Error('HEAD changed during release checks. Run deploy again for the reviewed commit.');
  git(['tag', '-a', tag, commit, '-m', `OpenSite specification v${version}`], false);
  try { git(['push', '--atomic', 'origin', 'refs/heads/main', `refs/tags/${tag}`], false); }
  catch (error) { throw new Error(`${error.message}\nLocal tag ${tag} is retained. Inspect origin before retrying; no force push was attempted.`); }
  return tag;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const tag = deployRelease(process.argv.slice(2));
    process.stdout.write(`Pushed main and ${tag} to origin. GitHub Actions will validate and publish the GitHub release.\n`);
  } catch (error) { process.stderr.write(`Deploy failed: ${error.message}\n`); process.exitCode = 1; }
}
