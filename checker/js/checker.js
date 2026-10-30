// Checks a coursework ZIP. The archive is read first (archive.js); then each check the
// coursework's profile lists runs in turn, adding findings. Nothing in the ZIP is run.
import { makeFinding } from './findings.js';
import { readArchive, ArchiveError } from './archive.js';
import { getProfile } from './profiles.js';
import { compareDeclarations } from './availability.js';

// Removes a byte-order mark and makes every line ending \n, so a file saved on another system
// still matches the starter's fingerprint.
export const normaliseText = text => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

export async function sha256(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// Files that macOS and Windows add to a ZIP, which are not part of the project.
const isSystemFile = path =>
  path
    .split('/')
    .some(
      part => part === '__MACOSX' || part === '.DS_Store' || part === 'Thumbs.db' || part.startsWith('._'),
    );

// The folders in the ZIP that hold a NetBeans project, each ending in '/' ('' for the ZIP's root).
// Found by its nbproject files, otherwise by build.xml, otherwise by the coursework's sourceMarker.
export function detectRoots(paths, sourceMarker) {
  const endsWithPath = (path, marker) => path === marker || path.endsWith('/' + marker);
  const rootsBy = isMarker => {
    const roots = new Set();
    for (const path of paths) {
      const marker = isMarker(path);
      if (marker) roots.add(path.slice(0, -marker.length));
    }
    return roots;
  };
  let roots = rootsBy(path =>
    ['nbproject/project.xml', 'nbproject/project.properties'].find(marker => endsWithPath(path, marker)),
  );
  if (!roots.size) {
    roots = rootsBy(path =>
      endsWithPath(path, 'build.xml') && !endsWithPath(path, 'nbproject/build.xml') ? 'build.xml' : null,
    );
  }
  if (!roots.size && sourceMarker) {
    roots = rootsBy(path => (endsWithPath(path, sourceMarker) ? sourceMarker : null));
  }
  return [...roots].sort();
}

// The value of a key in a Java properties file, the last one if repeated. As in Java, the key
// is followed by '=', ':' or white space. Escapes and lines continued with \ are not followed:
// NetBeans does not write them for these settings.
function property(text, key) {
  if (!text) return undefined;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*${escaped}(?:\\s*[=:]\\s*|\\s+)(.*)$`);
  let value;
  for (const line of text.split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (match) value = match[1].trim();
  }
  return value;
}

// A Java version as NetBeans writes it: 24, or 1.8 for Java 8. Null for anything else, such
// as a reference to another setting.
function javaVersionOf(value) {
  const match = /^(?:1\.)?(\d+)$/.exec(value ?? '');
  return match ? Number(match[1]) : null;
}

// A coursework's availability list is plain data, kept apart from the checks that read it.
// The tests run in Node, where it is read from disk.
async function readJson(url) {
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(url, 'utf8'));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Catalogue not found.');
  return response.json();
}

// The code checks share one reading of the Java files in the project's source folder,
// or in the whole project if the source folder has none.
function javaCode(context) {
  context.java ??= (async () => {
    try {
      const java = [...context.files.values()].filter(
        file => file.path.startsWith(context.root) && file.path.endsWith('.java'),
      );
      const sourcePrefix = context.sourcePrefix ?? context.root + 'src/';
      const inSourceFolder = java.filter(file => file.path.startsWith(sourcePrefix));
      const { readDeclarations } = await import('./java.js');
      return await readDeclarations(inSourceFolder.length ? inSourceFolder : java);
    } catch {
      context.add('java.code.info');
      return null;
    }
  })();
  return context.java;
}

// The project's source folder, from src.dir. Only a plain relative folder is followed;
// anything else, such as ${a.property}, is left as a note.
function checkSourceFolder(context, folder, projectFilesPresent) {
  const { files, root, add } = context;
  const plainFolder =
    folder && /^[\w./ -]+$/.test(folder) && !folder.startsWith('/') && !folder.split('/').includes('..');
  if (!plainFolder) {
    add('netbeans.source-path.info');
    return;
  }
  const segments = folder.split('/').filter(segment => segment && segment !== '.');
  const prefix = root + (segments.length ? segments.join('/') + '/' : '');
  if (![...files.keys()].some(path => path.startsWith(prefix) && path.endsWith('.java'))) {
    add('netbeans.source-path.error', { folder });
    return;
  }
  context.sourcePrefix = prefix;
  if (projectFilesPresent) add('netbeans.project.pass');
}

// Advisory when the project is set to a Java version below the coursework's. A later version is
// fine, and so is a setting that is missing or refers to another setting, as in the marker. A
// project with no readable settings file is left to the project files check.
function checkJavaVersion({ profile, add }, settings) {
  const version = Number(profile.javaVersion);
  if (!version || settings == null) return;
  const below = [];
  for (const key of ['javac.source', 'javac.target', 'javac.release']) {
    const value = property(settings, key);
    const found = javaVersionOf(value);
    if (found !== null && found < version) below.push(`${key}=${value}`);
  }
  if (below.length) add('netbeans.java-version.warning', { version, settings: below.join(', ') });
  else add('netbeans.java-version.pass', { version });
}

// Each check reads the context and adds its findings. netbeans.project also sets context.root,
// which the checks after it need; they are skipped when no single project was found.
const checks = {
  'java.sources': ({ files, add }) => {
    const java = [...files.values()].filter(file => file.path.endsWith('.java'));
    if (!java.length) {
      add('java.sources.error');
      return;
    }
    add('java.sources.pass', { count: java.length });
    const empty = java.filter(file => file.size === 0 || (file.text !== null && !file.text.trim()));
    if (empty.length)
      add(
        'java.empty.warning',
        {},
        empty.map(file => file.path),
      );
    const unreadable = java.filter(file => file.invalidEncoding);
    if (unreadable.length)
      add(
        'java.encoding.warning',
        {},
        unreadable.map(file => file.path),
      );
  },

  'archive.extras': ({ files, archive, add }) => {
    const paths = [...files.keys()];
    const archives = paths.filter(path => /\.(zip|7z|rar|tar|gz)$/i.test(path));
    if (archives.length) add('archive.nested.warning', {}, archives);
    const generated = paths.filter(
      path => /(^|\/)(\.git|node_modules|target)(\/|$)/.test(path) || /\.log$/i.test(path),
    );
    if (generated.length) add('archive.generated.warning', {}, generated);
    const backups = paths.filter(path => /\.(bak|old|tmp)$|~$/i.test(path));
    if (backups.length) add('archive.backups.warning', {}, backups);
    if (archive.portability.length) add('archive.portability.warning', {}, archive.portability);
  },

  'netbeans.project': context => {
    const { files, profile, add } = context;
    const roots = detectRoots([...files.keys()], profile.rootMarker);
    if (!roots.length) {
      add('netbeans.project.warning');
      return;
    }
    if (roots.length > 1) {
      add(
        'netbeans.project.warning.2',
        {},
        roots.map(root => root || '(ZIP root)'),
      );
      return;
    }
    context.root = roots[0];
    const missing = profile.expectedProjectFiles.filter(path => !files.has(context.root + path));
    if (missing.length) add('netbeans.files.warning', {}, missing);
    const settings = files.get(context.root + 'nbproject/project.properties')?.text;
    checkSourceFolder(context, property(settings, 'src.dir'), missing.length === 0);
    checkJavaVersion(context, settings);
  },

  'fop.files': ({ files, profile, root, add }) => {
    if (root === undefined) {
      add('fop.files.info');
      return;
    }
    const sourcesMissing = profile.expectedSourceFiles.filter(path => !files.has(root + path));
    if (sourcesMissing.length) add('fop.source-files.warning', {}, sourcesMissing);
    else add('fop.source-files.pass', { count: profile.expectedSourceFiles.length });
    const assetsMissing = profile.assets.filter(path => !files.has(root + path));
    if (assetsMissing.length) add('fop.assets.warning', {}, assetsMissing);
    else add('fop.assets.pass', { count: profile.assets.length });
  },

  'java.syntax': async context => {
    if (context.root === undefined) return;
    const code = await javaCode(context);
    if (!code) return;
    if (code.syntax.length) {
      context.add(
        'java.syntax.error',
        {},
        code.syntax.map(problem => `${problem.path} (line ${problem.line})`),
      );
    } else {
      context.add('java.syntax.pass', { count: code.files, plural: code.files === 1 ? '' : 's' });
    }
  },

  // Mistakes that are valid syntax but can never compile.
  'java.declarations': async context => {
    if (context.root === undefined) return;
    const code = await javaCode(context);
    if (!code) return;
    // A file with a syntax error is left to the syntax check.
    const types = code.types.filter(type => !type.incomplete);

    const inWrongFile = type =>
      type.top &&
      type.modifiers.includes('public') &&
      !type.path.endsWith('/' + type.name + '.java') &&
      type.path !== type.name + '.java';
    const misplaced = types.filter(inWrongFile);
    if (misplaced.length) {
      const describe = type => `${type.path} (public ${type.kind} ${type.name}, line ${type.line})`;
      context.add('java.filename.error', {}, misplaced.map(describe));
    }

    const repeated = [];
    for (const type of types) {
      for (const members of [type.constructors, type.methods]) {
        const linesBySignature = new Map();
        // Only parameter types written identically count, and not methods with their own
        // type parameters: those can differ in ways the text does not show.
        for (const member of members) {
          if (member.generic) continue;
          const signature = `${member.name}(${member.parameters.join(', ')})`;
          linesBySignature.set(signature, [...(linesBySignature.get(signature) ?? []), member.line]);
        }
        for (const [signature, lines] of linesBySignature) {
          if (lines.length < 2) continue;
          repeated.push(
            `${type.path}: ${signature} (lines ${lines.slice(0, -1).join(', ')} and ${lines.at(-1)})`,
          );
        }
      }
    }
    if (repeated.length) context.add('java.duplicate.error', {}, repeated);
  },

  'fop.availability': async context => {
    if (context.root === undefined) return;
    const code = await javaCode(context);
    if (!code) return;
    let catalogue;
    try {
      catalogue = await readJson(context.profile.availability);
    } catch {
      context.add('java.code.info');
      return;
    }
    // Items in a file with a syntax error are left to the syntax check, which names the file.
    const { problems, compared, files: doubtful } = compareDeclarations(catalogue, code.types, code.unread);
    if (problems.length) context.add('fop.availability.warning', {}, problems);
    else if (!doubtful.length) context.add('fop.availability.pass', { count: compared });
  },

  // Critical only when the project's Java files are exactly the starter's, unchanged.
  'fop.starter': async ({ files, profile, root, add }) => {
    if (root === undefined) return;
    const originals = profile.expectedSourceFiles;
    const java = [...files.values()].filter(
      file => file.path.startsWith(root) && file.path.endsWith('.java'),
    );
    if (java.length !== originals.length) return;
    for (const path of originals) {
      const text = files.get(root + path)?.text;
      if (text == null || (await sha256(normaliseText(text))) !== profile.starter[path]) return;
    }
    add('fop.starter.error');
  },

  'submission.report': ({ files, add }) => {
    const reports = [...files.keys()].filter(path => /\.(docx?|odt|pdf)$/i.test(path));
    if (reports.length) add('submission.report.warning', {}, reports);
  },
};

// Runs the profile's checks on an archive that has been read. Returns the findings.
export async function inspectProject(archive, profile) {
  const findings = [];
  const context = {
    archive,
    profile,
    files: new Map([...archive.files].filter(([path]) => !isSystemFile(path))),
    add: (...args) => findings.push(makeFinding(...args)),
  };
  for (const id of profile.checks) {
    if (!checks[id]) throw new Error(`Unknown check: ${id}`);
    await checks[id](context);
  }
  return findings;
}

// complete is false when the archive could not be read, so the project checks did not run.
export async function checkSubmission(blob, profileId, options = {}) {
  const profile = getProfile(profileId);
  const report = { findings: [], files: [], complete: false };
  try {
    const archive = await readArchive(blob, options);
    report.files = [...archive.files.values()].map(({ path, size }) => ({ path, size }));
    report.findings.push(makeFinding('archive.integrity.pass', { count: archive.files.size }));
    if (blob.name && !/\.zip$/i.test(blob.name))
      report.findings.push(makeFinding('submission.extension.warning'));
    report.findings.push(...(await inspectProject(archive, profile)));
    report.complete = true;
  } catch (error) {
    if (!(error instanceof ArchiveError)) throw error;
    report.findings.push(error.finding);
  }
  return report;
}
