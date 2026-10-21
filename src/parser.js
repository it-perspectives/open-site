import { isAlias, isMap, isScalar, parseAllDocuments, visit } from 'yaml';

export class SpecParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SpecParseError';
    this.code = code;
  }
}

// Also used for programmatically supplied contracts. No coercion or mutation.
export function assertJsonValue(value, depth = 0, ancestors = new Set()) {
  if (depth > 64) throw new SpecParseError('PARSE_DEPTH', 'Nesting must not exceed 64 levels.');
  if (typeof value === 'string' && !value.isWellFormed()) throw new SpecParseError('PARSE_UNICODE', 'Strings must contain well-formed Unicode.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return;
  if (typeof value !== 'object' || value === undefined || ancestors.has(value)) {
    throw new SpecParseError('PARSE_VALUE', 'Expected finite, JSON-compatible values without cycles or unsafe integers.');
  }
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new SpecParseError('PARSE_VALUE', 'Expected plain JSON objects.');
  }
  ancestors.add(value);
  for (const key of Object.keys(value)) {
    assertJsonValue(key);
    if (key === '<<') throw new SpecParseError('PARSE_MERGE', 'The reserved merge key is not supported.');
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) assertJsonValue(child, depth + 1, ancestors);
  ancestors.delete(value);
}

export function parseSpec(source, { format = 'yaml' } = {}) {
  if (typeof source !== 'string' || !['yaml', 'json'].includes(format)) {
    throw new SpecParseError('PARSE_INPUT', 'Expected text and format "yaml" or "json".');
  }
  if (Buffer.byteLength(source, 'utf8') > 1024 * 1024) {
    throw new SpecParseError('PARSE_SIZE', 'Documents must not exceed 1 MiB.');
  }
  if (format === 'json') {
    try { JSON.parse(source); } catch { throw new SpecParseError('PARSE_JSON', 'Invalid JSON syntax.'); }
  }
  const documents = parseAllDocuments(source, { version: '1.2', uniqueKeys: true, prettyErrors: false, logLevel: 'silent' });
  if (documents.length !== 1) throw new SpecParseError('PARSE_DOCUMENT_COUNT', 'Expected exactly one document.');
  const [document] = documents;
  if (document.errors.length || document.warnings.length) {
    throw new SpecParseError('PARSE_DOCUMENT', 'Invalid document, duplicate keys, or unsupported YAML syntax.');
  }
  if (document.directives.yaml.version !== '1.2') throw new SpecParseError('PARSE_YAML_VERSION', 'Only YAML 1.2 is supported.');
  visit(document, (_, node) => {
    if (isAlias(node) || node?.tag) throw new SpecParseError('PARSE_YAML_FEATURE', 'Aliases and explicit tags are not supported.');
    if (isMap(node) && node.items.some(({ key }) => !isScalar(key) || typeof key.value !== 'string')) {
      throw new SpecParseError('PARSE_KEY', 'Mapping keys must be strings.');
    }
  });
  const value = document.toJS();
  assertJsonValue(value);
  return value;
}
