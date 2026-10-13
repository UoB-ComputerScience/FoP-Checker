// Reads declarations from Java source text. Nothing is compiled or executed.
const KINDS={class_declaration:'class',enum_declaration:'enum',interface_declaration:'interface',record_declaration:'record',annotation_type_declaration:'annotation'};

let ready;
function javaParser() {
  ready??=(async()=>{
    const {Parser,Language}=await import('../vendor/treesitter/web-tree-sitter.js');
    await Parser.init();
    const parser=new Parser();
    parser.setLanguage(await Language.load(new URL('../vendor/treesitter/tree-sitter-java.wasm',import.meta.url)));
    return parser;
  })();
  return ready;
}

const compact=node=>node.text.replace(/\/\*[\s\S]*?\*\/|\/\/.*|\s+/g,'');
const dimensions=node=>node?node.text.split('[').length-1:0;
// Arrays are written after the type, the name or both; report them one way.
const typeName=(node,extra=0)=>compact(node)+'[]'.repeat(extra);
function modifiers(node) {
  const list=node.children.find(c=>c.type==='modifiers');
  return list?list.children.filter(c=>!c.isNamed).map(c=>c.type):[];
}
function parameters(node) {
  return (node.childForFieldName('parameters')?.namedChildren??[]).flatMap(p=>{
    if(p.type==='formal_parameter') return [typeName(p.childForFieldName('type'),dimensions(p.childForFieldName('dimensions')))];
    if(p.type!=='spread_parameter') return [];
    const type=p.namedChildren.find(c=>c.type!=='modifiers'&&c.type!=='variable_declarator');
    return [typeName(type,1)];
  });
}

function readType(node,outer,path,incomplete,types) {
  const name=node.childForFieldName('name')?.text;
  if(!name) return;
  const type={name:outer?`${outer}.${name}`:name,kind:KINDS[node.type],modifiers:modifiers(node),path,incomplete,
    extends:null,fields:new Map(),methods:[],constructors:[],constants:[]};
  const superclass=node.childForFieldName('superclass')?.namedChildren[0];
  if(superclass) type.extends=compact(superclass);
  types.push(type);
  const read=container=>{
    for(const member of container?.namedChildren??[]) {
      if(member.type==='field_declaration') {
        for(const declarator of member.childrenForFieldName('declarator')) {
          const field=declarator.childForFieldName('name')?.text;
          if(field) type.fields.set(field,{type:typeName(member.childForFieldName('type'),dimensions(declarator.childForFieldName('dimensions'))),modifiers:modifiers(member)});
        }
      } else if(member.type==='method_declaration') {
        type.methods.push({name:member.childForFieldName('name')?.text,parameters:parameters(member),modifiers:modifiers(member),
          returns:typeName(member.childForFieldName('type'),dimensions(member.childForFieldName('dimensions')))});
      } else if(member.type==='constructor_declaration') type.constructors.push({parameters:parameters(member),modifiers:modifiers(member)});
      else if(member.type==='enum_constant') type.constants.push(member.childForFieldName('name')?.text);
      else if(member.type==='enum_body_declarations') read(member);
      else if(KINDS[member.type]) readType(member,type.name,path,incomplete,types);
    }
  };
  read(node.childForFieldName('body'));
}

// The first place in a file where the text stops being valid Java.
function firstProblem(node) {
  if(node.isError||node.isMissing) return node;
  for(const child of node.children) {
    const found=(child.hasError||child.isMissing)&&firstProblem(child);
    if(found) return found;
  }
  return null;
}

// sources: [{path,text}]. A null text is a file that could not be decoded.
// incomplete marks types from a file with syntax the parser could not follow;
// syntax lists those files with the line where reading first failed.
export async function readDeclarations(sources) {
  const parser=await javaParser();
  const result={types:[],unread:[],syntax:[],files:0};
  for(const {path,text} of sources) {
    const tree=text===null?null:parser.parse(text);
    if(!tree) {result.unread.push(path);continue;}
    try {
      const root=tree.rootNode,incomplete=root.hasError;
      result.files++;
      if(incomplete) {
        result.unread.push(path);
        result.syntax.push({path,line:(firstProblem(root)??root).startPosition.row+1});
      }
      const declaration=root.namedChildren.find(c=>c.type==='package_declaration');
      const packageName=declaration?compact(declaration.namedChildren.at(-1)):'';
      const types=[];
      for(const node of root.namedChildren) if(KINDS[node.type]) readType(node,'',path,incomplete,types);
      for(const type of types) result.types.push({...type,package:packageName});
    } finally {tree.delete();}
  }
  return result;
}
