import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {root} from '../tools/dependencies.js';
import {COURSEWORKS} from '../checker/js/profiles.js';

const courseworks=COURSEWORKS.map(c=>c.id);

test('deployment contains the student site, resolves local references and excludes development/private folders',async()=>{
  execFileSync(process.execPath,[path.join(root,'tools/build.js')],{cwd:root});
  const output=path.join(root,'_site');
  assert.deepEqual((await readdir(output)).sort(),['index.html','assets','checker',...courseworks].sort());
  assert.deepEqual((await readdir(path.join(output,'checker'))).sort(),['checks','js','vendor']);
  const files=await readdir(output,{recursive:true});
  for(const file of files) {
    assert(!/(^|[\\/])(TestFiles|\.local|tests|node_modules|\.git)([\\/]|$)/.test(file),file);
    if(!/\.(html|js)$/.test(file)||file.includes('vendor'))continue;
    const text=await readFile(path.join(output,file),'utf8');
    const references=[...text.matchAll(/(?:src=|href=|from\s+|import\(|new URL\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)];
    for(const [,reference] of references) {
      const target=path.resolve(output,path.dirname(file),reference);
      assert(target.startsWith(output+path.sep),`${file}: reference escapes the site`);
      await stat(target);
    }
  }
  for(const entry of ['zip.js','pdfjs/pdf.js','pdfjs/pdf.worker.js','pdfjs/cmaps','pdfjs/standard_fonts','treesitter/web-tree-sitter.js','treesitter/web-tree-sitter.wasm','treesitter/tree-sitter-java.wasm']) {
    await stat(path.join(output,'checker/vendor',entry));
  }
});

test('every coursework has its own folder and page, and the front page links to each',async()=>{
  assert.equal(new Set(courseworks).size,courseworks.length);
  const front=await readFile(path.join(root,'index.html'),'utf8');
  for(const id of courseworks) {
    assert.match(id,/^[a-z]+-\d{2}-\d{2}$/);
    const page=await readFile(path.join(root,id,'index.html'),'utf8');
    assert(page.includes(`data-coursework="${id}"`),`${id}/index.html must name its own profile`);
    assert(front.includes(`href="./${id}/"`),`index.html must link to ${id}`);
  }
});
