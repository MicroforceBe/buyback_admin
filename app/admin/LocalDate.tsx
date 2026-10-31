'use client';
import {useEffect,useState} from 'react';
import {formatPcDate,type DateValue} from '@/lib/pcDate';
export default function LocalDate({value,withTime=false,timeZone}:{value:DateValue;withTime?:boolean;timeZone?:string}){
 const [locale,setLocale]=useState('nl-NL');
 useEffect(()=>{setLocale(Intl.DateTimeFormat().resolvedOptions().locale||navigator.language||'nl-NL');},[]);
 return <span>{formatPcDate(value,locale,withTime,timeZone)}</span>;
}
