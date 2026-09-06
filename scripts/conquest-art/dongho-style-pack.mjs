// Mechanical sheet assembly, production-matte extraction and export. Redraws are made by ImageGen.
import {chromium} from 'playwright';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

const ROOT=process.cwd();
const OUT=resolve(ROOT,'output/dongho-style-v4');
const RUNTIME='public/art/conquest-dongho-v4';
const manifest=JSON.parse(readFileSync('public/art/conquest-dongho/manifest.json','utf8'));
const themes=['dinh','ly','tran','le','trinh','nguyenLord','tayson','nguyen','song','yuan','ming','qing','champa'];
const tiers=['levy','trained','royal'];
const arms=['spear','sword','skirmish','mounted'];
// All soldier and structure masters passed review, including the repaired Đinh armour.
const approved=()=>true;
const sheets=themes.map(theme=>({key:`army-${theme}`,cols:4,rows:3,ids:tiers.flatMap(t=>arms.map(a=>`figure.${theme}.${t}.${a}`))}));
const settlements=manifest.assets.filter(a=>a.family==='settlements').map(a=>a.id);
sheets.push({key:'settlements-rural',cols:3,rows:2,ids:settlements.filter(id=>!id.includes('citadel'))});
sheets.push({key:'settlements-citadels',cols:3,rows:2,ids:settlements.filter(id=>id.includes('citadel'))});
const buildings=manifest.assets.filter(a=>a.family==='buildings'&&a.id!=='building.mine-worker').map(a=>a.id);
for(let i=0;i<buildings.length;i+=10)sheets.push({key:`buildings-${i/10+1}`,cols:4,rows:3,ids:buildings.slice(i,i+10)});
const selected=process.argv.slice(3);
const specs=sheets.filter(s=>!selected.length||selected.includes(s.key));
const mode=process.argv[2]??'prepare';
mkdirSync(OUT,{recursive:true});

if(mode==='prompts'){
 const style='Vietnamese Đông Hồ folk woodblock drawing language: large flat opaque pigment shapes, decisive slightly uneven warm-black carved contours, expressive simplified faces, sparse decorative curved marks. Vermilion, ochre, indigo, leaf green and warm black. Eliminate gradients, realistic modelling, tiny engraving hatch, microtexture and hundreds of individual armour scales or roof tiles. Interior detail must be much sparser than the silhouette. No glow, drop shadow or sepia filter.';
 const background='Use genuine transparent alpha including holes and courtyards. No checkerboard or paper rectangle. If using the explicitly authorized API model without alpha support, use a single exact #FF00FF production matte, including holes; no magenta inside any subject.';
 const jobs=sheets.map(s=>{
  const soldiers=s.key.startsWith('army-');
  const subject=soldiers
   ? 'Keep all twelve original soldiers in their exact grid order. Rows: levy, trained, royal. Columns: spear, sword and shield, the original ranged weapon, mounted. Preserve each original hat, helmet, plume, collar, fastening, torso armour coverage, rank, boots, weapon type, horse, pose and right-facing direction. Simplify armour into broad readable plates; do not replace protective armour with a cloth tunic. Do not replace firearms with bows. Preserve the era-specific silhouette rather than borrowing another dynasty’s uniform.'
   : 'Keep every original structure in its exact grid order. Preserve building count, roof type and tier count, distinctive gates, entrances and compound footprints. Use broad roof pigment shapes and a few clear tile or thatch marks. Keep the existing front-centred orthographic elevated camera with horizontal eaves; do not change it to isometric. No people, terrain, earth platforms, scenery, shadows or paper under the buildings; courtyard holes stay transparent.';
  return {key:s.key,editTarget:`output/dongho-style-v4/references/${s.key}.png`,
   styleReference:'public/art/story-prints/muster-v1.webp',output:`output/dongho-style-v4/masters/${s.key}.png`,
   columns:s.cols,rows:s.rows,ids:s.ids,
   prompt:`Use case: style-transfer. Asset type: RTS cutout sprite sheet. Image 1 is the edit target and determines the objects, historical wardrobe/architecture and layout. Image 2 is the drawing-style reference only. Redraw image 1 in the same print family as image 2. ${style} ${subject} Landscape 1536×1024, ${s.cols} columns and ${s.rows} rows; ${s.ids.length} occupied cells in reading order, remaining cells empty. At least 24 pixels of empty margin around every complete silhouette and wide gutters. Weapons and roof tips must not touch cell boundaries. No labels, text or grid lines. ${background}`};
 });
 writeFileSync('docs/dong-ho-style-v4-prompts.json',JSON.stringify({
  note:'Normalized production prompt set for continuing this art pass; not a verbatim transcript of earlier tool calls.',
  defaultGenerator:'built-in ImageGen',jobs},null,2)+'\n');
 console.log(`Saved ${jobs.length} production prompts.`);
 process.exit(0);
}
const browser=await chromium.launch();
const page=await browser.newPage();
const dataUrl=path=>`data:image/png;base64,${readFileSync(path).toString('base64')}`;
const writePng=(path,url)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,Buffer.from(url.split(',')[1],'base64'));};

if(mode==='prepare'){
 for(const spec of specs){
  const sources=spec.ids.map(id=>({id,url:dataUrl(manifest.assets.find(a=>a.id===id).runtimePath)}));
  const result=await page.evaluate(async({sources,cols,rows})=>{
   const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;
   const ctx=canvas.getContext('2d');const cw=canvas.width/cols,ch=canvas.height/rows;
   for(let i=0;i<sources.length;i++){
    const im=new Image();im.src=sources[i].url;await im.decode();
    const fit=Math.min((cw-54)/im.width,(ch-54)/im.height);
    ctx.drawImage(im,(i%cols+.5)*cw-im.width*fit/2,(Math.floor(i/cols)+.5)*ch-im.height*fit/2,im.width*fit,im.height*fit);
   }
   return canvas.toDataURL('image/png');
  },{sources,...spec});
  writePng(`${OUT}/references/${spec.key}.png`,result);
 }
 writeFileSync(`${OUT}/sheets.json`,JSON.stringify(sheets,null,2)+'\n');
 console.log(`Prepared ${specs.length} transparent reference sheets.`);
}

if(mode==='export'){
 const audit=[];
 for(const spec of specs){
  const input=`${OUT}/masters/${spec.key}.png`;
  if(!existsSync(input))throw new Error(`Missing reviewed ImageGen master: ${input}`);
  const result=await page.evaluate(async({url,spec})=>{
   const im=new Image();im.src=url;await im.decode();
   const src=document.createElement('canvas');src.width=im.width;src.height=im.height;
   const ctx=src.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);
   // The generator sometimes supplies an opaque production matte instead of alpha.
   // Extract only that matte; never quantize or repaint the subjects' pigment/ink.
   const raster=ctx.getImageData(0,0,im.width,im.height),d=raster.data;
   let transparent=0,magenta=0;
   for(let p=0;p<d.length;p+=4){if(d[p+3]===0)transparent++;if(d[p]>180&&d[p+2]>150&&d[p+1]<105)magenta++;}
   if(transparent<im.width*im.height*.02){
    if(magenta>im.width*im.height*.1){
     for(let p=0;p<d.length;p+=4){
      if(d[p]>75&&d[p+2]>65&&Math.min(d[p],d[p+2])-d[p+1]>35)d[p+3]=0;
     }
    }else{
     // First masters arrived on a painted neutral checker. Structures also have tiny
     // enclosed matte gaps between fence rails and steps. Only soldiers need to retain
     // small neutral metal highlights; these structure masters use warm wall pigments.
     const retainedHighlightArea=spec.key.startsWith('army-')?300:0;
     const visited=new Uint8Array(im.width*im.height),queue=new Int32Array(visited.length);
     const neutral=p=>Math.min(d[p*4],d[p*4+1],d[p*4+2])>150&&Math.max(d[p*4],d[p*4+1],d[p*4+2])-Math.min(d[p*4],d[p*4+1],d[p*4+2])<18;
     for(let start=0;start<visited.length;start++){
      if(visited[start]||!neutral(start))continue;
      let end=1,at=0;queue[0]=start;visited[start]=1;
      while(at<end){const p=queue[at++],x=p%im.width;
       for(const q of [x>0?p-1:-1,x<im.width-1?p+1:-1,p-im.width,p+im.width]){
        if(q>=0&&q<visited.length&&!visited[q]&&neutral(q)){visited[q]=1;queue[end++]=q;}
       }
      }
      if(end>retainedHighlightArea)for(let n=0;n<end;n++)d[queue[n]*4+3]=0;
     }
    }
    ctx.putImageData(raster,0,0);
   }
   // Associate complete connected silhouettes with cells, instead of slicing a spear tip at a
   // nominal grid boundary. Separate houses within a compound stay in their original cell.
   const clean=ctx.getImageData(0,0,im.width,im.height).data;
   const owners=new Int16Array(im.width*im.height).fill(-1),seen=new Uint8Array(owners.length),work=new Int32Array(owners.length);
   const boxes=Array.from({length:spec.ids.length},()=>({left:im.width,top:im.height,right:-1,bottom:-1,count:0,edge:0}));
   for(let start=0;start<owners.length;start++){
    if(seen[start]||!clean[start*4+3])continue;
    let end=1,at=0,sx=0,sy=0;work[0]=start;seen[start]=1;
    while(at<end){const p=work[at++],x=p%im.width,y=Math.floor(p/im.width);sx+=x;sy+=y;
     for(const q of [x>0?p-1:-1,x<im.width-1?p+1:-1,p-im.width,p+im.width]){
      if(q>=0&&q<owners.length&&!seen[q]&&clean[q*4+3]){seen[q]=1;work[end++]=q;}
     }
    }
    const cell=Math.min(spec.rows-1,Math.floor(sy/end/im.height*spec.rows))*spec.cols+Math.min(spec.cols-1,Math.floor(sx/end/im.width*spec.cols));
    if(cell>=spec.ids.length)continue;
    const b=boxes[cell];
    for(let n=0;n<end;n++){const p=work[n],x=p%im.width,y=Math.floor(p/im.width);owners[p]=cell;
     b.left=Math.min(b.left,x);b.right=Math.max(b.right,x);b.top=Math.min(b.top,y);b.bottom=Math.max(b.bottom,y);b.count++;
     if(x===0||y===0||x===im.width-1||y===im.height-1)b.edge++;
    }
   }
   const outputs=[];
   for(let i=0;i<spec.ids.length;i++){
    const b=boxes[i],{left,top,right,bottom,edge}=b;
    const iw=right-left+1,ih=bottom-top+1;
    if(!b.count||edge||iw>im.width/spec.cols*1.15||ih>im.height/spec.rows*1.15)throw new Error(`${spec.ids[i]}: unsafe silhouette (${iw}x${ih}, ${edge} edge)`);
    const cell=document.createElement('canvas');cell.width=iw;cell.height=ih;const cc=cell.getContext('2d'),pixels=cc.createImageData(iw,ih);
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
     const p=y*im.width+x;if(owners[p]!==i)continue;
     const to=((y-top)*iw+x-left)*4;pixels.data.set(clean.subarray(p*4,p*4+4),to);
    }
    cc.putImageData(pixels,0,0);
    const figure=spec.ids[i].startsWith('figure.');
    const target=document.createElement('canvas');
    // Structures keep their aspect ratio so layout footprints don't include a large empty
    // square around a shallow roof. Figures retain the existing 144x128 animation canvas.
    const structureFit=Math.min(1,480/Math.max(iw,ih));
    target.width=figure?144:Math.ceil(iw*structureFit)+32;
    target.height=figure?128:Math.ceil(ih*structureFit)+32;
    const c=target.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
    const pad=figure?8:16;
    const fit=Math.min((target.width-pad*2)/iw,(target.height-pad*2)/ih);
    const dw=iw*fit,dh=ih*fit;
    c.drawImage(cell,0,0,iw,ih,(target.width-dw)/2,target.height-pad-dh,dw,dh);
    outputs.push({id:spec.ids[i],url:target.toDataURL('image/png'),width:target.width,height:target.height,
     sourceBounds:{x:left,y:top,width:iw,height:ih},sourceSize:{width:im.width,height:im.height},clearFraction:1-b.count/(im.width/spec.cols*im.height/spec.rows),sourceEdgePixels:edge});
   }
   return outputs;
  },{url:dataUrl(input),spec});
  for(const entry of result){
   const target=`${RUNTIME}/${entry.id.replaceAll('.','/')}.png`;
   writePng(target,entry.url);
   const {url,...metadata}=entry;audit.push({...metadata,approved:approved(entry.id),runtimePath:target,sourceSheet:spec.key});
   if(entry.id.endsWith('.skirmish')){
    const alias=entry.id.replace(/skirmish$/,'bow');const aliasPath=`${RUNTIME}/${alias.replaceAll('.','/')}.png`;
    writePng(aliasPath,entry.url);audit.push({...metadata,id:alias,approved:approved(alias),derivedFrom:entry.id,runtimePath:aliasPath,sourceSheet:spec.key});
   }
  }
 }
 const auditPath=`${OUT}/alpha-audit.json`;
 const previous=existsSync(auditPath)?JSON.parse(readFileSync(auditPath,'utf8')):[];
 const current=new Map(previous.map(e=>[e.id,e]));audit.forEach(e=>current.set(e.id,e));
 writeFileSync(auditPath,JSON.stringify([...current.values()],null,2)+'\n');
 const registryPath='src/ui/conquestDongHoV4Assets.json';
 const existingPaths=existsSync(registryPath)?JSON.parse(readFileSync(registryPath,'utf8')):{};
 const assetMap={...existingPaths,...Object.fromEntries([...current.values()].filter(e=>approved(e.id)).sort((a,b)=>a.id.localeCompare(b.id))
  .map(e=>[e.id,e.runtimePath.replace(/^public\//,'')]))};
 writeFileSync('src/ui/conquestDongHoV4Assets.json',JSON.stringify(assetMap,null,2)+'\n');
 writeFileSync(`${RUNTIME}/manifest.json`,JSON.stringify({version:4,status:current.size===234?'complete':'partial',
  generator:'built-in ImageGen',assets:[...current.values()]},null,2)+'\n');
 console.log(`Exported ${audit.length} assets with real alpha and complete silhouettes.`);
}
if(mode==='review'){
 for(const spec of specs){
  if(!existsSync(`${OUT}/masters/${spec.key}.png`))continue;
  const sources=spec.ids.map(id=>({id,
   before:dataUrl(manifest.assets.find(a=>a.id===id).runtimePath),
   after:dataUrl(`${RUNTIME}/${id.replaceAll('.','/')}.png`)}));
  for(const dark of [false,true]){
   const result=await page.evaluate(async({sources,dark})=>{
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=Math.ceil(sources.length/3)*270+50;
    const c=canvas.getContext('2d');c.fillStyle=dark?'#252421':'#eadcb8';c.fillRect(0,0,canvas.width,canvas.height);
    c.fillStyle=dark?'#f1deba':'#28231d';c.font='20px sans-serif';c.fillText('Original / Đông Hồ redraw — contours, colour and silhouette',20,30);
    for(let i=0;i<sources.length;i++){
     const x=(i%3)*400,y=Math.floor(i/3)*270+50;
     c.font='15px sans-serif';c.fillText(sources[i].id,x+12,y+22);
     for(const [col,key] of ['before','after'].entries()){
      const im=new Image();im.src=sources[i][key];await im.decode();
      const fit=Math.min(175/im.width,210/im.height);
      c.drawImage(im,x+col*195+(195-im.width*fit)/2,y+38+(210-im.height*fit),im.width*fit,im.height*fit);
     }
    }
    return canvas.toDataURL('image/png');
   },{sources,dark});
   writePng(`${OUT}/review/${spec.key}${dark?'-dark':''}.png`,result);
  }
 }
}
await browser.close();
