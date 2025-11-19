import { NextRequest, NextResponse } from "next/server";

function scAuthHeader() {
  const pub = process.env.SENDCLOUD_PUBLIC_KEY || "";
  const sec = process.env.SENDCLOUD_SECRET_KEY || "";
  const token = Buffer.from(`${pub}:${sec}`).toString("base64");
  return `Basic ${token}`;
}

export async function GET(req: NextRequest) {
  const parcelId = req.nextUrl.searchParams.get("parcel_id");
  if (!parcelId) {
    return new NextResponse("Missing parcel_id", { status: 400 });
  }

  const url = `https://panel.sendcloud.sc/api/v3/parcels/${encodeURIComponent(
    parcelId
  )}/documents/label`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: scAuthHeader(),
      Accept: "application/pdf",
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("[SENDCLOUD][PROXY_LABEL] failed:", resp.status, text);
    return new NextResponse("Failed to fetch label", { status: 502 });
  }

  const buffer = await resp.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=label.pdf",
    },
  });
}
