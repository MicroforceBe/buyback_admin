export default function WaitingSkuCheck({sku,title}:{sku:string;title:string}){
 const description='ERP-artikel beschikbaar: '+sku+' · '+title;
 return <span className="inline-flex shrink-0 items-center text-emerald-600" title={description} role="img" aria-label={description}><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-6"/></svg></span>;
}

