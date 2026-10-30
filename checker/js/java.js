// Reads declarations from Java source text with the tree-sitter Java grammar.
// Nothing is compiled or executed.
const KINDS = {
  class_declaration: 'class',
  enum_declaration: 'enum',
  interface_declaration: 'interface',
  record_declaration: 'record',
  annotation_type_declaration: 'annotation',
};

// The parser is loaded once, when it is first needed.
let parserReady;
function javaParser() {
  parserReady ??= (async () => {
    const { Parser, Language } = await import('../vendor/treesitter/web-tree-sitter.js');
    await Parser.init();
    const parser = new Parser();
    const java = await Language.load(new URL('../vendor/treesitter/tree-sitter-java.wasm', import.meta.url));
    parser.setLanguage(java);
    return parser;
  })();
  return parserReady;
}

// A node's text without comments or white space: java.util.List<String>.
const compact = node => node.text.replace(/\/\*[\s\S]*?\*\/|\/\/.*|\s+/g, '');
const dimensions = node => (node ? node.text.split('[').length - 1 : 0);
// Arrays can be written after the type, the name or both (int[] a[]); report them one way (int[][]).
const typeName = (node, extraDimensions = 0) => compact(node) + '[]'.repeat(extraDimensions);

// The keywords such as public, static and final, without annotations.
function modifiers(node) {
  const list = node.children.find(child => child.type === 'modifiers');
  return list ? list.children.filter(child => !child.isNamed).map(child => child.type) : [];
}

// The parameter types of a method or constructor. A varargs parameter (int... values) is an array.
function parameters(node) {
  const declared = node.childForFieldName('parameters')?.namedChildren ?? [];
  return declared.flatMap(parameter => {
    if (parameter.type === 'formal_parameter') {
      const type = parameter.childForFieldName('type');
      return [typeName(type, dimensions(parameter.childForFieldName('dimensions')))];
    }
    if (parameter.type !== 'spread_parameter') return [];
    const type = parameter.namedChildren.find(
      child => child.type !== 'modifiers' && child.type !== 'variable_declarator',
    );
    return [typeName(type, 1)];
  });
}

// Adds the type declared at node, and any types nested inside it, to types.
// outer: the name of the enclosing type, for a nested one (Outer.Inner).
function readType(node, outer, path, incomplete, types) {
  const name = node.childForFieldName('name')?.text;
  if (!name) return;
  const type = {
    name: outer ? `${outer}.${name}` : name,
    kind: KINDS[node.type],
    modifiers: modifiers(node),
    path,
    incomplete,
    top: !outer,
    line: node.startPosition.row + 1,
    extends: null,
    fields: new Map(),
    methods: [],
    constructors: [],
    constants: [],
  };
  const superclass = node.childForFieldName('superclass')?.namedChildren[0];
  if (superclass) type.extends = compact(superclass);
  types.push(type);

  const readMembers = body => {
    for (const member of body?.namedChildren ?? []) {
      const placed = {
        line: member.startPosition.row + 1,
        generic: member.namedChildren.some(child => child.type === 'type_parameters'),
      };
      if (member.type === 'field_declaration') {
        // int a, b[]; declares two fields.
        for (const declarator of member.childrenForFieldName('declarator')) {
          const field = declarator.childForFieldName('name')?.text;
          if (!field) continue;
          const fieldType = typeName(
            member.childForFieldName('type'),
            dimensions(declarator.childForFieldName('dimensions')),
          );
          type.fields.set(field, { type: fieldType, modifiers: modifiers(member) });
        }
      } else if (member.type === 'method_declaration') {
        type.methods.push({
          ...placed,
          name: member.childForFieldName('name')?.text,
          parameters: parameters(member),
          modifiers: modifiers(member),
          returns: typeName(
            member.childForFieldName('type'),
            dimensions(member.childForFieldName('dimensions')),
          ),
        });
      } else if (member.type === 'constructor_declaration') {
        type.constructors.push({
          ...placed,
          name,
          parameters: parameters(member),
          modifiers: modifiers(member),
        });
      } else if (member.type === 'enum_constant') {
        type.constants.push(member.childForFieldName('name')?.text);
      } else if (member.type === 'enum_body_declarations') {
        // The fields and methods after an enum's constants.
        readMembers(member);
      } else if (KINDS[member.type]) {
        readType(member, type.name, path, incomplete, types);
      }
    }
  };
  readMembers(node.childForFieldName('body'));
}

// The first place in a file where the text stops being valid Java.
function firstProblem(node) {
  if (node.isError || node.isMissing) return node;
  for (const child of node.children) {
    if (!child.hasError && !child.isMissing) continue;
    const found = firstProblem(child);
    if (found) return found;
  }
  return null;
}

// sources: [{path, text}], where a null text is a file that could not be decoded.
// Returns the declared types; unread, the files whose types may be incomplete or missing;
// syntax, the files with a syntax error and the line where reading first failed; and the
// number of files parsed. Types from a file with a syntax error are marked incomplete.
export async function readDeclarations(sources) {
  const parser = await javaParser();
  const result = { types: [], unread: [], syntax: [], files: 0 };
  for (const { path, text } of sources) {
    const tree = text === null ? null : parser.parse(text);
    if (!tree) {
      result.unread.push(path);
      continue;
    }
    try {
      const root = tree.rootNode;
      const incomplete = root.hasError;
      result.files++;
      if (incomplete) {
        result.unread.push(path);
        result.syntax.push({ path, line: (firstProblem(root) ?? root).startPosition.row + 1 });
      }
      const declaration = root.namedChildren.find(child => child.type === 'package_declaration');
      const packageName = declaration ? compact(declaration.namedChildren.at(-1)) : '';
      const types = [];
      for (const node of root.namedChildren) {
        if (KINDS[node.type]) readType(node, '', path, incomplete, types);
      }
      for (const type of types) result.types.push({ ...type, package: packageName });
    } finally {
      // The tree lives in WebAssembly memory, which is not garbage collected.
      tree.delete();
    }
  }
  return result;
}
