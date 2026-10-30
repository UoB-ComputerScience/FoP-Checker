// Turns a check's key, such as 'java.sources.pass', into the finding shown to the student,
// using the wording in checks/*.js. purpose and method stay out of it: they are for maintainers.
import project from '../checks/project.js';
import report from '../checks/report.js';
import archive from '../checks/archive.js';

const definitions = { ...project, ...report, ...archive };
const statuses = new Set(['error', 'warning', 'pass', 'info']);

// values fill the {placeholders} in the title and message; paths are listed under the finding.
export function makeFinding(key, values = {}, paths = []) {
  const definition = definitions[key];
  if (!definition || !statuses.has(definition.status)) throw new Error(`Invalid check definition: ${key}`);
  const format = text =>
    text.replace(/\{(\w+)\}/g, (_, name) => {
      if (!Object.hasOwn(values, name)) throw new Error(`Missing ${name} for check ${key}`);
      return String(values[name]);
    });
  const finding = {
    id: definition.id,
    status: definition.status,
    title: format(definition.title),
    message: format(definition.message),
    paths,
  };
  // What the paths are, for the "Show 3 …s" summary; file paths unless the definition says.
  if (definition.list) finding.list = definition.list;
  return finding;
}
