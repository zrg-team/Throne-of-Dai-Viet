// Check the final PNGs and the paths Phaser actually selects, including all four walk sheets.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const base=process.env.DEV_URL??'http://127.0.0.1:5180';
const manifest=JSON.parse(readFileSync('public/art/conquest-dongho-v4/map-manifest.json','utf8'));
const paths=JSON.parse(readFileSync('src/ui/conquestDongHoV4Assets.json','utf8'));
const walks=JSON.parse(readFileSync('src/ui/conquestDongHoV4Walks.json','utf8'));
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 const inputs=manifest.assets.map(a=>({...a,url:`data:image/png;base64,${readFileSync(a.runtimePath).toString('base64')}`}));
 const pixels=await page.evaluate(async inputs=>{
  const results=[];
  for(const a of inputs){
   const im=new Image();im.src=a.url;await im.decode();
   const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
   const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;
   let clear=0,edge=0,pink=0,solid=0;
   for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
    const p=(y*c.width+x)*4,alpha=d[p+3];
    if(!alpha)clear++;if(alpha>200)solid++;
    if(alpha&&(!x||!y||x===c.width-1||y===c.height-1))edge++;
    if(alpha>20&&d[p]>90&&d[p+2]>80&&Math.min(d[p],d[p+2])-d[p+1]>40)pink++;
   }
   const centre=d[(Math.floor(c.height/2)*c.width+Math.floor(c.width/2))*4+3];
   results.push({id:a.id,width:c.width,height:c.height,clear:clear/(c.width*c.height),solid,edge,pink,centre});
  }return results;
 },inputs);
 assert.equal(pixels.length,91);assert.equal(manifest.status,'complete');
 for(const [i,a] of pixels.entries()){
  const source=manifest.assets[i];
  assert(source.approved,`${a.id}: unreviewed draft`);
  assert.equal(paths[a.id],source.runtimePath.replace(/^public\//,''),`${a.id}: path drift`);
  assert.deepEqual([a.width,a.height],[source.width,source.height],`${a.id}: dimensions`);
  assert.equal(a.edge,0,`${a.id}: clipped edge`);assert.equal(a.pink,0,`${a.id}: matte residue`);
  assert(a.clear>.1&&a.clear<.99&&a.solid>20,`${a.id}: missing silhouette or opaque rectangle`);
 }
 for(const id of ['marker.capital-highlight','marker.acquisition'])
  assert.equal(pixels.find(a=>a.id===id)?.centre,0,`${id}: centre must be transparent`);
 await page.goto(`${base}/?capture=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'),null,{timeout:30000});
 const runtime=await page.evaluate(async()=>{
  const art=await import('/src/ui/conquestMapArt.ts'),textures=window.__phaserGame.textures;
  return {
   stills:art.CONQUEST_MAP_ART.filter(a=>a.accepted).map(a=>({id:a.id,path:a.path,loaded:textures.exists(a.textureKey)})),
   walks:art.CONQUEST_WALK_SHEETS.map(a=>({...a,loaded:textures.exists(a.textureKey),frames:textures.get(a.textureKey).getFrameNames().length})),
  };
 });
 assert.equal(runtime.stills.length,321,'all accepted still assets');assert.equal(runtime.walks.length,4);
 for(const a of runtime.stills){assert(a.loaded,`${a.id}: not loaded`);assert.equal(a.path,paths[a.id]);}
 for(const a of runtime.walks){
  const id=a.textureKey.replace('conquest-art:',''),expected=walks[id];
  assert(a.loaded,`${id}: not loaded`);assert.equal(a.frames,4,`${id}: missing pose`);
  for(const key of ['path','frameWidth','frameHeight','contentHeight','anchorsX','baselines'])assert.deepEqual(a[key],expected[key],`${id}: ${key}`);
 }
 assert.equal(errors.length,0,errors.join('\n'));
 mkdirSync('output/dongho-map-v4',{recursive:true});
 writeFileSync('output/dongho-map-v4/verification.json',JSON.stringify({pixels,runtime,errors},null,2)+'\n');
 console.log(JSON.stringify({mapExports:pixels.length,acceptedStills:runtime.stills.length,walkSheets:runtime.walks.length,pixelChecks:'pass',allLoaded:true,errors}));
}finally{await browser.close();}
