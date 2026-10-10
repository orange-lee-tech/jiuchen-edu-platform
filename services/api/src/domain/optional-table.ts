/** Optional read-only display data must not break a core classroom/assessment page.
 * Only suppress MySQL's table-not-found error; all other failures propagate.
 */
export function isMissingTableError(error: unknown): boolean {
  const seen=new Set<unknown>()
  let current:unknown=error
  for(let depth=0;depth<8;depth++) {
    if(!current||typeof current!=='object'||seen.has(current)) return false
    seen.add(current)
    const item=current as {code?:unknown;errno?:unknown;sqlState?:unknown;cause?:unknown}
    if(String(item.code??'')==='ER_NO_SUCH_TABLE'||Number(item.errno)===1146||
       String(item.sqlState??'')==='42S02') return true
    current=item.cause
  }
  return false
}
export async function missingOptionalTableAsEmpty<T>(query:()=>Promise<T[]>):Promise<T[]> {
  try {return await query()}
  catch(error){if(!isMissingTableError(error)) throw error;return []}
}
