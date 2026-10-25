import { diagnosticAccess } from '@/lib/security/access';
import { NextResponse } from "next/server"; 
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { prisma } from "@/lib/prisma";
import { diagnosticReport } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const accessDenied = await diagnosticAccess(req, 'write');
  if (accessDenied) return accessDenied;

  try {
    const body = await req.json();

    const sessionId = String(body.sessionId || "").trim();

    if (!sessionId) {
      return NextResponse.json(
        {
          ok: false,
          error: "sessionId is verplicht",
        },
        {
          status: 400,
        }
      );
    }

    const {data:existing,error:lookupError}=await supabaseAdmin.from("diagnostics_sessions").select("*").eq("session_id",sessionId).single();
    if(lookupError || !existing?.prisma_session_id) return NextResponse.json({ok:false,error:"Geen gekoppelde diagnosessie gevonden."},{status:404});
    const canonical=await prisma.diagnosticSession.findUnique({where:{id:existing.prisma_session_id},include:{deviceUnit:true,tests:true,appTests:true}});
    if(!canonical) return NextResponse.json({ok:false,error:"Diagnosesessie niet gevonden."},{status:404});
    const report=diagnosticReport(canonical.tests,canonical.deviceUnit.batteryHealth,canonical.appTests);
    if(canonical.status!=="completed" || !report.canFinalize || canonical.finalScore!==report.score || canonical.finalGrade!==report.grade || canonical.deviceUnit.securityGrade==="FAIL") return NextResponse.json({ok:false,error:"Rond eerst alle controles af en bevestig de beoordeling op de sessiepagina."},{status:409});
    const payload = {
      status:"completed",
      result:{...(typeof existing.result==="object" && existing.result!==null && !Array.isArray(existing.result)?existing.result:{}),webProtocol:1,webResults:report.results},
      completed_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("diagnostics_sessions")
      .update(payload)
      .eq("session_id", sessionId)
      .select("*")
      .single();

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      session: data,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: "Server error",
      },
      {
        status: 500,
      }
    );
  }
}


