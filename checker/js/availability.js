// Compares the Java types declared in a submission with a year's availability.json.
// Compared: kind, names, parameter types, return and field types, and extends; inherited
// members count. Access, static, final and abstract are not compared: real submissions
// change them without affecting the marking tests.

// The simple name of a type: java.util.List<String> → List.
const simpleName = name => name.replace(/<.*/, '').split('.').at(-1);

// int[][] → ['int', '[][]']
function splitArray(type) {
  const at = type.indexOf('[');
  return at < 0 ? [type, ''] : [type.slice(0, at), type.slice(at)];
}

// The same array dimensions, and one name is the other with or without its package.
function sameType(expected, found) {
  const [expectedName, expectedArray] = splitArray(expected);
  const [foundName, foundArray] = splitArray(found);
  if (expectedArray !== foundArray) return false;
  return (
    expectedName === foundName ||
    expectedName.endsWith('.' + foundName) ||
    foundName.endsWith('.' + expectedName)
  );
}

function sameParameters(expected, found) {
  return expected.length === found.length && expected.every((type, i) => sameType(type, found[i]));
}

const parameterList = types => `(${types.join(', ')})`;

// What is wrong with one expected member, or undefined if the submission has it as expected.
// lineage: the type followed by the supertypes it extends within the submission.
function memberProblem(member, type, lineage) {
  // Private members of a supertype are not inherited.
  const visible = (owner, declaration) => owner === type || !declaration.modifiers.includes('private');

  if (member.kind === 'constant') {
    return type.constants.includes(member.name) ? undefined : 'missing';
  }
  if (member.kind === 'field') {
    const owner = lineage.find(t => t.fields.has(member.name) && visible(t, t.fields.get(member.name)));
    if (!owner) return 'missing';
    const field = owner.fields.get(member.name);
    if (!sameType(member.type, field.type)) return `expected type ${member.type}, found ${field.type}`;
    return undefined;
  }
  if (member.kind === 'method') {
    const named = lineage.flatMap(t => t.methods.filter(m => m.name === member.name && visible(t, m)));
    if (!named.length) return 'missing';
    const method = named.find(m => sameParameters(member.parameters, m.parameters));
    if (!method) {
      return `expected parameters ${parameterList(member.parameters)}, found ${parameterList(named[0].parameters)}`;
    }
    if (!sameType(member.returns, method.returns)) {
      return `expected return type ${member.returns}, found ${method.returns}`;
    }
    return undefined;
  }
  // A constructor. A class with no written constructor has a default one without parameters.
  const written = type.constructors;
  if (!written.length) return member.parameters.length ? 'missing' : undefined;
  if (!written.some(c => sameParameters(member.parameters, c.parameters))) {
    return `expected parameters ${parameterList(member.parameters)}, found ${parameterList(written[0].parameters)}`;
  }
  return undefined;
}

// declared: the types read from the submission (see java.js); unread: the files that could not be
// read reliably. Returns the problems as text, the number of entries compared, and the files whose
// contents could not be relied on.
export function compareDeclarations(catalogue, declared, unread = []) {
  // The submission's types in the coursework's package, by name. The first declaration wins.
  const types = new Map();
  for (const type of declared) {
    if (type.package === catalogue.package && !types.has(type.name)) types.set(type.name, type);
  }
  // Stops at a type outside the submission, or at a cycle such as A extends B extends A.
  const lineageOf = type => {
    const lineage = [];
    let current = type;
    while (current && !lineage.includes(current)) {
      lineage.push(current);
      current = current.extends ? types.get(simpleName(current.extends)) : undefined;
    }
    return lineage;
  };

  const problems = [];
  const doubtfulFiles = new Set();
  let compared = 0;
  for (const expected of catalogue.types) {
    const found = types.get(expected.id);
    const lineage = found ? lineageOf(found) : [];
    // A discrepancy in a file the parser could not follow says nothing reliable,
    // so the file is named instead of the discrepancy.
    const expectedFile = '/' + expected.id.split('.')[0] + '.java';
    const doubtful = found
      ? lineage.filter(type => type.incomplete).map(type => type.path)
      : unread.filter(path => path.endsWith(expectedFile));
    const report = (id, detail) => {
      if (doubtful.length) doubtful.forEach(path => doubtfulFiles.add(path));
      else problems.push(`${id}: ${detail}`);
    };

    compared += 1 + expected.members.length;
    const label = `${expected.kind} ${expected.id}`;
    if (!found) {
      report(label, 'missing');
      continue;
    }
    if (found.kind !== expected.kind) {
      report(label, `expected ${expected.kind}, found ${found.kind}`);
    } else if (
      expected.extends &&
      !lineage.some(type => type.extends && simpleName(type.extends) === expected.extends)
    ) {
      report(label, `expected to extend ${expected.extends}`);
    }
    for (const member of expected.members) {
      const detail = memberProblem(member, found, lineage);
      if (detail) report(member.id, detail);
    }
  }
  return { problems, compared, files: [...doubtfulFiles].sort() };
}
