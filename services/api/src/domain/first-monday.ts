export function isFirstMonday(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false
 const [year,month,day]=value.split('-').map(Number)
 const d=new Date(Date.UTC(year,month-1,day))
 return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&
 d.getUTCDate()===day&&d.getUTCDay()===1
}

