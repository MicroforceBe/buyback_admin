'use client';
import {useEffect,useRef,useState} from 'react';
import styles from './CopyCode.module.css';

export default function CopyCode({value,label='SKU',className}:{value:string;label?:'SKU'|'EAN';className?:string}){
 const [feedback,setFeedback]=useState('');
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 async function copy(){
  if(timer.current)clearTimeout(timer.current);
  let copied=false;
  try{await navigator.clipboard.writeText(value);copied=true;}catch{
   const focused=document.activeElement as HTMLElement|null;
   const selection=window.getSelection(),ranges=selection?Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange()):[];
   const field=document.createElement('textarea');field.value=value;field.readOnly=true;
   field.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';document.body.appendChild(field);
   try{field.select();copied=document.execCommand('copy');}catch{copied=false;}finally{field.remove();focused?.focus({preventScroll:true});if(selection){selection.removeAllRanges();for(const range of ranges)selection.addRange(range);}}
  }
  setFeedback(copied?'Gekopieerd':'Kopiëren niet gelukt');
  timer.current=setTimeout(()=>setFeedback(''),2200);
 }
 return <span className={styles.wrap}><button type="button" className={[styles.code,className].filter(Boolean).join(' ')} title={label+' kopiëren: '+value} aria-label={label+' '+value+' kopiëren'} onClick={event=>{event.preventDefault();event.stopPropagation();void copy();}}>{value}</button><span role="status" className={feedback?styles.feedback:'sr-only'}>{feedback}</span></span>;
}
