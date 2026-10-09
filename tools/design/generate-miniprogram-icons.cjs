// Original Jiuchen line geometry. No external asset, font or runtime dependency.
// 64px transparent PNG, antialiased at 4x. Regenerate with Node, no UI helper.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib')
const circle=(x,y,r)=>Array.from({length:33},(_,i)=>[x+r*Math.cos(i*Math.PI/16),y+r*Math.sin(i*Math.PI/16)])
const icons={
 home:[[[10,29],[32,10],[54,29]],[[16,26],[16,53],[48,53],[48,26]],[[27,53],[27,38],[37,38],[37,53]]],
 workbench:[[[12,14],[52,14],[52,50],[12,50],[12,14]],[[12,25],[52,25]],[[25,25],[25,50]],[[33,34],[44,34]],[[33,42],[44,42]]],
 calendar:[[[12,16],[52,16],[52,53],[12,53],[12,16]],[[12,28],[52,28]],[[23,10],[23,22]],[[41,10],[41,22]],[[22,37],[29,37]],[[36,37],[43,37]],[[22,45],[29,45]]],
 users:[circle(24,21,8),circle(45,25,6),[[8,52],[8,44],[15,35],[33,35],[40,44],[40,52]],[[42,38],[50,38],[56,44],[56,52]]],
 opportunity:[[[16,11],[48,11],[48,53],[16,53],[16,11]],[[23,22],[41,22]],[[23,31],[41,31]],[[23,40],[36,40]]],
 coaching:[[[12,13],[52,13],[52,43],[29,43],[17,53],[17,43],[12,43],[12,13]],[[22,25],[42,25]],[[22,33],[36,33]]],
 business:[[[10,23],[54,23],[54,52],[10,52],[10,23]],[[23,23],[23,13],[41,13],[41,23]],[[10,34],[28,37],[36,37],[54,34]],[[28,33],[36,33],[36,41],[28,41],[28,33]]],
 mine:[circle(32,21,9),[[15,51],[15,44],[20,37],[44,37],[49,44],[49,51]]],
 assessment:[[[15,11],[43,11],[49,17],[49,53],[15,53],[15,11]],[[24,43],[24,34]],[[32,43],[32,27]],[[40,43],[40,21]]],
 growth:[[[12,51],[23,38],[33,41],[49,15]],circle(23,38,3),[[37,15],[49,15],[49,27]]],
 service:[[[12,38],[12,26],[18,15],[32,10],[46,15],[52,26],[52,38]],[[12,29],[20,29],[20,43],[12,43],[12,29]],[[44,29],[52,29],[52,43],[44,43],[44,29]],[[50,43],[44,52],[33,52]]],
 website:[circle(32,32,23),[[9,32],[55,32]],[[13,21],[51,21]],[[13,43],[51,43]],[[32,9],[23,20],[21,32],[23,44],[32,55],[41,44],[43,32],[41,20],[32,9]]],
 assignments:[circle(17,20,7),circle(47,44,7),[[13,38],[13,47],[29,47]],[[35,17],[51,17],[51,26]],[[27,27],[37,37]],[[28,37],[37,37],[37,28]]],
}
function crc(b){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
function chunk(type,data){const tag=Buffer.from(type),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([tag,data])));return Buffer.concat([len,tag,data,sum])}
function png(lines,color){
 const size=64,scale=4,rgba=Buffer.alloc(size*size*4),rgb=color.match(/\w\w/g).map(x=>parseInt(x,16)),segments=lines.flatMap(line=>line.slice(1).map((p,i)=>[line[i],p]))
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let coverage=0
  for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++){
   const px=x+(sx+.5)/scale,py=y+(sy+.5)/scale
   if(segments.some(([a,b])=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((px-a[0])*dx+(py-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy)<1.6}))coverage++
  }
  const at=(y*size+x)*4;rgba[at]=rgb[0];rgba[at+1]=rgb[1];rgba[at+2]=rgb[2];rgba[at+3]=Math.round(coverage*255/16)
 }
 const rows=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)rgba.copy(rows,y*(size*4+1)+1,y*size*4,(y+1)*size*4)
 const h=Buffer.alloc(13);h.writeUInt32BE(size,0);h.writeUInt32BE(size,4);h[8]=8;h[9]=6
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])
}
const out=path.resolve(__dirname,'../../apps/miniprogram/miniprogram/assets/icons');fs.mkdirSync(out,{recursive:true})
const tabNames=new Set(['home','workbench','calendar','users','opportunity','coaching','business','mine'])
let count=0
for(const[name,lines]of Object.entries(icons))for(const[state,color]of[['normal','5f6b78'],['active','2f6fed']])if(state==='active'||tabNames.has(name)){fs.writeFileSync(path.join(out,`${name}-${state}.png`),png(lines,color));count++}
console.log(`Generated ${count} original local icons`)
