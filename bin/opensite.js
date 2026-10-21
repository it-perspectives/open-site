#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { lintSpec, parseSpec, checkSearchParams, specificationVersion, SpecParseError } from '../src/index.js';

const help = `OpenSite ${specificationVersion}

Usage:
  opensite lint <file.yaml|file.yml|file.json>... [--format text|json] [--warnings-as-errors]
  opensite check-search <file> --page <id> --search <query> [--format text|json] [--warnings-as-errors]
  opensite --version

lint checks the contract. check-search also checks a query string against a page.
No command navigates to a website. Query values are omitted from reports.
Exit codes: 0 success; 1 invalid contract or query; 2 usage or file error.
`;

function usage() { process.stderr.write(help); return 2; }
async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { process.stdout.write(help); return 0; }
  if (args.length === 1 && args[0] === '--version') { process.stdout.write(`${specificationVersion}\n`); return 0; }
  const command = args.shift();
  let format = 'text', strict = false, page, search;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--format', '--page', '--search'].includes(arg)) {
      if (i + 1 >= args.length || args[i + 1].startsWith('--')) return usage();
      const value = args[++i];
      if (arg === '--format') format = value;
      else if (arg === '--page') page = value;
      else search = value;
    } else if (arg === '--warnings-as-errors') strict = true;
    else if (arg.startsWith('-')) return usage();
    else files.push(arg);
  }
  if (!['lint', 'check-search'].includes(command) || !['text', 'json'].includes(format) || !files.length ||
      (command === 'check-search' && (files.length !== 1 || !page || search === undefined)) ||
      (command === 'lint' && (page !== undefined || search !== undefined))) return usage();
  const reports = [];
  let exitCode = 0;
  for (const file of files) {
    let report;
    try {
      const ext = extname(file).toLowerCase();
      if (!['.yaml', '.yml', '.json'].includes(ext)) {
        report = { valid: false, diagnostics: [{ severity: 'error', code: 'FILE_FORMAT', path: '/', message: 'Expected .yaml, .yml, or .json.' }] };
        exitCode = 2;
      } else {
        const spec = parseSpec(await readFile(file, 'utf8'), { format: ext === '.json' ? 'json' : 'yaml' });
        report = lintSpec(spec);
        if (command === 'check-search' && report.valid) {
          const checked = checkSearchParams(spec, page, search);
          report = { valid: checked.valid, diagnostics: [...report.diagnostics, ...checked.diagnostics] };
        }
      }
    } catch (error) {
      const parseError = error instanceof SpecParseError;
      report = { valid: false, diagnostics: [{ severity: 'error', code: parseError ? error.code : 'FILE_READ', path: '/', message: parseError ? error.message : 'Unable to read the specification file.' }] };
      if (!parseError) exitCode = 2;
    }
    report.valid &&= !(strict && report.diagnostics.some(({ severity }) => severity === 'warning'));
    if (!report.valid && exitCode === 0) exitCode = 1;
    reports.push({ file, ...report });
  }
  if (format === 'json') process.stdout.write(`${JSON.stringify({ specificationVersion, valid: reports.every(({ valid }) => valid), reports }, null, 2)}\n`);
  else for (const report of reports) {
    process.stdout.write(`${report.file}: ${report.valid ? 'valid' : 'invalid'}\n`);
    for (const item of report.diagnostics) process.stdout.write(`  ${item.severity} ${item.code} ${item.path}: ${item.message}\n`);
  }
  return exitCode;
}
process.exitCode = await main(process.argv.slice(2));
