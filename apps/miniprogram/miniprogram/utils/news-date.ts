export function beijingNewsTime(value:string|null|undefined,full=false):string {
  if(!value)return '未记录'
  const time=new Date(value)
  if(Number.isNaN(time.getTime()))return '未记录'
  const date=new Date(time.getTime()+8*3600000),pad=(n:number)=>String(n).padStart(2,'0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`+
    (full?` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}（北京时间）`:'')
}
export function newsPublicationLabel(post:{source:string;publishedAt:string|null;sourceUpdatedAt?:string|null;publicationTimeSource?:string},full=false):string {
  const verified=post.source==='manual'||post.publicationTimeSource==='explicit_publish_time'
  if(verified&&post.publishedAt)return '发表：'+beijingNewsTime(post.publishedAt,full)
  const updated=post.sourceUpdatedAt||(!verified?post.publishedAt:null)
  return '发表时间待核实'+(updated?' · 来源更新：'+beijingNewsTime(updated,full):'')
}
