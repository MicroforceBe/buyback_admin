'use client';
import type {WorkSort} from '@/lib/erpDistribution';
export default function SortHeader({field,label,sort,onChange}:{field:string;label:string;sort:WorkSort;onChange:(field:string)=>void}){
 const active=sort.key===field;return <th scope="col" aria-sort={active?(sort.direction==='asc'?'ascending':'descending'):'none'}><button type="button" className="distribution-sort" onClick={()=>onChange(field)} title={'Sorteer op '+label}>{label}<span aria-hidden="true">{active?(sort.direction==='asc'?' ↑':' ↓'):' ↕'}</span></button></th>;
}
