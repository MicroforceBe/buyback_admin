// buyback-admin/app/api/buyback/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[buyback-admin] SUPABASE env ontbreekt: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
}

function supa() {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }
  })
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const modelName = (url.searchParams.get('model') || '').trim()

    const sb = supa()

    if (!modelName) {
      // Geen model → lijst met alle modelnamen (voor catalog-build)
      const { data, error } = await sb
        .from('buyback_models')
        .select('model')
        .order('model', { ascending: true })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      const models = (data || []).map(r => r.model).filter(Boolean)
      return NextResponse.json({ data: { models } }, {
        headers: { 'Cache-Control': 'no-store' }
      })
    }

    // 1) Model-rij ophalen
    const { data: modelRow, error: mErr } = await sb
      .from('buyback_models')
      .select('id, model, brand, category, submodel, image_url')
      .eq('model', modelName)
      .maybeSingle()

    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 500 })
    }
    if (!modelRow) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }

    // 2) Capaciteiten bij model
    const { data: caps, error: cErr } = await sb
      .from('buyback_capacities')
      .select('capacity_gb, price_cents, image_url, variant')
      .eq('model_id', modelRow.id)
      .order('variant', { ascending: true, nullsFirst: true })
      .order('capacity_gb', { ascending: true })

    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 })
    }

    // 3) Nieuwe multipliers ophalen via eigen admin-endpoint
    //    (zorg dat je /app/api/buyback/multipliers/route.ts live staat en 200 geeft)
    //    We gebruiken dezelfde host zodat auth/omgeving klopt.
    const base = `${url.protocol}//${url.host}`
    const multRes = await fetch(
      `${base}/api/buyback/multipliers?category=${encodeURIComponent(modelRow.category || '')}&model=${encodeURIComponent(modelRow.model)}`,
      { cache: 'no-store' }
    )
    if (!multRes.ok) {
      // Val nog niet om: toon tenminste de basisgegevens
      console.warn('[buyback-admin] multipliers endpoint gaf geen 200:', multRes.status)
    }
    const multJson = multRes.ok ? await multRes.json().catch(() => null) : null

    // 4) Payload samenstellen in het exact verwachte shape
    const payload = {
      model: modelRow.model,
      brand: modelRow.brand,
      category: modelRow.category,
      submodel: modelRow.submodel,
      image_url: modelRow.image_url,
      capacities: (caps || []).map(c => ({
        capacity_gb: c.capacity_gb,
        price_cents: c.price_cents,
        image_url: c.image_url,
        variant: c.variant
      })),
      // Belangrijk: 'questions' komt uit multipliers-beheer (category-set / custom-set)
      questions: multJson?.questions ?? {},
      // Optioneel: tips of extra teksten vanuit multipliers-endpoint
      tips: multJson?.tips ?? undefined,
      // Indien je een expliciete order meegeeft
      question_order: multJson?.question_order ?? undefined
    }

    return NextResponse.json({ data: payload }, {
      headers: {
        // mag kort gecachet worden door edge/CDN, maar geen stale data lokaal
        'Cache-Control': 's-maxage=60, stale-while-revalidate=600'
      }
    })

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
