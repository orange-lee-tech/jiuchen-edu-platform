import {getApiSessionToken} from './session'

export type ReadOnlyContext={kind:'student'|'teacher';id:string;role:'student'|'teacher'|'staff';name:string;businessId:string;operatorUserId:string;readToken:string;expiresAt:string}
let context:(ReadOnlyContext&{token:string})|null=null
let version=0
const listeners=new Set<()=>void>()
export function subscribeReadOnlyContext(listener:()=>void){listeners.add(listener);return ()=>listeners.delete(listener)}
export function getReadOnlyContext(){
 if(context&&(context.token!==getApiSessionToken()||Date.parse(context.expiresAt)<=Date.now()))clearReadOnlyContext()
 return context
}
export function readOnlyVersion(){getReadOnlyContext();return version}
export function setReadOnlyContext(value:ReadOnlyContext){
 const token=getApiSessionToken()
 if(!token)throw new Error('unauthorized')
 if(!value.readToken?.startsWith('ro.')||!Number.isFinite(Date.parse(value.expiresAt)))throw new Error('read_only_invalid_context')
 context={...value,token};version++;listeners.forEach(listener=>listener())
}
export function clearReadOnlyContext(){context=null;version++;listeners.forEach(listener=>listener())}
export function isReadOnly(){return Boolean(getReadOnlyContext())}
