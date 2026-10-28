'use client';
import {useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {skuPopupPosition} from '@/lib/skuPopupPosition';
export default function SkuResultsPopup({anchor,onClose,children}:{anchor:RefObject<HTMLInputElement|null>;onClose:()=>void;children:ReactNode}){
 const panel=useRef<HTMLDivElement>(null),close=useRef(onClose);
 close.current=onClose;
 const [position,setPosition]=useState<ReturnType<typeof skuPopupPosition>>(null);
 useLayoutEffect(()=>{
  let frame=0;
  const update=()=>{const input=anchor.current;if(!input){close.current();return;}const next=skuPopupPosition(input.getBoundingClientRect(),{width:window.innerWidth,height:window.innerHeight});if(!next){close.current();return;}setPosition(next);};
  const move=(e:Event)=>{if(e.target instanceof Node&&panel.current?.contains(e.target))return;cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};
  const outside=(e:Event)=>{const target=e.target;if(target instanceof Node&&!panel.current?.contains(target)&&!anchor.current?.contains(target))close.current();};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();anchor.current?.focus();close.current();}};
  const blur=()=>close.current();
  update();window.addEventListener('scroll',move,true);window.addEventListener('resize',move);window.addEventListener('blur',blur);document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',outside);document.addEventListener('keydown',key);
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update);if(anchor.current)observer?.observe(anchor.current);
  return()=>{cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('scroll',move,true);window.removeEventListener('resize',move);window.removeEventListener('blur',blur);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside);document.removeEventListener('keydown',key);};
 },[anchor]);
 if(!position)return null;
 return createPortal(<div ref={panel} role="region" aria-label="Gevonden SKU-artikelen" className="rounded-xl border border-slate-200 bg-white font-sans text-xs text-slate-900 shadow-2xl" style={{position:'fixed',zIndex:1000,overflowY:'auto',overscrollBehavior:'contain',...position}}>{children}</div>,document.body);
}
