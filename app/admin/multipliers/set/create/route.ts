import { NextResponse } from "next/server";
import { supabaseAdmin as sbExport } from "@/lib/supabaseAdmin";
function sb(){const any:any=sbExport as any;return typeof any==="function"?any():any;}

type Questions = Record<string,{title?:string|null;options:Array<{key:string;label?:string|null;tip?:string|null;type:"percent"|"fixed";value:number;priority?:number|null;active?:boolean|null;}>}>;
type Body = { category:string; name:string; questions:Questions; order?:string[]; q_order?:string[]; questions_order?:string[]; };

export async function OPTIONS(){ return new NextResponse(null,{status:204}); }

export async function POST(req:Request){
  try{
    const p = (await req.json()) as Body;
    const category = (p.category||"").trim();
    const name = (p.name||"").trim();
    if(!category||!name) return NextResponse.json({error:"category en name zijn verplicht"}, {status:400});
    const order = (Array.isArray(p.order)&&p.order) || (Array.isArray(p.q_order)&&p.q_order) || (Array.isArray(p.questions_order)&&p.questions_order) || Object.keys(p.questions||{});
    const { data, error } = await sb().from("buyback_multiplier_sets_json").upsert(
      { category, name, questions: p.questions||{}, order },
      { onConflict: "category,name", ignoreDuplicates: false }
    ).select("*").single();
    if(error) return NextResponse.json({error:error.message},{status:500});
    return NextResponse.json({ok:true,set:data},{status:201});
  }catch(e:any){
    return NextResponse.json({error:e?.message||"Onbekende fout"},{status:500});
  }
}
