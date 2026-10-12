// Compares declared Java types with a year's availability.json.
// Compared: kind, names, parameter types, return and attribute types, and extends;
// inherited members count. Access, static, final and abstract are not compared:
// real submissions change them without affecting the marking tests.
const simple=name=>name.replace(/<.*/,'').split('.').at(-1);
function sameType(expected,found) {
  const split=type=>{const at=type.indexOf('[');return at<0?[type,'']:[type.slice(0,at),type.slice(at)];};
  const [a,arrayA]=split(expected),[b,arrayB]=split(found);
  return arrayA===arrayB&&(a===b||a.endsWith('.'+b)||b.endsWith('.'+a));
}
const sameParameters=(expected,found)=>expected.length===found.length&&expected.every((type,i)=>sameType(type,found[i]));
const list=types=>`(${types.join(', ')})`;

// declared: types read from the submission. Returns the problems as text, the number
// of entries compared and the files whose contents could not be relied on.
export function compareDeclarations(catalogue,declared,unread=[]) {
  const types=new Map();
  for(const type of declared) if(type.package===catalogue.package&&!types.has(type.name)) types.set(type.name,type);
  const chain=type=>{
    const result=[];
    for(let current=type;current&&!result.includes(current);current=current.extends&&types.get(simple(current.extends))) result.push(current);
    return result;
  };
  const problems=[],files=new Set();
  let compared=0;
  for(const expected of catalogue.types) {
    const found=types.get(expected.id);
    const lineage=found?chain(found):[];
    // A discrepancy in a file the parser could not follow says nothing reliable.
    const doubtful=found?lineage.filter(t=>t.incomplete).map(t=>t.path):unread.filter(p=>p.endsWith('/'+expected.id.split('.')[0]+'.java'));
    const report=(id,detail)=>{if(doubtful.length) doubtful.forEach(p=>files.add(p)); else problems.push(`${id}: ${detail}`);};
    compared+=1+expected.members.length;
    const label=`${expected.kind} ${expected.id}`;
    if(!found) {report(label,'missing');continue;}
    if(found.kind!==expected.kind) report(label,`expected ${expected.kind}, found ${found.kind}`);
    else if(expected.extends&&!lineage.some(t=>t.extends&&simple(t.extends)===expected.extends)) report(label,`expected to extend ${expected.extends}`);
    // Private members of a supertype are not inherited.
    const visible=(type,member)=>type===found||!member.modifiers.includes('private');
    for(const member of expected.members) {
      let detail;
      if(member.kind==='constant') {
        if(!found.constants.includes(member.name)) detail='missing';
      } else if(member.kind==='field') {
        const field=lineage.map(t=>[t,t.fields.get(member.name)]).find(([t,f])=>f&&visible(t,f))?.[1];
        if(!field) detail='missing';
        else if(!sameType(member.type,field.type)) detail=`expected type ${member.type}, found ${field.type}`;
      } else if(member.kind==='method') {
        const named=lineage.flatMap(t=>t.methods.filter(m=>m.name===member.name&&visible(t,m)));
        const method=named.find(m=>sameParameters(member.parameters,m.parameters));
        if(!named.length) detail='missing';
        else if(!method) detail=`expected parameters ${list(member.parameters)}, found ${list(named[0].parameters)}`;
        else if(!sameType(member.returns,method.returns)) detail=`expected return type ${member.returns}, found ${method.returns}`;
      } else {
        // A class with no written constructor has a default one without parameters.
        const written=found.constructors;
        if(!written.length) {if(member.parameters.length) detail='missing';}
        else if(!written.some(c=>sameParameters(member.parameters,c.parameters))) detail=`expected parameters ${list(member.parameters)}, found ${list(written[0].parameters)}`;
      }
      if(detail) report(member.id,detail);
    }
  }
  return {problems,compared,files:[...files].sort()};
}
