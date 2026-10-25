import { labelStyles } from './productLabel';
let activeFrame: HTMLIFrameElement | null = null;
export async function printProductLabel(html: string) {
  if (activeFrame) throw new Error('Er is al een afdrukvenster geopend. Sluit dat eerst.');
  const frame=document.createElement('iframe');
  activeFrame=frame;
  frame.title='DYMO 99012 productlabel';
  frame.setAttribute('aria-hidden','true');
  frame.tabIndex=-1;
  Object.assign(frame.style,{position:'fixed',left:'-10000px',top:'0',width:'89mm',height:'36mm',border:'0'});
  const cleanup=()=>{frame.remove();if(activeFrame===frame)activeFrame=null;window.removeEventListener('pagehide',cleanup);};
  try{
    await new Promise<void>((resolve,reject)=>{
      const timeout=window.setTimeout(()=>reject(new Error('Het label kon niet tijdig worden voorbereid. Probeer opnieuw.')),10000);
      frame.onload=()=>{window.clearTimeout(timeout);resolve();};
      frame.onerror=()=>{window.clearTimeout(timeout);reject(new Error('Het afdrukdocument kon niet worden geladen.'));};
      frame.srcdoc='<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>DYMO productlabel</title><style>'+'html,body{margin:0;padding:0;background:#fff}'+labelStyles+'</style></head><body>'+html+'</body></html>';
      document.body.appendChild(frame);
    });
    const target=frame.contentWindow;
    if(!target)throw new Error('Het afdrukvenster kon niet worden geopend.');
    await frame.contentDocument?.fonts.ready;
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    target.addEventListener('afterprint',cleanup,{once:true});
    window.addEventListener('pagehide',cleanup,{once:true});
    target.focus();
    target.print();
  }catch(error){cleanup();throw error;}
}
