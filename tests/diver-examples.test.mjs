// Dummy Diver 26/27 submissions, in the style of the Farm NetBeans export examples: each is a
// ZIP a student might hand in, with the findings it should get. The projects are built here
// from availability.json, so no starter code is kept in the repository.
//
// Test files that are not kept in git are shared beside the repository, in
// ../TestFiles/<coursework>/ (TestFiles/Diver/ for this one):
// - Starters/: the real starter ZIPs, FoPCW2026.zip, FoPCW2026-1.zip and FoPCW2026-2.zip,
//   checked unchanged and with one method written. Without them those tests are skipped.
// - NetBeans-exports/: where WRITE_EXAMPLES=1 writes the dummy ZIPs, to try in the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { ZipReader, BlobReader, Uint8ArrayWriter } from '../checker/vendor/zip.js';
import { checkSubmission } from '../checker/js/checker.js';
import { getProfile } from '../checker/js/profiles.js';
import { zip, catalogueSources, readCatalogue } from './helpers.mjs';

const profile = getProfile('diver-26-27');
const catalogue = await readCatalogue('diver-26-27');
const folder = 'src/uk/ac/bradford/divegame/';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// A completed-looking project: the catalogue's declarations with a little code, the four
// starter classes the catalogue does not list, the images and the NetBeans files.
function project({ root = 'FoPCW2026/', properties = {}, change = () => {} } = {}) {
  const sources = catalogueSources(catalogue);
  const pkg = `package ${catalogue.package};\n`;
  sources.set('GameGUI', `${pkg}public class GameGUI {}\n`);
  sources.set('InputHandler', `${pkg}public class InputHandler {}\n`);
  sources.set('Launcher', `${pkg}public class Launcher {\npublic static void main(String[] args) {}\n}\n`);
  sources.set('Urchin', `${pkg}public class Urchin extends Entity {\npublic Urchin(int x, int y) {}\n}\n`);
  sources.set(
    'GameEngine',
    sources.get('GameEngine').replace('private void createDiver() {}', 'private void createDiver() { diver = new Diver(5, 1); }'),
  );
  change(sources);
  const settings = { 'src.dir': 'src', 'test.src.dir': 'test', 'javac.source': '24', 'javac.target': '24', ...properties };
  return [
    [root + 'build.xml', '<project name="FoPCW2026" default="default" basedir="."/>'],
    [root + 'nbproject/build-impl.xml', '<project name="FoPCW2026-impl"/>'],
    [root + 'nbproject/genfiles.properties', 'build.xml.data.CRC32=0\n'],
    [root + 'nbproject/project.properties', Object.entries(settings).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'],
    [root + 'nbproject/project.xml', '<project xmlns="http://www.netbeans.org/ns/project/1"/>'],
    ...profile.assets.map(path => [root + path, png]),
    ...[...sources].map(([name, text]) => [`${root}${folder}${name}.java`, text]),
  ];
}
const swap = (type, from, to) => sources => {
  assert.ok(sources.get(type).includes(from), from);
  sources.set(type, sources.get(type).replace(from, to));
};
const without = (entries, ...ends) => entries.filter(([path]) => !ends.some(end => path.endsWith(end)));
const named = async (entries, name, options) => {
  const file = await zip(entries, options);
  return new File([file], name, { type: file.type });
};
const bytesOf = async file => new Uint8Array(await file.arrayBuffer());

// The findings of a complete, readable project with nothing to report.
const PASSED = [
  'archive.integrity:pass',
  'java.sources:pass',
  'netbeans.project:pass',
  'netbeans.java-version:pass',
  'fop.source-files:pass',
  'fop.assets:pass',
  'java.syntax:pass',
  'fop.availability:pass',
];
const plus = (...extra) => [...PASSED, ...extra];
const replacing = (from, to) => PASSED.map(id => (id === from ? to : id));

const examples = [
  {
    file: '01-complete-project.zip',
    description: 'Completed-looking project exported from NetBeans: sources, images and project files.',
    make: () => named(project(), '01-complete-project.zip'),
    expected: PASSED,
  },
  {
    file: '02-export-without-extension',
    description: 'The same ZIP saved without .zip on the end of its name.',
    make: () => named(project(), '02-export-without-extension'),
    expected: plus('submission.extension:warning'),
  },
  {
    file: '03-project name with spaces.ZIP',
    description: 'Renamed project folder with spaces, and an upper-case .ZIP: all acceptable.',
    make: () => named(project({ root: 'Diver Coursework 24012345/' }), '03-project name with spaces.ZIP'),
    expected: PASSED,
  },
  {
    file: '04-no-wrapper-folder.zip',
    description: 'Project files at the top of the ZIP, with no project folder around them.',
    make: () => named(project({ root: '' }), '04-no-wrapper-folder.zip'),
    expected: PASSED,
  },
  {
    file: '05-netbeans-build-output.zip',
    description: 'Built in NetBeans before exporting: build/, dist/FoPCW2026.jar and nbproject/private/ kept, as in FoPCW2026-1.zip.',
    make: () =>
      named(
        [
          ...project(),
          ['FoPCW2026/build/built-jar.properties', '#Thu, 19 Nov 2026 14:00:00 +0000\n'],
          ['FoPCW2026/build/classes/uk/ac/bradford/divegame/GameEngine.class', png],
          ['FoPCW2026/dist/FoPCW2026.jar', png],
          ['FoPCW2026/nbproject/private/private.properties', 'compile.on.save=true\n'],
          ['FoPCW2026/nbproject/private/private.xml', '<project-private/>'],
        ],
        '05-netbeans-build-output.zip',
      ),
    expected: PASSED,
  },
  {
    file: '06-zipped-on-a-mac.zip',
    description: 'Compressed with the macOS Finder, which adds __MACOSX/ and .DS_Store files.',
    make: () =>
      named(
        [...project(), ['__MACOSX/FoPCW2026/._build.xml', png], ['FoPCW2026/.DS_Store', png]],
        '06-zipped-on-a-mac.zip',
      ),
    expected: PASSED,
  },
  {
    file: '07-interrupted-export.zip',
    description: 'The end of the ZIP is missing, as if a copy or download stopped early.',
    make: async () => new File([(await bytesOf(await zip(project()))).slice(0, -200)], '07-interrupted-export.zip'),
    expected: ['archive.unreadable:error'],
    complete: false,
  },
  {
    file: '08-damaged-source-data.zip',
    description: 'One byte of GameEngine.java no longer matches the checksum the ZIP recorded.',
    make: async () => {
      const bytes = await bytesOf(await zip(project()));
      const at = Buffer.from(bytes).indexOf('diver = new Diver(5, 1);');
      assert.ok(at > 0);
      bytes[at] ^= 1;
      return new File([bytes], '08-damaged-source-data.zip');
    },
    expected: ['archive.unreadable:error'],
    complete: false,
  },
  {
    file: '09-password-protected.zip',
    description: 'Exported with a password (archive-test). The checker asks for a ZIP without one.',
    make: () => named(project(), '09-password-protected.zip', { password: 'archive-test' }),
    expected: ['archive.encrypted:error'],
    complete: false,
  },
  {
    file: '10-java-file-renamed.zip',
    description: 'GameEngine.java on its own, renamed to .zip. Not a ZIP of the project.',
    make: async () => new File([project().find(([path]) => path.endsWith('GameEngine.java'))[1]], '10-java-file-renamed.zip'),
    expected: ['archive.not-zip:error'],
    complete: false,
  },
  {
    file: '11-report-inside-zip.zip',
    description: 'The Word report put inside the ZIP. It must also be submitted on its own.',
    make: () => named([...project(), ['FoPCW2026/Report.docx', png]], '11-report-inside-zip.zip'),
    expected: plus('submission.report:warning'),
  },
  {
    file: '12-backup-copies.zip',
    description: 'Older copies of edited classes left beside them.',
    make: () =>
      named(
        [
          ...project(),
          [`FoPCW2026/${folder}GameEngine.java.bak`, '// old'],
          [`FoPCW2026/${folder}GameEngine.java~`, '// old'],
          [`FoPCW2026/${folder}MapTile.java.old`, '// old'],
        ],
        '12-backup-copies.zip',
      ),
    expected: plus('archive.backups:warning'),
  },
  {
    file: '13-older-export-inside.zip',
    description: 'An earlier export of the project saved inside the project folder.',
    make: async () =>
      named(
        [...project(), ['FoPCW2026/FoPCW2026-week3.zip', await bytesOf(await zip(project()))]],
        '13-older-export-inside.zip',
      ),
    expected: plus('archive.nested:warning'),
  },
  {
    file: '14-two-projects.zip',
    description: 'The project and a backup copy of it in one ZIP, so the checker cannot tell which to check.',
    make: () => named([...project(), ...project({ root: 'FoPCW2026/backup/FoPCW2026/' })], '14-two-projects.zip'),
    expected: ['archive.integrity:pass', 'java.sources:pass', 'netbeans.project:warning', 'fop.files:info'],
  },
  {
    file: '15-missing-images.zip',
    description: 'The shark and chest images were deleted from assets/.',
    make: () => named(without(project(), 'assets/shark.png', 'assets/chest.png'), '15-missing-images.zip'),
    expected: replacing('fop.assets:pass', 'fop.assets:warning'),
  },
  {
    file: '16-unused-class-deleted.zip',
    description: 'Urchin.java deleted. No task needs it, so only the missing starter file is mentioned.',
    make: () => named(without(project(), '/Urchin.java'), '16-unused-class-deleted.zip'),
    expected: replacing('fop.source-files:pass', 'fop.source-files:warning'),
  },
  {
    file: '17-older-java-version.zip',
    description: 'Source/Binary Format set to Java 21 in the project properties.',
    make: () =>
      named(project({ properties: { 'javac.source': '21', 'javac.target': '21' } }), '17-older-java-version.zip'),
    expected: replacing('netbeans.java-version:pass', 'netbeans.java-version:warning'),
  },
  {
    file: '18-missing-bracket.zip',
    description: 'A closing bracket missing in GameEngine.java. Its methods are not reported as missing.',
    make: () =>
      named(
        project({ change: swap('GameEngine', 'private void createDiver() { diver = new Diver(5, 1); }', 'private void createDiver() { diver = new Diver(5, 1);') }),
        '18-missing-bracket.zip',
      ),
    expected: replacing('java.syntax:pass', 'java.syntax:error').filter(id => id !== 'fop.availability:pass'),
  },
  {
    file: '19-old-movement-names.zip',
    description: "betterMoveDiverUp() renamed to betterMoveUp(), the name in version 1.1 of the specification's Task 4.",
    make: () =>
      named(project({ change: swap('GameEngine', 'void betterMoveDiverUp(', 'void betterMoveUp(') }), '19-old-movement-names.zip'),
    expected: replacing('fop.availability:pass', 'fop.availability:warning'),
  },
  {
    file: '20-changed-method-signature.zip',
    description: 'efficientMoveDiver(char) changed to take a String, so the keyboard code no longer matches it.',
    make: () =>
      named(
        project({ change: swap('GameEngine', 'void efficientMoveDiver(char p0)', 'void efficientMoveDiver(String p0)') }),
        '20-changed-method-signature.zip',
      ),
    expected: replacing('fop.availability:pass', 'fop.availability:warning'),
  },
  {
    file: '21-class-renamed.zip',
    description: 'The class in Shark.java renamed to Predator, without renaming the file.',
    make: () =>
      named(project({ change: swap('Shark', 'public class Shark', 'public class Predator') }), '21-class-renamed.zip'),
    expected: [...replacing('fop.availability:pass', 'fop.availability:warning'), 'java.filename:error'],
  },
  {
    file: '22-method-written-twice.zip',
    description: 'createDiver() pasted in twice.',
    make: () =>
      named(
        project({ change: swap('GameEngine', 'private void createDiver()', 'private void createDiver() {}\nprivate void createDiver()') }),
        '22-method-written-twice.zip',
      ),
    expected: plus('java.duplicate:error'),
  },
  {
    file: '23-sources-outside-src.zip',
    description: 'The Java files moved into a source/ folder while the project still names src/.',
    make: () =>
      named(
        project().map(([path, content]) => [path.replace('FoPCW2026/src/', 'FoPCW2026/source/'), content]),
        '23-sources-outside-src.zip',
      ),
    expected: [
      'archive.integrity:pass',
      'java.sources:pass',
      'netbeans.source-path:error',
      'netbeans.java-version:pass',
      'fop.source-files:warning',
      'fop.assets:pass',
      'java.syntax:pass',
      'fop.availability:pass',
    ],
  },
];

const writing = process.env.WRITE_EXAMPLES === '1';
const shared = new URL('../../TestFiles/Diver/', import.meta.url);
const output = new URL('NetBeans-exports/', shared);
if (writing) await mkdir(output, { recursive: true });
const findings = report => report.findings.map(f => `${f.id}:${f.status}`).sort();

for (const example of examples) {
  test(`Diver example ${example.file}: ${example.description}`, async () => {
    const file = await example.make();
    if (writing) await writeFile(new URL(encodeURIComponent(example.file), output), await bytesOf(file));
    const report = await checkSubmission(file, 'diver-26-27');
    assert.equal(report.complete, example.complete ?? true);
    assert.deepEqual(findings(report), [...example.expected].sort());
  });
}

// The real starter releases, unchanged and then with one method completed.
async function entriesOf(file) {
  const reader = new ZipReader(new BlobReader(file));
  const entries = [];
  for (const entry of await reader.getEntries()) {
    if (!entry.directory) entries.push([entry.filename, await entry.getData(new Uint8ArrayWriter())]);
  }
  await reader.close();
  return entries;
}
for (const release of ['FoPCW2026.zip', 'FoPCW2026-1.zip', 'FoPCW2026-2.zip']) {
  const path = new URL(`Starters/${release}`, shared);
  const bytes = await readFile(path).catch(() => null);
  test(`starter release ${release} is unchanged; with one method written it is not`, { skip: !bytes && 'not in TestFiles/Diver/Starters/' }, async () => {
    const unchanged = await checkSubmission(new File([bytes], release), 'diver-26-27');
    assert.deepEqual(findings(unchanged), plus('fop.starter:error').sort());

    const entries = await entriesOf(new File([bytes], release));
    const engine = entries.find(([name]) => name.endsWith(folder + 'GameEngine.java'));
    const text = new TextDecoder().decode(engine[1]);
    const completed = text.replace(/(private void createDiver\(\) \{\r?\n)/, '$1        diver = new Diver(5, 1);\n');
    assert.notEqual(completed, text);
    engine[1] = new TextEncoder().encode(completed);
    const edited = await checkSubmission(await named(entries, release), 'diver-26-27');
    assert.deepEqual(findings(edited), [...PASSED].sort());
  });
}
