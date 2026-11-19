// Shared by the test files: building ZIPs in memory and Java sources from a coursework's
// availability.json, so no starter code is kept in the repository.
import { readFile } from 'node:fs/promises';
import { ZipWriter, Uint8ArrayWriter, Uint8ArrayReader, TextReader } from '../checker/vendor/zip.js';

// entries: [name, text or bytes].
export async function zip(entries, options = {}) {
  const writer = new Uint8ArrayWriter();
  const zip = new ZipWriter(writer, { useWebWorkers: false, level: 0, ...options });
  for (const [name, content] of entries)
    await zip.add(
      name,
      content instanceof Uint8Array ? new Uint8ArrayReader(content) : new TextReader(content),
    );
  return new File([await zip.close()], 'coursework.zip', { type: 'application/zip' });
}

export const readCatalogue = async id =>
  JSON.parse(await readFile(new URL(`../${id}/availability.json`, import.meta.url), 'utf8'));

// Declarations only, written from the catalogue, so no starter code is published here.
export function catalogueSources(catalogue) {
  const declare = type => {
    const name = type.id.split('.').at(-1);
    const constants = type.members.filter(m => m.kind === 'constant').map(m => m.name);
    const members = type.members
      .filter(m => m.kind !== 'constant')
      .map(m => {
        const modifiers = m.modifiers.join(' ');
        if (m.kind === 'field') return `${modifiers} ${m.type} ${m.name};`;
        const parameters = m.parameters.map((p, i) => `${p} p${i}`).join(', ');
        return m.kind === 'method'
          ? `${modifiers} ${m.returns} ${m.name}(${parameters}) {}`
          : `${modifiers} ${name}(${parameters}) {}`;
      });
    const nested = catalogue.types.filter(t => t.nestedIn === type.id).map(declare);
    const heading = `${type.modifiers.join(' ')} ${type.kind} ${name}${type.extends ? ' extends ' + type.extends : ''}${type.implements ? ' implements ' + type.implements.join(', ') : ''}`;
    return `${heading} {\n${[constants.length ? constants.join(', ') + ';' : '', ...members, ...nested].filter(Boolean).join('\n')}\n}`;
  };
  return new Map(
    catalogue.types
      .filter(t => !t.nestedIn)
      .map(t => [t.id, `package ${catalogue.package};\n${declare(t)}\n`]),
  );
}
