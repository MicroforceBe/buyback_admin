"use client";

import {useEffect, useRef, useState} from 'react';
import type {DiagnosticSpec} from '@/lib/diagnostics';
import styles from './diagnostics.module.css';

type Props = {spec:DiagnosticSpec; onObservation:(value:string,evidence?:Record<string,number|boolean>)=>void};
type MotionPermission = {requestPermission?:()=>Promise<string>};
type Detector = {detect:(source:HTMLVideoElement)=>Promise<Array<{rawValue?:string}>>};
export default function TestExercise({spec,onObservation}:Props) {
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [touched,setTouched] = useState<number[]>([]);
  const [maxTouches,setMaxTouches] = useState(0);
  const [color,setColor] = useState('white');
  const [photo,setPhoto] = useState<string|null>(null);
  const [recording,setRecording] = useState(false);
  const [audio,setAudio] = useState<string|null>(null);
  const [cameraReady,setCameraReady] = useState(false);
  const [scanned,setScanned] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream|null>(null);
  const recorder = useRef<MediaRecorder|null>(null);
  const audioContext = useRef<AudioContext|null>(null);
  const objectUrl = useRef<string|null>(null);
  const cleanupSensor = useRef<()=>void>(()=>{});
  const generation = useRef(0);
  const alive = useRef(true);
  const viewing = useRef(new Set<string>());
  const evidenceRef=useRef<Record<string,number|boolean>>({});
  const announce = (text:string,evidence:Record<string,number|boolean>={}) => {setMessage(text);evidenceRef.current={...evidenceRef.current,...evidence};onObservation(text,evidenceRef.current);};
  useEffect(()=>{
    alive.current=true;
    return ()=>{
      alive.current=false;generation.current++;
      cleanupSensor.current();
      if(recorder.current) {
        recorder.current.onstop=null;recorder.current.ondataavailable=null;
        if(recorder.current.state!=='inactive') recorder.current.stop();
      }
      stream.current?.getTracks().forEach(t=>t.stop());
      void audioContext.current?.close();
      if(objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  },[]);
  useEffect(()=>{
    if(spec.tool!=='rotation') return;
    const track = ()=>{
      viewing.current.add(window.innerWidth>window.innerHeight?'landschap':'portret');
      const text = `Waargenomen schermstanden: ${Array.from(viewing.current).join(', ')}. Geen afzonderlijke gyroscoopkeuring.`;
      setMessage(text);if(viewing.current.size>1)onObservation(text,{portrait:viewing.current.has("portret"),landscape:viewing.current.has("landschap")});
    };
    track();window.addEventListener('resize',track);
    return ()=>window.removeEventListener('resize',track);
  },[spec.tool,onObservation]);

  function touch(x:number,y:number,element:HTMLElement,count:number) {
    const rect=element.getBoundingClientRect();
    const col=Math.min(7,Math.max(0,Math.floor((x-rect.left)/rect.width*8)));
    const row=Math.min(11,Math.max(0,Math.floor((y-rect.top)/rect.height*12)));
    const cell=row*8+col;
    setMaxTouches(v=>Math.max(v,count));
    setTouched(prev=>prev.includes(cell)?prev:[...prev,cell]);
  }
  useEffect(()=>{
    if(!['touch','multi','edges'].includes(spec.tool)) return;
    const required=Array.from({length:96},(_,i)=>i).filter(i=>spec.tool!=='edges'||i<8||i>=88||i%8===0||i%8===7);
    const text=spec.tool==='multi'?`Maximaal ${maxTouches} gelijktijdige aanrakingen waargenomen.`:`${required.filter(i=>touched.includes(i)).length}/${required.length} ${spec.tool==='edges'?'randsegmenten':'vakken'} aangeraakt.`;
    setMessage(text);if(touched.length||maxTouches)onObservation(text,{covered:required.filter(i=>touched.includes(i)).length,maxTouches});
  },[touched,maxTouches,spec.tool,onObservation]);

  async function startCamera(facing:'user'|'environment') {
    const operation=++generation.current;
    stream.current?.getTracks().forEach(t=>t.stop());setCameraReady(false);setPhoto(null);setScanned('');
    evidenceRef.current={...evidenceRef.current,photo:false,barcode:false};
    if(!navigator.mediaDevices?.getUserMedia) {announce('Niet ondersteund: cameratoegang ontbreekt in deze browser.');return;}
    setBusy(true);if(!evidenceRef.current.front && !evidenceRef.current.rear)announce('Camera opnieuw gestart; controleer beide beelden en maak een nieuwe foto.',{front:false,rear:false,photo:false,barcode:false});
    try {
      const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing}},audio:false});
      if(!alive.current || operation!==generation.current) {next.getTracks().forEach(t=>t.stop());return;}
      stream.current=next;
      if(video.current) {video.current.srcObject=next;await video.current.play();}
      setCameraReady(true);
      announce(`${facing==='user'?'Frontcamera':'Achtercamera'} geopend. Beeldkwaliteit en feitelijke camera moeten nog visueel worden beoordeeld.`,facing==='user'?{front:true}:{rear:true});
    } catch(error) {
      if(alive.current) announce(`Camera niet getest: ${error instanceof Error?error.name:'toegang mislukt'}. Controleer toestemming en camera; dit is geen automatisch defect.`);
    } finally {if(alive.current)setBusy(false);}
  }
  function capture() {
    const v=video.current;
    if(!v?.videoWidth || !v.videoHeight) {announce('Nog geen bruikbaar camerabeeld.');return;}
    const canvas=document.createElement('canvas');canvas.width=Math.min(v.videoWidth,1000);canvas.height=Math.round(v.videoHeight*canvas.width/v.videoWidth);
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.drawImage(v,0,0,canvas.width,canvas.height);setPhoto(canvas.toDataURL('image/jpeg',0.8));
    announce('Foto gemaakt voor lokale visuele beoordeling. De foto wordt niet opgeslagen of verstuurd.',{photo:true});
  }
  async function torch(enabled:boolean) {
    const track=stream.current?.getVideoTracks()[0];
    if(!track) {announce('Start eerst de achtercamera.');return;}
    const caps=track.getCapabilities() as MediaTrackCapabilities & {torch?:boolean};
    if(!caps.torch) {announce('Niet ondersteund: lampaansturing ontbreekt. Controleer de zaklamp handmatig via het bedieningspaneel.');return;}
    try {await track.applyConstraints({advanced:[{torch:enabled} as MediaTrackConstraintSet]});announce(`Lamp ${enabled?'aan':'uit'} gevraagd. Controleer de fysieke lamp; dit is nog geen geslaagde beoordeling.`);}
    catch {announce('Lampaansturing niet beschikbaar. Gebruik het bedieningspaneel voor een manuele controle.');}
  }
  async function scan() {
    const DetectorClass=(window as typeof window & {BarcodeDetector?:new(options:{formats:string[]})=>Detector}).BarcodeDetector;
    if(!DetectorClass) {announce('Niet ondersteund: deze browser heeft geen barcodedecoder. Kies niet ondersteund; dit zegt niets over een cameradefect.');return;}
    if(!video.current?.videoWidth) {announce('Start eerst de achtercamera en richt op een bekende code.');return;}
    try {
      const codes=await new DetectorClass({formats:['qr_code','ean_13','ean_8','code_128']}).detect(video.current);
      const value=codes.find(c=>c.rawValue)?.rawValue;
      setScanned(value||'');announce(value?'Barcode gelezen. Vergelijk de getoonde waarde met de bekende code.':'Geen code gelezen; richt opnieuw en probeer nog eens.',{barcode:!!value});
    } catch {announce('Decoder kon deze opname niet lezen. Probeer opnieuw of markeer de test als geblokkeerd.');}
  }
  async function startRecording() {
    if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined') {announce('Niet ondersteund: audio-opname ontbreekt.');return;}
    const operation=++generation.current;setBusy(true);announce('Nieuwe microfoonopname gestart.',{played:false});
    try {
      const next=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!alive.current || operation!==generation.current) {next.getTracks().forEach(t=>t.stop());return;}
      stream.current?.getTracks().forEach(t=>t.stop());stream.current=next;
      if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);setAudio(null);evidenceRef.current.played=false;
      const mime=['audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      const rec=mime?new MediaRecorder(next,{mimeType:mime}):new MediaRecorder(next);
      const chunks:BlobPart[]=[];
      rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      rec.onerror=()=>{next.getTracks().forEach(t=>t.stop());if(alive.current){setRecording(false);announce('Opname mislukt; microfoon is nog niet beoordeeld.');}};
      rec.onstop=()=>{
        next.getTracks().forEach(t=>t.stop());if(!alive.current)return;
        setRecording(false);
        if(!chunks.length){announce('Geen opname beschikbaar. Probeer opnieuw.');return;}
        objectUrl.current=URL.createObjectURL(new Blob(chunks,{type:rec.mimeType}));setAudio(objectUrl.current);
        announce('Opname beschikbaar. Speel volledig terug af en beoordeel het geluid; nog geen geslaagde microfoontest.');
      };
      recorder.current=rec;rec.start();setRecording(true);announce('Opname loopt. Spreek en druk daarna op Stop.');
    } catch(error) {
      stream.current?.getTracks().forEach(t=>t.stop());
      if(alive.current)announce(`Microfoon niet getest: ${error instanceof Error?error.name:'toegang mislukt'}. Controleer de toestemming.`);
    } finally {if(alive.current)setBusy(false);}
  }
  async function tone(hz:number) {
    try {
      if(audioContext.current) await audioContext.current.close();
      const ctx=new AudioContext();audioContext.current=ctx;await ctx.resume();
      const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=hz;gain.gain.value=0.08;
      osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+1);
      announce(`Toon ${hz} Hz afgespeeld. Controleer zelf de uitvoerroute en geluidskwaliteit.`);
    } catch {announce('Audio kon niet starten. Controleer browserinstellingen en probeer opnieuw.');}
  }
  async function motion() {
    cleanupSensor.current();announce('Nieuwe bewegingsmeting gestart.',{acceleration:false,rotation:false});
    if(typeof DeviceMotionEvent==='undefined') {announce('Niet ondersteund: bewegingsgegevens ontbreken.');return;}
    try {
      const permission=DeviceMotionEvent as unknown as MotionPermission;
      if(permission.requestPermission && await permission.requestPermission()!=='granted') {announce('Geblokkeerd: toestemming geweigerd. De sensoren zijn niet beoordeeld.');return;}
      if(!alive.current)return;
      let acceleration=false,rotation=false,events=0,validAcceleration=false,validRotation=false;
      const listener=(e:DeviceMotionEvent)=>{
        events++;
        const a=[e.acceleration?.x,e.acceleration?.y,e.acceleration?.z];
        const r=[e.rotationRate?.alpha,e.rotationRate?.beta,e.rotationRate?.gamma];
        validAcceleration ||= a.some(n=>typeof n==='number' && Number.isFinite(n));
        validRotation ||= r.some(n=>typeof n==='number' && Number.isFinite(n));
        acceleration ||= a.some(n=>typeof n==='number' && Math.abs(n)>1.5);
        rotation ||= r.some(n=>typeof n==='number' && Math.abs(n)>15);
      };
      window.addEventListener('devicemotion',listener);setBusy(true);announce('Beweeg en draai het toestel gedurende acht seconden.');
      const timer=window.setTimeout(()=>{
        window.removeEventListener('devicemotion',listener);setBusy(false);
        announce(!events || !validAcceleration || !validRotation?'Niet ondersteund / onvolledig: versnelling zonder zwaartekracht en rotatiesnelheid zijn niet beide beschikbaar.':`Versnelling zonder zwaartekracht: ${acceleration?'beweging waargenomen':'geen beweging waargenomen'}; rotatiesnelheid: ${rotation?'draaiing waargenomen':'geen draaiing waargenomen'}. Bij onvoldoende beweging opnieuw testen; geen automatische defectverklaring.`,{acceleration,rotation});
      },8000);
      cleanupSensor.current=()=>{window.clearTimeout(timer);window.removeEventListener('devicemotion',listener);};
    } catch {if(alive.current)announce('Geblokkeerd: bewegingsgegevens konden niet worden aangevraagd.');}
  }
  async function network(transfer:boolean) {
    setBusy(true);announce('Nieuwe overdrachtsmeting gestart.',{transfer:false});const controller=new AbortController();cleanupSensor.current=()=>controller.abort();
    const timer=window.setTimeout(()=>controller.abort(),15000);
    try {
      const start=performance.now();
      const response=await fetch(`/api/diagnostics/network-probe?t=${Date.now()}`,{cache:'no-store',signal:controller.signal});
      if(!response.ok || response.headers.get('X-Diagnostic-Bytes')!=='131072')throw new Error('Geen geldig antwoord van de testserver');
      const data=await response.text();
      if(data.length!==131072 || /[^x]/.test(data))throw new Error('Onvolledige of onjuiste download');
      const down=Math.max(1,performance.now()-start);
      if(!transfer){if(alive.current)announce('Geldig serverantwoord ontvangen. De browser bevestigt niet of dit via wifi of mobiele data ging.',{transfer:true});return;}
      const uploadStart=performance.now();
      const upload=await fetch('/api/diagnostics/network-probe',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:'x'.repeat(131072),cache:'no-store',signal:controller.signal});
      if(!upload.ok)throw new Error('Upload geweigerd of mislukt');
      const ack=await upload.json();if(!ack.ok || ack.bytes!==131072)throw new Error('Upload niet volledig bevestigd');
      const up=Math.max(1,performance.now()-uploadStart);
      if(alive.current)announce(`Download en upload: elk 131072 bytes bevestigd. Indicatief ${((131072*8)/(down*1000)).toFixed(2)} / ${((131072*8)/(up*1000)).toFixed(2)} Mbit/s (inclusief serververtraging; geen maximale lijnsnelheid).`,{transfer:true});
    } catch(error) {if(alive.current)announce(`Verbinding niet beoordeeld: ${error instanceof Error?error.message:'test mislukt'}. Een netwerk- of serverfout is geen bewezen toesteldefect.`);}
    finally {window.clearTimeout(timer);if(alive.current)setBusy(false);}
  }
  function gps() {
    announce('Nieuwe locatiecontrole gestart.',{location:false});
    if(!navigator.geolocation){announce('Niet ondersteund: browserlocatie ontbreekt.');return;}
    setBusy(true);
    navigator.geolocation.getCurrentPosition(p=>{
      if(!alive.current)return;setBusy(false);
      announce(`Locatie ontvangen; gerapporteerde nauwkeurigheid ${Math.round(p.coords.accuracy)} m. Vergelijk de tijdelijk getoonde positie met de echte plek. Geen afzonderlijke GPS-keuring.`,{location:true});
      setMessage(`Positie ${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}; nauwkeurigheid ${Math.round(p.coords.accuracy)} m. Coördinaten worden niet bewaard. Controleer buiten en vergelijk met de werkelijke plek.`);
    },e=>{if(alive.current){setBusy(false);announce(`Locatie niet getest: ${e.code===1?'toestemming geweigerd':e.code===3?'tijd verstreken; probeer buiten':'locatie niet beschikbaar'}. Dit bewijst geen defect.`);}},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  }
  const cameraTool=['camera','barcode'].includes(spec.tool);
  return <div className={styles.exercise}>
    {['touch','multi','edges'].includes(spec.tool)?<>
      <div aria-label="Touch-testvlak" className={styles.touchGrid}
        onTouchStart={e=>{for(const t of Array.from(e.touches))touch(t.clientX,t.clientY,e.currentTarget,e.touches.length);}}
        onTouchMove={e=>{for(const t of Array.from(e.touches))touch(t.clientX,t.clientY,e.currentTarget,e.touches.length);}}
        onPointerDown={e=>{if(e.pointerType==='mouse')touch(e.clientX,e.clientY,e.currentTarget,1);}}
        onPointerMove={e=>{if(e.pointerType==='mouse'&&e.buttons)touch(e.clientX,e.clientY,e.currentTarget,1);}}>
        {Array.from({length:96},(_,i)=><span key={i} style={{background:touched.includes(i)?'#34d399':spec.tool==='edges'&&(i<8||i>=88||i%8===0||i%8===7)?'#fb7185':'#17243b'}}/>) }
      </div><button type="button" onClick={()=>{setTouched([]);setMaxTouches(0);onObservation("Testvlak opnieuw gestart.",{covered:0,maxTouches:0});}}>Testvlak opnieuw</button>
    </>:null}
    {spec.tool==='screen'?<>
      <div className={styles.colorSample} style={{background:color}} aria-label={`Testkleur ${color}`}/>
      <div className={styles.buttons}>{['white','black','red','green','blue','yellow','gray'].map(c=><button type="button" key={c} onClick={()=>{setColor(c);viewing.current.add(c);announce(`${viewing.current.size}/7 kleurvlakken geopend. Visuele beoordeling door medewerker vereist.`);}}>{c}</button>)}</div>
    </>:null}
    {cameraTool?<>
      <div className={styles.buttons}><button type="button" disabled={busy} onClick={()=>void startCamera('environment')}>Achtercamera</button><button type="button" disabled={busy} onClick={()=>void startCamera('user')}>Frontcamera</button><button type="button" disabled={!cameraReady} onClick={capture}>Foto bekijken</button>
        {spec.key==='flashlight'?<><button type="button" onClick={()=>void torch(true)}>Lamp aan</button><button type="button" onClick={()=>void torch(false)}>Lamp uit</button></>:null}
        {spec.tool==='barcode'?<button type="button" onClick={()=>void scan()}>Lees code</button>:null}
      </div><video ref={video} autoPlay muted playsInline className={styles.video}/>
      {photo?<img src={photo} alt="Tijdelijke testfoto, alleen op dit toestel" className={styles.video}/>:null}
      {scanned?<p>Gelezen code: <strong>{scanned}</strong></p>:null}
    </>:null}
    {spec.tool==='microphone'?<><div className={styles.buttons}><button type="button" disabled={busy||recording} onClick={()=>void startRecording()}>Start opname</button><button type="button" disabled={!recording} onClick={()=>{if(recorder.current?.state==='recording')recorder.current.stop();}}>Stop opname</button></div>{audio?<audio controls src={audio} onEnded={()=>announce("Opname volledig teruggespeeld. Beoordeel verstaanbaarheid en vervorming.",{played:true})}/>:null}</>:null}
    {spec.tool==='speaker'?<div className={styles.buttons}>{[250,500,1000,2000,4000].map(hz=><button key={hz} type="button" onClick={()=>void tone(hz)}>{hz} Hz</button>)}</div>:null}
    {spec.tool==='motion'?<button type="button" disabled={busy} onClick={()=>void motion()}>Meet beweging en draaiing</button>:null}
    {['network','transfer'].includes(spec.tool)?<button type="button" disabled={busy} onClick={()=>void network(spec.tool==='transfer')}>{busy?'Meten…':'Start verbindingstest'}</button>:null}
    {spec.tool==='gps'?<button type="button" disabled={busy} onClick={gps}>Vraag locatie aan</button>:null}
    {spec.tool==='manual'?<p className={styles.hint}>Deze controle voer je zelf uit op het toestel. Bevestig hieronder wat je werkelijk hebt gecontroleerd.</p>:null}
    {message?<p role="status" className={styles.observation}>{message}</p>:null}
  </div>;
}
