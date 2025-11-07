import { NextResponse } from "next/server";
import { supabaseAdmin as sbExport } from "@/lib/supabaseAdmin";
function sb(){const any:any=sbExport as any;return typeof any==="function"?any():any;}

type Body = { category:string; name:string };

export async function OPTIONS(){ return new NextResponse(null,{status:204}); }

export async function POST(req:Request){
  try{
    const p = (await req.json()) as Body;
    const category = (p.category||"").trim();
    const name = (p.name||"").trim();
    if(!category||!name) return NextResponse.json({error:"category en name zijn verplicht"},{status:400});
    const { error } = await sb().from("buyback_multiplier_sets_json")
      .delete().eq("category", category).eq("name", name);
    if(error) return NextResponse.json({error:error.message},{status:500});
    return NextResponse.json({ok:true});
  }catch(e:any){
    return NextResponse.json({error:e?.message||"Onbekende fout"},{status:500});
  }
}
