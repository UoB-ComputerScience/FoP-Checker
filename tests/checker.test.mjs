import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { zip, catalogueSources, readCatalogue } from './helpers.mjs';
import {
  checkSubmission,
  detectRoots,
  inspectProject,
  normaliseText,
  codeOnly,
  sha256,
} from '../checker/js/checker.js';
import { inspectMetadata, ArchiveError } from '../checker/js/archive.js';
import { getProfile, COURSEWORKS, LIMITS } from '../checker/js/profiles.js';

const has = (report, id, status) =>
  report.findings.some(f => f.id === id && (!status || f.status === status));
const entriesFor = root => [
  [root + 'nbproject/project.xml', '<project/>'],
  [root + 'nbproject/project.properties', 'src.dir=src\njavac.source=24\njavac.target=24\n'],
  [root + 'nbproject/build-impl.xml', '<project/>'],
  [root + 'build.xml', '<project/>'],
  [root + 'src/Main.java', 'package uk.ac.bradford.farmgame; class Main {}'],
];
const meta = (filename, extra = {}) => ({
  filename,
  uncompressedSize: 1,
  directory: false,
  encrypted: false,
  symlink: false,
  ...extra,
});

test('generic Java ZIP checks file packaging without grading', async () => {
  const result = await checkSubmission(
    await zip([['project/src/Main.java', 'class Main {}']]),
    'java-general',
  );
  assert.equal(result.complete, true);
  assert.ok(has(result, 'java.sources', 'pass'));
  assert.equal(
    result.findings.some(f => f.status === 'error'),
    false,
  );
  assert.deepEqual(Object.keys(result).sort(), ['complete', 'files', 'findings']);
});
test('compiled files alone do not count as source', async () => {
  const result = await checkSubmission(await zip([['dist/Main.class', 'binary']]), 'java-general');
  assert.ok(has(result, 'java.sources', 'error'));
});
test('invalid and truncated ZIPs stop further checks', async () => {
  const good = await zip([['Main.java', 'class Main {}']]);
  for (const file of [
    new File(['not a zip'], 'bad.zip'),
    new File([(await good.arrayBuffer()).slice(0, 30)], 'truncated.zip'),
  ]) {
    const result = await checkSubmission(file, 'java-general');
    assert.equal(result.complete, false);
    assert.equal(result.files.length, 0);
    assert.equal(has(result, 'java.sources'), false);
  }
});
test('CRC corruption is detected, not presented as a completed scan', async () => {
  const original = await zip([['Main.java', 'unique plain source']]);
  const bytes = new Uint8Array(await original.arrayBuffer());
  const marker = Buffer.from(bytes).indexOf('unique plain source');
  assert.ok(marker >= 0);
  bytes[marker] ^= 1;
  const result = await checkSubmission(new File([bytes], 'corrupt.zip'), 'java-general');
  assert.equal(result.complete, false);
  assert.equal(has(result, 'archive.integrity', 'pass'), false);
});
test('empty and encrypted ZIPs explain why checking stopped', async () => {
  const empty = await checkSubmission(await zip([]), 'java-general');
  assert.ok(has(empty, 'archive.empty', 'error'));
  const encrypted = await checkSubmission(
    await zip([['Main.java', 'class Main {}']], { password: 'test-password' }),
    'java-general',
  );
  assert.ok(has(encrypted, 'archive.encrypted', 'error'));
});
test('wrappers and rootless exports resolve to the correct project', async () => {
  for (const root of ['', 'Renamed-Project/', 'wrapper/another/FoPCW2025student/']) {
    const result = await checkSubmission(await zip(entriesFor(root)), 'farm-25-26');
    assert.ok(has(result, 'netbeans.project', 'pass'));
    assert.equal(has(result, 'netbeans.source-path', 'pass'), false);
    assert.ok(has(result, 'netbeans.java-version', 'pass'));
  }
});
test('two projects are ambiguous and coursework path checks are not guessed', async () => {
  const result = await checkSubmission(
    await zip([...entriesFor('one/'), ...entriesFor('one/backup/')]),
    'farm-25-26',
  );
  assert.ok(has(result, 'netbeans.project', 'warning'));
  assert.ok(has(result, 'fop.files', 'info'));
  assert.equal(has(result, 'fop.assets'), false);
});
test('missing src directory is identified from the configuration', async () => {
  const entries = entriesFor('').filter(([p]) => !p.startsWith('src/'));
  entries.push(['wrong/Main.java', 'class Main {}']);
  const result = await checkSubmission(await zip(entries), 'farm-25-26');
  assert.ok(has(result, 'netbeans.source-path', 'error'));
});
test('custom source expressions are not guessed', async () => {
  const entries = entriesFor('');
  entries[1][1] = 'src.dir=${project.source}\njavac.source=24\njavac.target=24';
  const result = await checkSubmission(await zip(entries), 'farm-25-26');
  assert.ok(has(result, 'netbeans.source-path', 'info'));
  assert.equal(has(result, 'netbeans.source-path', 'error'), false);
});
test('valid dot and repeated-slash source settings do not create false errors', async () => {
  for (const source of ['./src', '.', 'src//', './src/']) {
    const entries = entriesFor('project/');
    entries[1][1] = `src.dir=${source}\njavac.source=24\njavac.target=24`;
    const result = await checkSubmission(await zip(entries), 'farm-25-26');
    assert.ok(has(result, 'netbeans.project', 'pass'), source);
    assert.equal(has(result, 'netbeans.source-path', 'error'), false);
  }
});
test('a coursework without starter details runs the general checks only', async () => {
  const { checks, expectedProjectFiles } = getProfile('diver-26-27');
  const profile = { id: 'unreleased', checks: checks.filter(id => !id.startsWith('fop.')), expectedProjectFiles };
  const files = new Map(entriesFor('project/').map(([path, text]) => [path, { path, text, size: text.length }]));
  const result = await inspectProject({ files, portability: [] }, profile);
  assert.deepEqual(
    result.map(f => f.id + ':' + f.status),
    ['java.sources:pass', 'netbeans.project:pass', 'java.syntax:pass'],
  );
});
test('every coursework profile fingerprints each starter source and lists its images', async () => {
  for (const { id } of COURSEWORKS) {
    const profile = getProfile(id);
    assert.ok(profile.checks.includes('fop.starter'), id);
    assert.ok(profile.expectedSourceFiles.includes(profile.rootMarker), id);
    assert.deepEqual(Object.keys(profile.starter).sort(), [...profile.expectedSourceFiles].sort(), id);
    for (const hash of Object.values(profile.starter).flat()) assert.match(hash, /^[0-9a-f]{64}$/, id);
    assert.ok(profile.assets.length && profile.assets.every(path => /^assets\/\w+\.png$/.test(path)), id);
    assert.equal(profile.javaVersion, '24', id);
    const { package: name, types } = JSON.parse(await readFile(profile.availability, 'utf8'));
    const folder = 'src/' + name.replaceAll('.', '/') + '/';
    for (const type of types) assert.ok(profile.starter[folder + type.starter], `${id}: ${type.id}`);
  }
});
test('extra classes are allowed without the obsolete report reminder', async () => {
  const result = await checkSubmission(
    await zip([...entriesFor(''), ['src/NPC.java', 'class NPC {}'], ['assets/custom.png', 'custom']]),
    'farm-25-26',
  );
  assert.equal(has(result, 'submission.report'), false);
  assert.equal(
    result.findings.some(f => f.status === 'error'),
    false,
  );
});
test('a report inside the ZIP is critical, since the brief gives it a mark of zero', async () => {
  for (const name of ['report.docx', 'Report.PDF', 'docs/report.odt', 'report.doc', 'report.rtf']) {
    const result = await checkSubmission(await zip([...entriesFor(''), [name, 'document']]), 'farm-25-26');
    const found = result.findings.filter(f => f.status === 'error');
    assert.deepEqual(found.map(f => [f.id, f.paths]), [['submission.report', [name]]], name);
  }
});
test('a project with no Java file in the coursework package is critical', async () => {
  const other = [...entriesFor('')];
  other[4] = ['src/lab3/Main.java', 'package lab3; class Main {}'];
  const wrong = await checkSubmission(await zip(other), 'diver-26-27');
  const error = wrong.findings.find(f => f.id === 'fop.package');
  assert.equal(error?.status, 'error');
  assert.match(error.title, /not the Diver project/);
  assert.match(error.message, /uk\.ac\.bradford\.divegame/);
  // Last year's coursework, by its folder.
  other[4] = ['src/uk/ac/bradford/farmgame/GameEngine.java', 'package uk.ac.bradford.farmgame; class GameEngine {}'];
  assert.ok(has(await checkSubmission(await zip(other), 'diver-26-27'), 'fop.package', 'error'));
  // Either the folder or the declaration is enough; a comment or longer name does not count.
  for (const [path, text, found] of [
    ['src/uk/ac/bradford/divegame/Main.java', 'class Main {}', true],
    ['src/Main.java', '/* c */ package  uk.ac.bradford.divegame ; class Main {}', true],
    ['src/Main.java', '// package uk.ac.bradford.divegame;\nclass Main {}', false],
    ['src/Main.java', 'package uk.ac.bradford.divegame2; class Main {}', false],
    ['src/Main.java', 'package my.uk.ac.bradford.divegame; class Main {}', false],
  ]) {
    other[4] = [path, text];
    const result = await checkSubmission(await zip(other), 'diver-26-27');
    assert.equal(!has(result, 'fop.package', 'error'), found, text);
  }
});
test('an incomplete export still receives specific expected-file feedback', async () => {
  const result = await checkSubmission(
    await zip(entriesFor('').filter(([p]) => p !== 'build.xml')),
    'farm-25-26',
  );
  assert.equal(has(result, 'netbeans.project', 'pass'), false);
  assert.ok(has(result, 'netbeans.files', 'warning'));
  assert.ok(has(result, 'fop.assets', 'warning'));
});
test('non-UTF-8 source is flagged without claiming the ZIP is broken', async () => {
  const result = await checkSubmission(
    await zip([['Main.java', new Uint8Array([0xff, 0xfe, 0x80])]]),
    'java-general',
  );
  assert.equal(result.complete, true);
  assert.ok(has(result, 'java.encoding', 'warning'));
});
test('metadata safety rejects traversal, duplicate paths, links and file-folder clashes', () => {
  for (const path of [
    '../Main.java',
    'a/../Main.java',
    '/Main.java',
    'C:\\Main.java',
    '\\\\host\\Main.java',
    './Main.java',
    'a//b',
    'a\u0000b',
  ])
    assert.throws(() => inspectMetadata([meta(path)]), ArchiveError);
  for (const pair of [
    ['a.java', 'a.java'],
    ['A.java', 'a.java'],
    ['a/b.java', 'a\\b.java'],
    ['a', 'a/b.java'],
  ])
    assert.throws(() => inspectMetadata(pair.map(p => meta(p))), ArchiveError);
  assert.throws(() => inspectMetadata([meta('link', { symlink: true })]), /symbolic links/);
});
test('a file-folder clash names the path as it is written in the ZIP', () => {
  let error;
  try {
    inspectMetadata([meta('Farm/src/Notes'), meta('Farm/src/Notes/Todo.txt')]);
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof ArchiveError);
  assert.equal(error.id, 'archive.ambiguous');
  assert.deepEqual(error.finding.paths, ['Farm/src/Notes/Todo.txt']);
});
test('checker limits apply before decompression and explain incomplete checking', async () => {
  assert.throws(
    () => inspectMetadata([meta('big', { uncompressedSize: LIMITS.entryBytes + 1 })]),
    ArchiveError,
  );
  const file = await zip([['Main.java', 'class Main {}']]);
  const result = await checkSubmission(file, 'java-general', { limits: { ...LIMITS, archiveBytes: 1 } });
  assert.ok(has(result, 'archive.limit', 'warning'));
  assert.equal(result.complete, false);
});
test('portability warnings preserve filenames as text', () => {
  const result = inspectMetadata([meta('CON.txt'), meta('a/trailing. '), meta('<b>.java')]);
  assert.equal(result.portability.length, 3);
});
test('metadata and backups do not become the detected project', async () => {
  const result = await checkSubmission(
    await zip([...entriesFor('project/'), ['__MACOSX/._build.xml', 'metadata'], ['.DS_Store', 'metadata']]),
    'farm-25-26',
  );
  assert.ok(has(result, 'netbeans.project', 'pass'));
});
test('project marker matching requires a complete path component', () => {
  assert.deepEqual(detectRoots(['notbuild.xml', 'x/notnbproject/project.xml']), []);
});
test('starter comparison ignores BOM, line endings, comments and layout but notices code edits', async () => {
  const path = 'src/Main.java';
  const starter = 'class Main {\n    int x = 1; // set\n}\n';
  const profile = {
    ...getProfile('farm-25-26'),
    expectedSourceFiles: [path],
    starter: { [path]: await sha256(codeOnly(starter)) },
    checks: ['netbeans.project', 'fop.starter'],
  };
  const records = new Map(entriesFor('').map(([path, text]) => [path, { path, text, size: text.length }]));
  const unchanged = async text => {
    records.get(path).text = text;
    const result = await inspectProject({ files: records, portability: [] }, profile);
    return result.some(f => f.id === 'fop.starter' && f.status === 'error');
  };
  for (const text of [
    starter,
    '\uFEFFclass Main {\r\n    int x = 1; // set\r\n}\r\n',
    '/**\n * @author A Student\n */\nclass Main {\n    int x = 1;\n}\n',
    'class Main\n{\n\n\tint x=1;   /* set */\n}',
  ]) {
    assert.equal(await unchanged(text), true, text);
  }
  for (const text of ['class Main { int changed; }', 'class Main {\n    int x = 2;\n}\n', 'class Main {\n    int y = 1;\n}\n']) {
    assert.equal(await unchanged(text), false, text);
  }
  // Extra Java files do not hide an untouched starter.
  records.set('src/Extra.java', { path: 'src/Extra.java', text: 'class Extra {}', size: 14 });
  assert.equal(await unchanged(starter), true);
  assert.equal(normaliseText('\uFEFFx\r\ny\rz'), 'x\ny\nz');
});
test('code comparison keeps literals exactly and words apart', () => {
  assert.equal(
    codeOnly('int a = "x  // y" + \'/\'; /* c */ String t = """\n  a "" b\n"""; a -= b//z\n;'),
    'int a="x  // y"+\'/\';String t="""\n  a "" b\n""";a-=b;',
  );
  assert.equal(codeOnly('public\n  static/**/void'), 'public static void');
  assert.notEqual(codeOnly('s = "a b";'), codeOnly('s = "a  b";'));
});
test('a file that changed between starter releases matches any release, unchanged', async () => {
  const path = 'src/Main.java';
  const releases = ['class Main {\n}\n', 'class Main {\n    int fixed;\n}\n'];
  const profile = {
    ...getProfile('farm-25-26'),
    expectedSourceFiles: [path],
    starter: { [path]: await Promise.all(releases.map(text => sha256(codeOnly(text)))) },
    checks: ['netbeans.project', 'fop.starter'],
  };
  const records = new Map(entriesFor('').map(([path, text]) => [path, { path, text, size: text.length }]));
  const unchanged = async text => {
    records.get(path).text = text;
    const result = await inspectProject({ files: records, portability: [] }, profile);
    return result.some(f => f.id === 'fop.starter' && f.status === 'error');
  };
  for (const text of releases) assert.equal(await unchanged(text), true, text);
  assert.equal(await unchanged('class Main { int changed; }'), false);
});

test('readable ZIP filename is advisory, broken ZIP is critical', async () => {
  const good = await zip([['Main.java', 'class Main {}']]);
  const renamed = await checkSubmission(new File([good], 'project'), 'java-general');
  assert.equal(renamed.complete, true);
  assert.ok(has(renamed, 'submission.extension', 'warning'));
  const broken = await checkSubmission(new File(['broken archive'], 'project.zip'), 'java-general');
  assert.ok(has(broken, 'archive.not-zip', 'error'));
});

test('combined NetBeans pass requires build files and Java in the configured folder', async () => {
  const result = await checkSubmission(await zip(entriesFor('project/')), 'farm-25-26');
  assert.equal(
    result.findings.filter(
      f =>
        f.status === 'pass' && ['netbeans.project', 'netbeans.files', 'netbeans.source-path'].includes(f.id),
    ).length,
    1,
  );
  const entries = entriesFor('project/').filter(([p]) => !p.endsWith('Main.java'));
  entries.push(['project/src/notes.txt', 'Notes'], ['project/other/Main.java', 'class Main {}']);
  const misplaced = await checkSubmission(await zip(entries), 'farm-25-26');
  assert.ok(has(misplaced, 'java.sources', 'pass'));
  assert.ok(has(misplaced, 'netbeans.source-path', 'error'));
  assert.equal(has(misplaced, 'netbeans.project', 'pass'), false);
});
test('compiled output alongside source creates no extra finding', async () => {
  const baseline = await checkSubmission(await zip(entriesFor('')), 'farm-25-26');
  const result = await checkSubmission(
    await zip([...entriesFor(''), ['build/Main.class', 'compiled'], ['dist/game.jar', 'jar']]),
    'farm-25-26',
  );
  // Archive integrity text reports the file count; compare check identities/statuses.
  const findings = r => r.findings.map(f => ({ id: f.id, status: f.status, paths: f.paths }));
  assert.equal(result.complete, baseline.complete);
  assert.deepEqual(findings(result), findings(baseline));
  assert.equal(
    result.findings.some(f => f.status === 'error'),
    false,
  );
});
test('RAR and 7z signatures are advisory regardless of filename', async () => {
  // These synthetic headers test format recognition only, not archive validity.
  const rar = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]);
  const sevenZip = new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4]);
  for (const [bytes, name] of [
    [rar, 'project.rar'],
    [rar, 'project.zip'],
    [sevenZip, 'project.7z'],
    [sevenZip, 'project.zip'],
  ]) {
    const result = await checkSubmission(new File([bytes], name), 'farm-25-26');
    assert.ok(has(result, 'archive.format', 'warning'));
    assert.equal(result.complete, false);
    assert.equal(result.findings.length, 1);
    assert.equal(has(result, 'archive.integrity'), false);
  }
});
test('every check has maintainer reasoning without exposing it in student results', async () => {
  const base = new URL('../checker/', import.meta.url).href;
  const { makeFinding } = await import(base + 'js/findings.js');
  const seen = new Set();
  for (const file of ['project', 'archive', 'report']) {
    const { default: definitions } = await import(base + 'checks/' + file + '.js');
    for (const [key, definition] of Object.entries(definitions)) {
      assert(!seen.has(key));
      seen.add(key);
      assert(definition.purpose.length > 10 && definition.method.length > 10, key);
      const values = Object.fromEntries(
        [...`${definition.title} ${definition.message}`.matchAll(/\{(\w+)\}/g)].map(m => [m[1], 'example']),
      );
      const finding = makeFinding(key, values);
      assert.equal('purpose' in finding, false);
      assert.equal('method' in finding, false);
    }
  }
});

test('individual Java and other non-ZIP files receive a direct ZIP instruction', async () => {
  for (const name of ['GameEngine.java', 'notes.txt', 'build.xml', 'misnamed.zip']) {
    const result = await checkSubmission(new File(['public class GameEngine {}'], name), 'farm-25-26');
    assert.ok(has(result, 'archive.not-zip', 'error'));
    assert.equal(result.findings[0].message, 'Submit a .zip file of your complete NetBeans project.');
    assert.equal(result.complete, false);
  }
});
test('truncated ZIP retains the damaged-archive result', async () => {
  const original = await zip([['Main.java', 'class Main {}']]);
  const result = await checkSubmission(
    new File([(await original.arrayBuffer()).slice(0, -12)], 'project.zip'),
    'farm-25-26',
  );
  assert.ok(has(result, 'archive.unreadable', 'error'));
  assert.equal(has(result, 'archive.not-zip'), false);
});
test('ZIP contents are checked despite a misleading Java filename', async () => {
  const original = await zip([['Main.java', 'class Main {}']]);
  const result = await checkSubmission(new File([original], 'Main.java'), 'java-general');
  assert.equal(result.complete, true);
  assert.ok(has(result, 'archive.integrity', 'pass'));
  assert.ok(has(result, 'submission.extension', 'warning'));
});

const farmCatalogue = await readCatalogue('farm-25-26');
const swap = (type, from, to) => sources => {
  assert.ok(sources.get(type).includes(from), from);
  sources.set(type, sources.get(type).replace(from, to));
};
async function codeFindings(prefix, change = () => {}, coursework = 'farm-25-26', extra = []) {
  const catalogue = await readCatalogue(coursework);
  const sources = catalogueSources(catalogue);
  change(sources);
  const project = entriesFor('').filter(([p]) => !p.endsWith('Main.java'));
  const folder = 'src/' + catalogue.package.replaceAll('.', '/') + '/';
  const report = await checkSubmission(
    await zip([...project, ...[...sources].map(([name, text]) => [`${folder}${name}.java`, text]), ...extra]),
    coursework,
  );
  return Object.fromEntries(report.findings.filter(f => f.id.startsWith(prefix)).map(f => [f.id, f]));
}
const availability = change => codeFindings('fop.availability', change);
const syntax = change => codeFindings('java.syntax', change);
const filename = change => codeFindings('java.filename', change);
const duplicate = change => codeFindings('java.duplicate', change);

test('code matching the availability catalogue passes', async () => {
  const found = await availability();
  assert.deepEqual(Object.keys(found), ['fop.availability']);
  assert.equal(found['fop.availability'].status, 'pass');
  assert.match(found['fop.availability'].title, /^Required code: all \d+ items found$/);
});
test('missing or changed required code is listed by name', async () => {
  const cases = [
    [swap('GameEngine', 'void movePlayer(', 'void walk('), 'GameEngine.movePlayer(int): missing'],
    [
      swap('GameEngine', 'void movePlayer(int p0)', 'void movePlayer(String p0)'),
      'GameEngine.movePlayer(int): expected parameters (int), found (String)',
    ],
    [
      swap('GameEngine', 'public void growCrops()', 'public int growCrops()'),
      'GameEngine.growCrops(): expected return type void, found int',
    ],
    [
      swap('GameEngine', 'void movePlayer(int p0)', 'void movePlayer(int... p0)'),
      'GameEngine.movePlayer(int): expected parameters (int), found (int[])',
    ],
    [
      swap('GameEngine', 'private Tile[][] level;', 'private Tile[] level;'),
      'GameEngine.level: expected type Tile[][], found Tile[]',
    ],
    [swap('GameEngine', 'private int turnNumber;', 'private int turn;'), 'GameEngine.turnNumber: missing'],
    [
      swap('Player', 'public Player(int p0, int p1)', 'public Player(int p0)'),
      'Player(int,int): expected parameters (int, int), found (int)',
    ],
    [swap('Player', ' extends Entity', ''), 'class Player: expected to extend Entity'],
    [swap('Tile', 'BED, ', ''), 'Tile.TileType.BED: missing'],
    [swap('Entity', 'package uk.ac.bradford.farmgame;', 'package other;'), 'class Entity: missing'],
    [sources => sources.delete('Pest'), 'class Pest: missing'],
  ];
  for (const [change, expected] of cases) {
    const found = await availability(change);
    assert.deepEqual(Object.keys(found), ['fop.availability'], expected);
    assert.equal(found['fop.availability'].status, 'warning', expected);
    assert.deepEqual(found['fop.availability'].paths, [expected]);
    assert.equal(found['fop.availability'].list, 'item');
  }
});
test('Diver code matching its catalogue passes, with or without the files NetBeans adds to an export', async () => {
  const diver = (change, extra) => codeFindings('', change, 'diver-26-27', extra);
  const statuses = report => Object.values(report).map(f => `${f.id}:${f.status}`);
  const clean = await diver();
  assert.equal(clean['fop.availability'].status, 'pass');
  // NetBeans writes these when the project is built; keeping them is not a mistake.
  const exported = await diver(undefined, [
    ['build/built-jar.properties', '#built'],
    ['build/classes/uk/ac/bradford/divegame/GameEngine.class', 'compiled'],
    ['dist/FoPCW2026.jar', 'jar'],
    ['nbproject/private/private.properties', 'compile.on.save=true'],
    ['nbproject/private/private.xml', '<project-private/>'],
  ]);
  assert.deepEqual(statuses(exported), statuses(clean));
});
const diverAvailability = change => codeFindings('fop.availability', change, 'diver-26-27');
test('missing or changed Diver code is listed by name', async () => {
  const cases = [
    // Version 1.1 of the specification named these betterMoveUp() and so on.
    [swap('GameEngine', 'void betterMoveDiverUp(', 'void betterMoveUp('), 'GameEngine.betterMoveDiverUp(): missing'],
    [
      swap('GameEngine', 'void efficientMoveDiver(char p0)', 'void efficientMoveDiver(String p0)'),
      'GameEngine.efficientMoveDiver(char): expected parameters (char), found (String)',
    ],
    [
      swap('GameEngine', 'public void doTurn()', 'public int doTurn()'),
      'GameEngine.doTurn(): expected return type void, found int',
    ],
    [
      swap('GameEngine', 'private MapTile[][] map;', 'private MapTile[] map;'),
      'GameEngine.map: expected type MapTile[][], found MapTile[]',
    ],
    [
      swap('GameEngine', 'private Entity[] entityArray;', 'private Entity[][] entityArray;'),
      'GameEngine.entityArray: expected type Entity[], found Entity[][]',
    ],
    [swap('GameEngine', 'private int score;', 'private int points;'), 'GameEngine.score: missing'],
    [
      swap('MapTile', 'boolean isType(MapTile.TileType p0)', 'boolean isType(int p0)'),
      'MapTile.isType(MapTile.TileType): expected parameters (MapTile.TileType), found (int)',
    ],
    [swap('MapTile', ', ROCK_WALL', ''), 'MapTile.TileType.ROCK_WALL: missing'],
    [
      swap('Diver', 'public Diver(int p0, int p1)', 'public Diver(int p0)'),
      'Diver(int,int): expected parameters (int, int), found (int)',
    ],
    [swap('Diver', 'public void fillAir() {}', ''), 'Diver.fillAir(): missing'],
    [
      swap('Entity', 'public String getType()', 'public int getType()'),
      'Entity.getType(): expected return type String, found int',
    ],
    [swap('Shark', ' extends Entity', ''), 'class Shark: expected to extend Entity'],
    [swap('Entity', 'package uk.ac.bradford.divegame;', 'package other;'), 'class Entity: missing'],
    [sources => sources.delete('SubmarineLeft'), 'class SubmarineLeft: missing'],
    // The marking tests make the engine and its window, and start the game as Launcher does.
    [
      swap('GameEngine', 'public GameEngine(GameGUI p0)', 'public GameEngine()'),
      'GameEngine(GameGUI): expected parameters (GameGUI), found ()',
    ],
    [swap('GameGUI', ' extends JFrame', ''), 'class GameGUI: expected to extend JFrame'],
    [swap('GameGUI', 'public void registerKeyHandler(InputHandler p0) {}', ''), 'GameGUI.registerKeyHandler(InputHandler): missing'],
    [
      swap('InputHandler', 'public InputHandler(GameEngine p0)', 'public InputHandler(GameGUI p0)'),
      'InputHandler(GameEngine): expected parameters (GameEngine), found (GameGUI)',
    ],
  ];
  for (const [change, expected] of cases) {
    const found = await diverAvailability(change);
    assert.deepEqual(Object.keys(found), ['fop.availability'], expected);
    assert.equal(found['fop.availability'].status, 'warning', expected);
    assert.deepEqual(found['fop.availability'].paths, [expected]);
  }
});
test('equivalent Diver declarations, changed access, inheritance and extra code are accepted', async () => {
  const changes = [
    swap('GameEngine', 'private MapTile[][] map;', 'private MapTile map[][];'),
    swap('GameEngine', 'private Random rng;', 'private java.util.Random rng = new java.util.Random(123);'),
    swap('GameEngine', 'private void createDiver()', 'public void createDiver()'),
    // A larger map (Task 20) may make the level size changeable.
    swap('GameEngine', 'public static final int LEVEL_WIDTH;', 'public static int LEVEL_WIDTH = 72;'),
    swap('GameEngine', 'void efficientMoveDiver(char p0)', 'void efficientMoveDiver(final char p0)'),
    swap(
      'MapTile',
      'public MapTile(MapTile.TileType p0)',
      'public MapTile(uk.ac.bradford.divegame.MapTile.TileType p0)',
    ),
    swap('MapTile', 'public MapTile.TileType getType()', 'public TileType getType()'),
    // New tiles for currents (Task 16).
    swap('MapTile', 'SHALLOW_SEA, ', 'CURRENT_LEFT, CURRENT_RIGHT, SHALLOW_SEA, '),
    // Air moved to a supertype is still available to the diver.
    sources => {
      swap('Diver', 'public int getAir() {}', '')(sources);
      swap('Entity', 'public int getX() {}', 'public int getX() {}\npublic int getAir() { return 0; }')(sources);
    },
    // A shared creature class (Task 15) between Shark and Entity.
    sources => {
      swap('Shark', ' extends Entity', ' extends Creature')(sources);
      sources.set('Creature', 'package uk.ac.bradford.divegame;\npublic abstract class Creature extends Entity {}\n');
    },
  ];
  for (const [index, change] of changes.entries()) {
    const found = await diverAvailability(change);
    assert.deepEqual(Object.keys(found), ['fop.availability'], 'case ' + index);
    assert.equal(found['fop.availability'].status, 'pass', 'case ' + index);
  }
});
test('equivalent declarations, changed access, inheritance and extra code are accepted', async () => {
  const changes = [
    swap('GameEngine', 'private Tile[][] level;', 'private Tile level[][];'),
    swap('GameEngine', 'private void createPlayer()', 'public void createPlayer()'),
    swap('GameEngine', 'public void movePlayer(int p0)', 'void movePlayer(int p0)'),
    swap('GameEngine', 'private Tile[][] level;', 'public static Tile[][] level;'),
    swap(
      'GameEngine',
      'private int money;',
      'private int money = 0, bonus; // comment\n/* block */ private java.util.Random rng;',
    ),
    swap('Tile', 'public Tile(Tile.TileType p0)', 'public Tile(uk.ac.bradford.farmgame.Tile.TileType p0)'),
    swap('Tile', 'public Tile.TileType getType()', 'public TileType getType()'),
    swap('Tile', 'AXE_BOX, ', 'SIGNPOST, AXE_BOX, '),
    sources => {
      swap('Player', ' extends Entity', ' extends Being')(sources);
      sources.set('Being', 'package uk.ac.bradford.farmgame;\npublic class Being extends Entity {}\n');
    },
  ];
  for (const [index, change] of changes.entries()) {
    const found = await availability(change);
    assert.deepEqual(Object.keys(found), ['fop.availability'], 'case ' + index);
    assert.equal(found['fop.availability'].status, 'pass', 'case ' + index);
  }
});
test('a syntax error is reported with its file and line, without calling its code missing', async () => {
  const clean = await syntax();
  assert.equal(clean['java.syntax'].status, 'pass');
  assert.match(clean['java.syntax'].title, /^Java syntax: \d+ files checked$/);
  const broken = swap('GameEngine', 'public void growCrops() {}', 'public void growCrops() { int x = ; }');
  const line =
    catalogueSources(farmCatalogue)
      .get('GameEngine')
      .split('\n')
      .findIndex(l => l.includes('growCrops')) + 1;
  const found = await syntax(broken);
  assert.equal(found['java.syntax'].status, 'error');
  assert.deepEqual(found['java.syntax'].paths, [
    `src/uk/ac/bradford/farmgame/GameEngine.java (line ${line})`,
  ]);
  // A syntax error alone hides nothing here, so every required item is still found.
  assert.equal((await availability(broken))['fop.availability'].status, 'pass');
  // An item that cannot be found in that file is left to the syntax finding.
  assert.deepEqual(
    await availability(sources => {
      broken(sources);
      swap('GameEngine', 'void movePlayer(', 'void walk(')(sources);
    }),
    {},
  );
});
test('a public class in a file of another name is critical', async () => {
  assert.deepEqual(await filename(), {});
  const rename = (from, to) => sources => {
    sources.set(to, sources.get(from));
    sources.delete(from);
  };
  const found = await filename(rename('Player', 'player'));
  assert.equal(found['java.filename'].status, 'error');
  assert.deepEqual(found['java.filename'].paths, [
    'src/uk/ac/bradford/farmgame/player.java (public class Player, line 2)',
  ]);
  assert.deepEqual(
    (await filename(swap('Rock', 'public class Rock', 'public class Stone')))['java.filename'].paths,
    ['src/uk/ac/bradford/farmgame/Rock.java (public class Stone, line 2)'],
  );
  const allowed = [
    swap('Rock', 'public class Rock', 'class Stone'),
    sources => sources.set('Rock', sources.get('Rock') + 'class Pebble {}\ninterface Hard {}\n'),
    sources =>
      sources.set(
        'Rock',
        sources
          .get('Rock')
          .replace(/}\s*$/, 'public static class Pebble {}\npublic enum Size { SMALL }\n}\n'),
      ),
    // A file with a syntax error is reported by the syntax check alone.
    sources => {
      rename('Player', 'player')(sources);
      sources.set('player', sources.get('player').replace('getHeldItem() {}', 'getHeldItem() { int x = ; }'));
    },
  ];
  for (const [index, change] of allowed.entries())
    assert.deepEqual(await filename(change), {}, 'case ' + index);
});
test('a method or constructor written twice is critical, and overloads are not', async () => {
  assert.deepEqual(await duplicate(), {});
  const add = (type, code) =>
    swap(type, 'public Player(int p0, int p1) {}', 'public Player(int p0, int p1) {}\n' + code);
  const line =
    catalogueSources(farmCatalogue)
      .get('Player')
      .split('\n')
      .findIndex(l => l.includes('Player(int p0, int p1)')) + 1;
  const at = (signature, ...offsets) =>
    `src/uk/ac/bradford/farmgame/Player.java: ${signature} (lines ${offsets
      .slice(0, -1)
      .map(o => line + o)
      .join(', ')} and ${line + offsets.at(-1)})`;
  const cases = [
    ['void m(int a) {}\nvoid m(int b) { a(); }', at('m(int)', 1, 2)],
    ['public Player(final int x, int   y) {}', at('Player(int, int)', 0, 1)],
    [
      'void m(int[] a) {}\nvoid m(int... a) {}\nprivate static int m(int a[]) { return 0; }',
      at('m(int[])', 1, 2, 3),
    ],
    [
      'void m(java.util.List<String> a, Tile[][] b) {}\nvoid other() {}\nvoid m(java.util.List<String> c, Tile d[][]) {}',
      at('m(java.util.List<String>, Tile[][])', 1, 3),
    ],
  ];
  for (const [code, expected] of cases) {
    const found = await duplicate(add('Player', code));
    assert.equal(found['java.duplicate'].status, 'error', code);
    assert.deepEqual(found['java.duplicate'].paths, [expected]);
    assert.equal(found['java.duplicate'].list, 'method');
  }
  // Each of these compiles.
  const valid = [
    'void m(int a) {}\nvoid m(String a) {}\nvoid m(int a, int b) {}\nvoid m() {}',
    'void Player(int a, int b) {}',
    '<T extends Number> void g(T a) {}\n<T extends CharSequence> void g(T a) {}',
    'Runnable r = new Runnable() { public void run() {} };\npublic void run() {}',
    'class Inner { void m(int a) {} }\nvoid m(int a) {}\nstatic class Other { void m(int a) {} }',
    'void m(int a) {}\nvoid m(Integer a) {}\nvoid m(int[] a) {}\nvoid m(int[][] a) {}',
  ];
  for (const code of valid) assert.deepEqual(await duplicate(add('Player', code)), {}, code);
  // A file with a syntax error is reported by the syntax check alone.
  assert.deepEqual(await duplicate(add('Player', 'void m() {}\nvoid m() { int x = ; }')), {});
});
test('common syntax mistakes are caught and valid modern Java is not', async () => {
  const method = body =>
    swap('Player', 'public Player(int p0, int p1) {}', 'public Player(int p0, int p1) {}\n' + body);
  const mistakes = [
    'void m() { int x = 1 int y = 2; }',
    'void m() { if (true) { int x = 1; }',
    'void m() { if (true { int x = 1; } }',
    'void m() { String s = "hello; }',
    'void m() { int x = 1; else { x = 2; } }',
    'pubic void m() { }',
    'void m() { for (int i = 0; i < 3, i++) { } }',
  ];
  for (const mistake of mistakes)
    assert.equal((await syntax(method(mistake)))['java.syntax'].status, 'error', mistake);
  const valid = [
    'record P(int x, int y) {} String g(Object o) { return switch (o) { case null -> "n"; case Integer i when i > 5 -> "big"; case P(int x, _) -> "p"; default -> "o"; }; }',
    'int f(int k) { var y = switch (k) { case 1, 2 -> 10; default -> { yield 0; } }; String t = """\n  text "block"\n  """; return y + t.length(); }',
    '<T extends Comparable<? super T>> T max(java.util.List<? extends T> items) { for (T _ : items) { } Runnable r = () -> {}; java.util.function.IntFunction<int[]> a = int[]::new; return null; }',
    'enum Dir { UP(0, -1), LEFT(-1, 0) { @Override int cost() { return 2; } }; final int dx, dy; Dir(int dx, int dy) { this.dx = dx; this.dy = dy; } int cost() { return 1; } }',
    'void flow() throws Exception { outer: for (int i = 0, j = 5; i < j; i++, j--) { if (i == 2) continue outer; } try (java.util.Scanner s = new java.util.Scanner("x")) { s.next(); } catch (IllegalStateException | IllegalArgumentException e) { } finally { } int[][] g = {{1, 2}, {3}}; long big = 1_000_000L + 0x1F + 0b10; }',
  ];
  for (const code of valid) assert.equal((await syntax(method(code)))['java.syntax'].status, 'pass', code);
});

test('the Java version is advisory only when it is below the coursework version', async () => {
  const javaVersion = async settings => {
    const entries = entriesFor('');
    entries[1][1] = 'src.dir=src\n' + settings;
    const result = await checkSubmission(await zip(entries), 'farm-25-26');
    return result.findings.find(f => f.id === 'netbeans.java-version');
  };
  for (const settings of [
    'javac.source=24\njavac.target=24',
    'javac.source=26\njavac.target=26',
    'javac.release=25',
    'javac.source=${default.javac.source}\njavac.target=${javac.source}',
    '',
  ]) {
    assert.equal((await javaVersion(settings)).status, 'pass', settings);
  }
  // Written the other ways Java allows, and as NetBeans writes Java 8.
  const older = await javaVersion('javac.source: 21\njavac.target 1.8\njavac.release=24');
  assert.equal(older.status, 'warning');
  assert.match(older.message, /^Found javac\.source=21, javac\.target=1\.8\. /);
});
test('a project without its settings file gets no Java version finding', async () => {
  const entries = entriesFor('').filter(([path]) => path !== 'nbproject/project.properties');
  const result = await checkSubmission(await zip(entries), 'farm-25-26');
  assert.equal(has(result, 'netbeans.java-version'), false);
  assert.ok(has(result, 'netbeans.files', 'warning'));
});
