'use client';
import {useEffect,useState} from 'react';
import QRCode from 'qrcode';

export default function WebDiagnosticsQr({sessionId}:{sessionId:string}) {
  const [state,setState]=useState({src:'',url:'',error:false});
  useEffect(()=>{
    let active=true;
    // The phone must open this environment, regardless of missing or stale env vars.
    const url=new URL('/admin/diagnostics/'+encodeURIComponent(sessionId)+'/web-tests',window.location.origin).href;
    setState({src:'',url,error:false});
    QRCode.toDataURL(url).then(src=>{if(active)setState({src,url,error:false});}).catch(()=>{if(active)setState({src:'',url,error:true});});
    return()=>{active=false;};
  },[sessionId]);
  return <div className="rounded border p-4"><h2 className="mb-3 font-semibold">Open op iPhone</h2>
    <div className="flex flex-col items-center gap-3">
      {state.src?<img src={state.src} alt="QR-code om deze diagnosesessie op de iPhone te openen" className="h-56 w-56"/>:null}
      {state.error?<p role="alert">QR-code maken lukt niet. Open de onderstaande link op de iPhone.</p>:null}
      {state.url?<a href={state.url} className="text-center text-sm text-gray-500 break-all underline">{state.url}</a>:<p className="text-sm text-gray-500">Link voorbereiden...</p>}
    </div>
  </div>;
}
