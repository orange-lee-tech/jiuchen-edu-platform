import type { ReportLayout, ReportLine } from './assessment-image'

/** Paginated raster PDF reuses the same Chinese Canvas rendering and watermark.
 * Images use the bounded RGB PNG encoder; no fonts, server conversion or new dependency.
 */
export function paginateAssessmentLayout(layout:ReportLayout):ReportLayout[]{
  const pages:ReportLayout[]=[]
  let lines:ReportLine[]=[],y=150
  const push=()=>{
    pages.push({...layout,height:1060,lines:[
      {text:'九辰教育 AI评估报告',y:30,size:26,heading:true},
      ...layout.lines.filter(line=>line.y<150&&line.text.includes('用户ID')).map((line,index)=>({...line,y:70+index*34,size:20,heading:false})),
      ...lines,{text:`第 ${pages.length+1} 页 · 导出日期：${layout.date}`,y:1000,size:20,heading:false},
    ]})
    lines=[];y=150
  }
  // PDF has identity on every page; omit the long-image's repeated tail identity
  // so two footer lines cannot create an otherwise empty extra page.
  let tail=layout.lines.length
  for(let index=layout.lines.length-1;index>=0;index--){
    if(layout.lines[index].text.includes('用户ID')){
      for(let start=index-1;start>=0;start--){if(!layout.lines[start].text){tail=start;break}}
      break
    }
  }
  const body=layout.lines.slice(0,tail)
  body.forEach((line,index)=>{
    const step=line.heading?48:38
    const keepNext=line.heading&&index<body.length-1?38:0
    if(lines.length&&y+step+keepNext>965)push()
    lines.push({...line,y});y+=step
  })
  if(lines.length)push()
  if(pages.length>40)throw new Error('报告超过40页，请使用Markdown或Word导出完整内容')
  return pages
}

function ascii(value:string){return new Uint8Array([...value].map(char=>char.charCodeAt(0)))}
function concat(parts:Uint8Array[]){const out=new Uint8Array(parts.reduce((size,part)=>size+part.length,0));let offset=0;parts.forEach(part=>{out.set(part,offset);offset+=part.length});return out}

export function buildAssessmentPdf(pages:Uint8Array[]):ArrayBuffer{
  if(!pages.length||pages.length>40)throw new Error('PDF页数超出限制')
  const parts:Uint8Array[]=[ascii('%PDF-1.4\n')],offsets=[0]
  let length=parts[0].length
  const add=(data:Uint8Array)=>{length+=data.length;if(length>24*1024*1024)throw new Error('PDF超出24MiB预算，请用Word导出');parts.push(data)}
  const object=(id:number,data:Uint8Array)=>{offsets[id]=length;add(ascii(`${id} 0 obj\n`));add(data);add(ascii('\nendobj\n'))}
  object(1,ascii('<< /Type /Catalog /Pages 2 0 R >>'))
  object(2,ascii(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,index)=>`${3+index*3} 0 R`).join(' ')}] >>`))
  pages.forEach((png,index)=>{
    const view=new DataView(png.buffer,png.byteOffset,png.byteLength)
    if(png.length<33||png[0]!==137||png[25]!==2||png[24]!==8)throw new Error('PDF只接受报告编码器生成的8位RGB PNG')
    const width=view.getUint32(16),height=view.getUint32(20)
    const idat:Uint8Array[]=[]
    for(let offset=8;offset<png.length;){
      const size=view.getUint32(offset)
      if(offset+size+12>png.length)throw new Error('PNG分段不完整')
      const type=String.fromCharCode(...png.subarray(offset+4,offset+8))
      if(type==='IDAT')idat.push(png.subarray(offset+8,offset+8+size))
      offset+=size+12
    }
    if(!idat.length||width*height>15000000)throw new Error('PNG报告数据无效')
    const image=concat(idat),pageId=3+index*3,imageId=pageId+1,contentId=pageId+2
    object(pageId,ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Report ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`))
    object(imageId,concat([ascii(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${width} >> /Length ${image.length} >>\nstream\n`),image,ascii('\nendstream')]))
    const content=ascii('q 595.28 0 0 841.89 0 0 cm /Report Do Q')
    object(contentId,concat([ascii(`<< /Length ${content.length} >>\nstream\n`),content,ascii('\nendstream')]))
  })
  const xref=length
  add(ascii(`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`))
  return concat(parts).buffer as ArrayBuffer
}
