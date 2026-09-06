// Reference boards and mechanical export only. All new drawing is made by ImageGen.
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname} from 'node:path';
const OUT='output/dongho-map-v4',RUNTIME='public/art/conquest-dongho-v4';
const original=JSON.parse(readFileSync('public/art/conquest-dongho/manifest.json','utf8')).assets;
const seasons=['spring','summer','autumn','winter'];
const plants=['tree','tree-jackfruit','tree-lychee','tree-pomelo','tree-silk-cotton','grass','bamboo','banana','areca','banyan'];
const specs=seasons.map(season=>({key:`flora-${season}`,cols:4,rows:3,ids:plants.map(p=>`flora.${p}.${season}`)}));
specs.push({key:'mountains',cols:3,rows:3,ids:['karst-range','soft-ridge','karst-classic','karst-three-spire','karst-seven-spire','karst-stepped','karst-tower'].map(s=>`terrain.${s}`)});
specs.push({key:'fields-bridge',cols:3,rows:2,ids:['paddy-system-flooded','paddy-system-fallow','paddy-system-transplanted','paddy-system-ripe','paddy-system-nursery','timber-bridge'].map(s=>`terrain.${s}`)});
specs.push({key:'village-life',cols:4,rows:3,ids:original.filter(a=>a.family==='life').map(a=>a.id)});
const markers=original.filter(a=>a.family==='markers').map(a=>a.id);
for(let i=0;i<markers.length;i+=12)specs.push({key:`markers-${1+i/12}`,cols:4,rows:3,ids:markers.slice(i,i+12)});
for(const role of ['farmer','traveler','buffalo','ox-cart'])specs.push({key:`walk-${role}`,cols:2,rows:2,walk:true,ids:Array.from({length:4},(_,i)=>`life.${role}-walk.${i}`),source:`public/art/conquest-dongho/life/${role}-walk.png`});
const style='Match the accepted Đông Hồ style: warm-black carved contours, large opaque ochre/vermilion/indigo/leaf-green pigment shapes, sparse curved decorative marks, no gradients, tiny hatching, photorealistic shading or engraved microtexture. Preserve the original silhouettes, identity and functional shapes. No labels, grid lines or scenery.';
const mountainStyle='Match the accepted Đông Hồ contours and sparse carved curves, with flat opaque pigment. Mountains must stay visibly coloured: pale warm ochre limestone, soft moss-green vegetation and muted blue-green indigo rock faces, with warm-black outlines. Use these three restrained natural pigment families consistently. No orange/red bands, bright yellow or highly saturated colours; never greyscale, monochrome or a global desaturation wash. Preserve the original silhouettes and functional shapes. No gradients, fine hatching, photorealistic shading, labels, grid lines or scenery.';
const cutout='Use genuine transparent alpha including every hole, without a painted checkerboard. If true alpha cannot be produced use one exact #FF00FF production matte instead, including holes. No paper rectangle, white background, cast shadows, or magenta inside subjects.';
for(const s of specs){
 const subject=s.walk
  ? 'Image 1 fixes all four ORIGINAL walking poses in 2x2 order. Keep the same subject, clothing, carried items, body proportions and right-facing direction in every frame. Preserve alternating front/rear foot contacts and lifted feet, or all four hoof poses and wheel rotation for the cart. Keep head and torso consistent, complete poles/horns/cart intact, broad empty gutters; no extra limbs or people. Change drawing style only, not gait or equipment.'
  : s.key.startsWith('flora')
  ? `Keep the ten original plant species and ${s.key.slice(6)} season cues. Read order: round tree, jackfruit, lychee, pomelo; silk-cotton, grass tuft, bamboo, banana; areca palm, banyan, empty, empty. Large leaf masses with a few curved leaf marks, full trunk/root contacts, no soil patch or cast shadow. Keep deciduous/evergreen distinctions from the original.`
  : s.key==='mountains'
  ? 'Keep seven distinct mountain/ridge shapes in original order: broad karst range, soft low ridge, classic karst, three-spire, seven-spire, stepped karst, tower-form cluster from the reference; final two cells empty. Preserve peak counts and silhouettes. Broad muted stone faces, clear warm-black contours and very few curling rock strata. No bright colour bands, hundreds of thin hatch strokes, forests, sky, mist or ground rectangles.'
  : s.key==='fields-bridge'
  ? 'Keep five connected rice-field systems with shared bunds, in original elevated frontal projection. Row 1: flooded, fallow, transplanted. Row 2: ripe, nursery, timber bridge. Preserve each system footprint and separate linked plots; broad blue-green water, ochre bare earth or flat green/gold crop patches with sparse rice marks. Preserve crop-stage distinctions. No farmers, animals or houses. Bridge stays a complete isolated wooden structure with open gaps.'
  : s.key==='village-life'
  ? 'Keep original order: farmer, traveler, buffalo, buffalo rider; calf, ox cart, egret wings up, egret wings down; spring petal, autumn leaf, winter snow, empty. Preserve original hats/clothing/equipment and right-facing walking poses. Buffalo are Vietnamese water buffalo with curved horns, not cattle; the ox cart keeps its original animal. Egrets keep the same body proportions in the two wing phases. Use expressive simple faces and large clean pigment masses.'
  : 'Preserve all original flags, emblems, colours and symbols in EXACT cell order. Thick clean warm-black outlines, broad flat pigments, simple tassels. No new insignia, text, lettering, banners, terrain or scenery. Keep functional paths, rings and brush accents intact; do not turn them into new objects.';
 s.prompt=`Use case: style-transfer. Asset type: Vietnamese historical RTS map cutout sheet. Image 1 is the edit target and determines each object and its layout; image 2 is the drawing-style reference ONLY. ${s.key==='mountains'?mountainStyle:style} ${subject} ${s.walk?'Square 1024x1024':'Landscape 1536x1024'}, ${s.cols} columns by ${s.rows} rows, ${s.ids.length} occupied cells in reading order. At least 24 pixels of empty margin around each complete silhouette and wide gutters. ${cutout}`;
 s.reference=`${OUT}/references/${s.key}.png`;s.master=`${OUT}/masters/${s.key}.png`;
}
const mode=process.argv[2]??'prepare',selected=process.argv.slice(3),jobs=specs.filter(s=>!selected.length||selected.includes(s.key));
const browser=await chromium.launch(),page=await browser.newPage();
const url=path=>`data:image/png;base64,${readFileSync(path).toString('base64')}`;
const save=(path,data)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,Buffer.from(data.split(',')[1],'base64'));};
try{
if(mode==='prepare'){
 for(const s of jobs){
  const sources=s.walk?[url(s.source)]:s.ids.map(id=>url(original.find(a=>a.id===id).runtimePath));
  const board=await page.evaluate(async({s,sources})=>{
   const c=document.createElement('canvas');c.width=s.walk?1024:1536;c.height=1024;const g=c.getContext('2d');
   for(let i=0;i<sources.length;i++){const im=new Image();im.src=sources[i];await im.decode();
    if(s.walk){g.drawImage(im,0,0,c.width,c.height);continue;}
    const cw=c.width/s.cols,ch=c.height/s.rows,fit=Math.min((cw-60)/im.width,(ch-60)/im.height);
    g.drawImage(im,(i%s.cols+.5)*cw-im.width*fit/2,(Math.floor(i/s.cols)+.5)*ch-im.height*fit/2,im.width*fit,im.height*fit);
   }return c.toDataURL();
  },{s,sources});save(s.reference,board);
 }
 mkdirSync('docs',{recursive:true});writeFileSync('docs/dong-ho-map-v4-prompts.json',JSON.stringify({generator:'built-in ImageGen',styleReference:'public/art/story-prints/muster-v1.webp',jobs:specs},null,2)+'\n');
 console.log(`Prepared ${jobs.length} map reference sheets: 87 still assets and four walk sheets.`);
}
if(mode==='review'){
 for(const s of jobs){
  const entries=s.walk?[{id:s.key,before:s.source,after:`${RUNTIME}/life/${s.key.slice(5)}-walk.png`}]:s.ids.map(id=>({id,before:original.find(a=>a.id===id).runtimePath,after:`${RUNTIME}/${id.replaceAll('.','/')}.png`}));
  const inputs=entries.map(e=>({...e,before:url(e.before),after:url(e.after)}));
  for(const dark of [false,true]){
   const result=await page.evaluate(async({inputs,dark,walk})=>{
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=walk?650:Math.ceil(inputs.length/3)*250+48;const g=canvas.getContext('2d');g.fillStyle=dark?'#252421':'#eadcb8';g.fillRect(0,0,canvas.width,canvas.height);g.fillStyle=dark?'#eadcb8':'#28231d';g.font='20px sans-serif';g.fillText('Original / Đông Hồ redraw',18,30);
    for(let i=0;i<inputs.length;i++){const x=i%3*400,y=Math.floor(i/3)*250+48;g.font='14px sans-serif';g.fillText(inputs[i].id,x+12,y+18);
     for(const [j,k] of ['before','after'].entries()){const im=new Image();im.src=inputs[i][k];await im.decode();const w=walk?575:185,h=walk?575:205,fit=Math.min(w/im.width,h/im.height);g.drawImage(im,x+j*(walk?600:200)+(w-im.width*fit)/2,y+28+(h-im.height*fit),im.width*fit,im.height*fit);}
    }return canvas.toDataURL();
   },{inputs,dark,walk:s.walk});save(`${OUT}/review/${s.key}${dark?'-dark':''}.png`,result);
  }
 }console.log(`Saved ${jobs.length} comparison boards on paper and dark backgrounds.`);
}
if(mode==='export'){
 const auditPath=`${RUNTIME}/map-manifest.json`,previous=existsSync(auditPath)?JSON.parse(readFileSync(auditPath,'utf8')).assets:[],audit=new Map(previous.map(a=>[a.id,a]));
 const registry=JSON.parse(readFileSync('src/ui/conquestDongHoV4Assets.json','utf8'));
 for(const s of jobs){
  if(!existsSync(s.master))throw new Error(`Missing reviewed ImageGen master: ${s.master}`);
  const originals=s.walk?[url(s.source)]:s.ids.map(id=>url(original.find(a=>a.id===id).runtimePath));
  const results=await page.evaluate(async({s,source,originals})=>{
   const load=async src=>{const im=new Image();im.src=src;await im.decode();return im;};
   const im=await load(source),c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);
   const raster=g.getImageData(0,0,c.width,c.height),d=raster.data;let clear=0,pink=0;
   for(let p=0;p<d.length;p+=4){if(!d[p+3])clear++;if(d[p]>180&&d[p+2]>150&&d[p+1]<105)pink++;}
   if(clear<c.width*c.height*.02){
    if(pink>c.width*c.height*.1){for(let p=0;p<d.length;p+=4)if(d[p]>75&&d[p+2]>65&&Math.min(d[p],d[p+2])-d[p+1]>35)d[p+3]=0;}
    else{
     // Clear connected pale-neutral matte only. Keep enclosed subject whites (birds, snow).
     const seen=new Uint8Array(c.width*c.height),queue=new Int32Array(seen.length);
     const neutral=p=>Math.min(d[p*4],d[p*4+1],d[p*4+2])>150&&Math.max(d[p*4],d[p*4+1],d[p*4+2])-Math.min(d[p*4],d[p*4+1],d[p*4+2])<18;
     for(let p=0;p<seen.length;p++){
      if(seen[p]||!neutral(p))continue;let at=0,n=1,edge=false;queue[0]=p;seen[p]=1;
      while(at<n){const q=queue[at++],x=q%c.width,y=Math.floor(q/c.width);edge ||=!x||!y||x===c.width-1||y===c.height-1;
       for(const z of [x?q-1:-1,x<c.width-1?q+1:-1,q-c.width,q+c.width])if(z>=0&&z<seen.length&&!seen[z]&&neutral(z)){seen[z]=1;queue[n++]=z;}
      }
      // Subjects use warm cream (birds/clothes) or dark pigments. Only the snowflake's
      // small enclosed white regions are intentional neutral ink; rings, wheels and
      // the traveller's armpit must clear even when their checker component is tiny.
      const cell=Math.floor(Math.floor(p/c.width)/c.height*s.rows)*s.cols+Math.floor(p%c.width/c.width*s.cols);
      const keepSnow=s.ids[cell]==='life.winter-snow'&&!edge&&n<c.width*c.height*.01;
      // The revised mountains intentionally contain pale neutral stone. Their solid
      // contours enclose that pigment; only the outside connected matte should clear.
      const keepStone=s.key==='mountains'&&!edge;
      if(!keepSnow&&!keepStone)for(let k=0;k<n;k++)d[queue[k]*4+3]=0;
     }
    }g.putImageData(raster,0,0);
   }
   // Whole-component ownership preserves a leaf or horn that crosses the nominal grid line.
   const owner=new Int16Array(c.width*c.height).fill(-1),seen=new Uint8Array(owner.length),queue=new Int32Array(owner.length);
   const boxes=s.ids.map(()=>({l:c.width,t:c.height,r:-1,b:-1,edge:0}));
   for(let p=0;p<owner.length;p++){
    if(seen[p]||!d[p*4+3])continue;let at=0,n=1,sumX=0,sumY=0;queue[0]=p;seen[p]=1;
    while(at<n){const q=queue[at++],x=q%c.width,y=Math.floor(q/c.width);sumX+=x;sumY+=y;
     for(const z of [x?q-1:-1,x<c.width-1?q+1:-1,q-c.width,q+c.width])if(z>=0&&z<owner.length&&!seen[z]&&d[z*4+3]){seen[z]=1;queue[n++]=z;}
    }
    const index=Math.floor(sumY/n/c.height*s.rows)*s.cols+Math.floor(sumX/n/c.width*s.cols),b=boxes[index];if(!b)continue;
    for(let k=0;k<n;k++){const q=queue[k],x=q%c.width,y=Math.floor(q/c.width);owner[q]=index;b.l=Math.min(b.l,x);b.r=Math.max(b.r,x);b.t=Math.min(b.t,y);b.b=Math.max(b.b,y);if(!x||!y||x===c.width-1||y===c.height-1)b.edge++;}
   }
   const cells=boxes.map((box,i)=>{
    const w=box.r-box.l+1,h=box.b-box.t+1;
    if(w<=0||h<=0||box.edge||w>c.width/s.cols*1.2||h>c.height/s.rows*1.2)throw new Error(`${s.ids[i]}: empty, clipped or oversized silhouette`);
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(box.t+y)*c.width+box.l+x;if(owner[p]===i)pixels.data.set(d.subarray(p*4,p*4+4),(y*w+x)*4);}
    ctx.putImageData(pixels,0,0);return {sx:0,sy:0,l:0,t:0,r:w-1,b:h-1,w,h,canvas,pixels:pixels.data};
   });
   if(s.walk){
    const out=document.createElement('canvas');out.width=out.height=1254;const ctx=out.getContext('2d');
    // One scale for the whole cycle preserves body size. Align torso centres and foot baselines
    // mechanically; pose-specific foot positions are retained, never painted or duplicated.
    const fit=Math.min(550/Math.max(...cells.map(b=>b.h)),550/Math.max(...cells.map(b=>b.w)));
    const baselines=[590,590,590,590],anchorsX=[313.5,313.5,313.5,313.5];
    for(let i=0;i<4;i++){
     const b=cells[i],centres=[];
     for(let y=Math.floor(b.t+b.h*.4);y<Math.floor(b.t+b.h*.55);y++){
      let lo=Infinity,hi=-1;for(let x=b.l;x<=b.r;x++)if(b.pixels[(y*b.w+x)*4+3]>128){lo=Math.min(lo,x);hi=Math.max(hi,x);}if(hi>=lo)centres.push((lo+hi)/2);
     }centres.sort((a,b)=>a-b);const anchor=s.key==='walk-ox-cart'||s.key==='walk-buffalo'?(b.l+b.r)/2:centres[Math.floor(centres.length/2)]??(b.l+b.r)/2;
     const dx=313.5-(anchor-b.l)*fit,dy=590-b.h*fit;
     if(dx<8||dx+b.w*fit>619)throw new Error(`${s.key}: anchored pose needs more side margin`);
     ctx.drawImage(b.canvas,0,0,b.w,b.h,i%2*627+dx,Math.floor(i/2)*627+dy,b.w*fit,b.h*fit);
    }
    return [{id:s.ids[0].replace(/\.0$/,''),url:out.toDataURL(),width:1254,height:1254,walk:{frameWidth:627,frameHeight:627,contentHeight:Math.max(...cells.map(b=>b.h))*fit,baselines,anchorsX}}];
   }
   const out=[];
   for(let i=0;i<cells.length;i++){
    const old=await load(originals[i]),b=cells[i],canvas=document.createElement('canvas');canvas.width=old.width;canvas.height=old.height;const ctx=canvas.getContext('2d');
    const pad=Math.max(4,Math.min(canvas.width,canvas.height)*.05),fit=Math.min((canvas.width-pad*2)/b.w,(canvas.height-pad*2)/b.h);
    ctx.drawImage(b.canvas,0,0,b.w,b.h,(canvas.width-b.w*fit)/2,(canvas.height-b.h*fit)/2,b.w*fit,b.h*fit);
    out.push({id:s.ids[i],url:canvas.toDataURL(),width:canvas.width,height:canvas.height});
   }return out;
  },{s,source:url(s.master),originals});
  for(const a of results){const path=`${RUNTIME}/${a.id.replaceAll('.','/')}.png`;save(path,a.url);const {url:unused,...meta}=a;audit.set(a.id,{...meta,approved:true,runtimePath:path,sourceSheet:s.key});registry[a.id]=path.replace(/^public\//,'');}
 }
 const assets=[...audit.values()];writeFileSync(auditPath,JSON.stringify({version:4,generator:'built-in ImageGen',required:91,status:assets.length===91?'complete':'partial',assets},null,2)+'\n');
 writeFileSync('src/ui/conquestDongHoV4Assets.json',JSON.stringify(Object.fromEntries(Object.entries(registry).sort()),null,2)+'\n');
 const walks=Object.fromEntries(assets.filter(a=>a.walk).map(a=>[a.id,{path:a.runtimePath.replace(/^public\//,''),...a.walk}]));
 writeFileSync('src/ui/conquestDongHoV4Walks.json',JSON.stringify(walks,null,2)+'\n');
 console.log(`Exported ${jobs.length} reviewed sheets; ${assets.length}/91 map assets active.`);
}
}finally{await browser.close();}
