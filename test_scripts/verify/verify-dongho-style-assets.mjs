// Audit the actual exported pixels and shared runtime selection, including withheld artwork.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const base=process.env.DEV_URL??'http://127.0.0.1:5180';
const assets=JSON.parse(readFileSync('public/art/conquest-dongho-v4/manifest.json','utf8'));
const paths=JSON.parse(readFileSync('src/ui/conquestDongHoV4Assets.json','utf8'));
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 const inputs=assets.assets.map(a=>({...a,url:`data:image/png;base64,${readFileSync(a.runtimePath).toString('base64')}`}));
 const pixels=await page.evaluate(async inputs=>{
  const rows=[];
  for(const input of inputs){
   const im=new Image();im.src=input.url;await im.decode();
   const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;
   const c=canvas.getContext('2d');c.drawImage(im,0,0);const d=c.getImageData(0,0,im.width,im.height).data;
   let clear=0,edge=0,pink=0,solid=0;
   for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++){
    const p=(y*im.width+x)*4,a=d[p+3];
    if(a===0)clear++;if(a>200)solid++;
    if(a&&(!x||!y||x===im.width-1||y===im.height-1))edge++;
    if(a>20&&d[p]>90&&d[p+2]>80&&Math.min(d[p],d[p+2])-d[p+1]>40)pink++;
   }
   rows.push({id:input.id,width:im.width,height:im.height,clear:clear/(im.width*im.height),solid,edge,pink});
  }
  return rows;
 },inputs);
 for(const a of pixels){
  assert.equal(a.edge,0,`${a.id}: clipped opaque edge`);
  assert.equal(a.pink,0,`${a.id}: production matte residue`);
  assert(a.clear>.15&&a.clear<.96&&a.solid>150,`${a.id}: missing or solid rectangular art`);
  if(a.id.startsWith('figure.'))assert.deepEqual([a.width,a.height],[144,128],`${a.id}: animation canvas`);
 }
 for(const a of assets.assets){
  assert.equal(Boolean(paths[a.id]),a.approved,`${a.id}: unreviewed art selected`);
  if(a.derivedFrom){
   const source=assets.assets.find(b=>b.id===a.derivedFrom);
   assert(readFileSync(a.runtimePath).equals(readFileSync(source.runtimePath)),`${a.id}: ranged alias drift`);
  }
 }
 await page.goto(`${base}/?capture=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'),null,{timeout:30000});
 const loaded=await page.evaluate(async paths=>{
  const art=await import('/src/ui/conquestMapArt.ts');
  const list=art.CONQUEST_MAP_ART;
  if(!list)throw new Error('Missing asset catalog');
  return list.filter(a=>['figures','settlements','buildings'].includes(a.family)&&a.accepted).map(a=>({
   id:a.id,path:a.path,expected:paths[a.id],loaded:window.__phaserGame.textures.exists(a.textureKey)
  }));
 },paths);
 for(const a of loaded){
  assert(a.loaded,`${a.id}: missing live texture`);
  assert.equal(a.path,a.expected??`art/conquest-dongho/${a.id.replaceAll('.','/')}.png`);
 }
 assert.equal(loaded.length,234,'full army/settlement/building catalog');
 assert.equal(errors.length,0,errors.join('\n'));
 const result={exported:pixels.length,active:loaded.filter(a=>a.expected).length,withheld:assets.assets.filter(a=>!a.approved).map(a=>a.id),
  required:loaded.length,pending:loaded.filter(a=>!a.expected).map(a=>a.id),allLoaded:true,pixels,errors};
 mkdirSync('output/dongho-style-v4',{recursive:true});
 writeFileSync('output/dongho-style-v4/verification.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({exported:result.exported,active:result.active,required:result.required,pending:result.pending.length,
  pixelChecks:'pass',runtimeLoaded:'234/234',rangedAliases:'identical',errors},null,2));
}finally{await browser.close();}
