// Reads a ZIP in the browser: first its list of entries, then each file's data.
// An archive that is unsafe or unreadable stops the check with an ArchiveError,
// which carries the finding to show the student.
import { makeFinding } from './findings.js';
import {
  ZipReader,
  BlobReader,
  configure,
  ERR_AMBIGUOUS_ARCHIVE,
  WARNING_DUPLICATE_FILENAME,
  ERR_UNSAFE_FILENAME,
  ERR_UNSUPPORTED_COMPRESSION,
} from '../vendor/zip.js';
import { LIMITS } from './profiles.js';

// The application owns a cancellable worker; never start nested workers.
configure({ useWebWorkers: false });

export class ArchiveError extends Error {
  constructor(finding) {
    super(finding.message);
    this.finding = finding;
    this.id = finding.id;
  }
}

function fail(key, values, paths) {
  throw new ArchiveError(makeFinding(key, values, paths));
}

// The first bytes of other archive formats that students sometimes submit instead.
const RAR = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07];
const SEVEN_ZIP = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c];
const ZIP = [0x50, 0x4b];

// Absolute paths, drive letters, control characters, empty, '.' or '..' parts.
function isUnsafePath(name) {
  return (
    !name ||
    name.startsWith('/') ||
    /^[a-z]:/i.test(name) ||
    /[\x00-\x1f\x7f]/.test(name) ||
    name.includes('//') ||
    name.split('/').some(part => part === '..' || part === '.')
  );
}

// Names Windows cannot create: a trailing dot or space, a device name, or a reserved character.
function isNotPortable(path) {
  return path
    .split('/')
    .some(
      part =>
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
        /[<>:"|?*]/.test(part),
    );
}

// Paths that differ only in letter case or Unicode form are the same file on Windows and macOS.
const pathKey = path => path.normalize('NFC').toLowerCase();

// Checks the entry list before any data is read. Returns the files by path
// and the paths that are not portable.
export function inspectMetadata(entries, limits = LIMITS) {
  if (entries.length > limits.entries) {
    fail('archive.limit.warning', { limit: limits.entries.toLocaleString() });
  }
  let total = 0;
  const seen = new Map(); // path key → the name as written in the ZIP
  const files = new Map();
  const portability = [];
  for (const entry of entries) {
    const original = entry.filename;
    const name = original.replaceAll('\\', '/');
    if (isUnsafePath(name)) fail('archive.paths.error', {}, [original]);
    const path = name.replace(/\/$/, '');
    const key = pathKey(path);
    if (seen.has(key)) fail('archive.ambiguous.error', {}, [seen.get(key), original]);
    seen.set(key, original);
    if (entry.symlink) fail('archive.links.error', {}, [original]);
    if (entry.encrypted) fail('archive.encrypted.error', {}, [original]);
    const size = entry.uncompressedSize;
    if (!Number.isSafeInteger(size) || size < 0 || size > limits.entryBytes) {
      fail('archive.limit.warning.2', {}, [original]);
    }
    total += size;
    if (total > limits.expandedBytes) fail('archive.limit.warning.3');
    if (isNotPortable(path)) portability.push(original);
    // Some exports identify empty directory entries only by their trailing slash.
    const directory = entry.directory || (name.endsWith('/') && size === 0);
    if (!directory) files.set(path, { path, size, entry });
  }

  // A file cannot also be the parent directory of another entry.
  const fileKeys = new Set([...files.keys()].map(pathKey));
  for (const key of seen.keys()) {
    const parts = key.split('/');
    for (let i = 1; i < parts.length; i++) {
      if (fileKeys.has(parts.slice(0, i).join('/'))) fail('archive.ambiguous.error.2', {}, [seen.get(key)]);
    }
  }
  if (!files.size) fail('archive.empty.error');
  return { files, portability };
}

// Reads every file in the ZIP and checks its CRC. A file whose path matches textPattern
// also keeps its text, or null with invalidEncoding set if it is not valid text.
// decoderFactory is given a file's first chunk and returns the TextDecoder for it.
export async function readArchive(
  blob,
  {
    limits = LIMITS,
    progress = () => {},
    textPattern = /\.(java|properties|xml)$/i,
    decoderFactory = () => new TextDecoder('utf-8', { fatal: true }),
  } = {},
) {
  if (blob.size > limits.archiveBytes) fail('archive.limit.warning.4');
  const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const startsWith = signature => signature.every((byte, index) => header[index] === byte);
  if (startsWith(RAR)) fail('archive.format.warning', { format: 'RAR' });
  if (startsWith(SEVEN_ZIP)) fail('archive.format.warning', { format: '7z' });

  const reader = new ZipReader(new BlobReader(blob), {
    useWebWorkers: false,
    checkCrc32: true,
    checkOverlappingEntry: true,
    strictness: 'strict',
  });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), limits.milliseconds);
  let currentPath = '';
  try {
    const entries = [];
    for await (const entry of reader.getEntriesGenerator()) {
      entries.push(entry);
      if (entries.length > limits.entries) {
        fail('archive.limit.warning.5', { limit: limits.entries.toLocaleString() });
      }
    }
    const archive = inspectMetadata(entries, limits);

    let expanded = 0;
    let completed = 0;
    for (const file of archive.files.values()) {
      currentPath = file.path;
      const keepText = textPattern.test(file.path);
      let decoder = null;
      let text = '';
      let bytes = 0;
      let invalidEncoding = false;
      const decode = (chunk, options) => {
        try {
          decoder ??= decoderFactory(chunk);
          text += decoder.decode(chunk, options);
        } catch {
          invalidEncoding = true;
          text = '';
        }
      };
      const sink = new WritableStream({
        write(chunk) {
          bytes += chunk.byteLength;
          expanded += chunk.byteLength;
          // The entry list's sizes were checked already; this checks the data actually expanded.
          if (bytes > limits.entryBytes || expanded > limits.expandedBytes) {
            fail('archive.limit.warning.6', {}, [file.path]);
          }
          if (keepText && !invalidEncoding) decode(chunk, { stream: true });
        },
      });
      await file.entry.getData(sink, { checkCrc32: true, signal: abort.signal, useWebWorkers: false });
      if (bytes !== file.size) fail('archive.corrupt.error', {}, [file.path]);
      // Ends the text: a file that stops part-way through a character is not valid text.
      if (decoder && !invalidEncoding) decode(undefined);
      file.text = keepText && !invalidEncoding ? text : null;
      file.invalidEncoding = invalidEncoding;
      delete file.entry;
      progress({ completed: ++completed, total: archive.files.size });
    }
    return archive;
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
    if (abort.signal.aborted) fail('archive.timeout.warning');
    if (error.message === ERR_AMBIGUOUS_ARCHIVE && error.reason === WARNING_DUPLICATE_FILENAME) {
      fail('archive.duplicate.error');
    }
    if (error.message === ERR_UNSAFE_FILENAME) {
      fail('archive.paths.error', {}, error.filename ? [error.filename] : []);
    }
    if (error.message === ERR_UNSUPPORTED_COMPRESSION) {
      fail('archive.compression.warning', {}, currentPath ? [currentPath] : []);
    }
    // Let the ZIP reader try first: readable archives may have a leading prefix.
    // With no readable entry or ZIP header, give the direct submission instruction.
    if (!currentPath && !startsWith(ZIP)) fail('archive.not-zip.error');
    fail('archive.unreadable.error', {}, currentPath ? [currentPath] : []);
  } finally {
    clearTimeout(timer);
    await reader.close().catch(() => {});
  }
}
