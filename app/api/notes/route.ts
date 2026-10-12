import { NextRequest, NextResponse } from "next/server";

type Action = "list" | "create" | "update" | "delete" | "reorder";

function scriptUrl() {
  return process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL?.trim();
}

async function parseResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Apps Script 응답을 JSON으로 읽을 수 없습니다. 웹 앱 배포 URL과 액세스 권한을 확인해 주세요.");
  }
}

export async function GET() {
  const url = scriptUrl();
  if (!url) return NextResponse.json({ enabled: false, notes: [] });

  try {
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}action=list`, { cache: "no-store", redirect: "follow" });
    const payload = await parseResponse(response);
    if (!response.ok || payload.ok === false) throw new Error(String(payload.error ?? "Google 시트에서 메모를 불러오지 못했습니다."));
    return NextResponse.json({ ...payload, enabled: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google 시트 연결에 실패했습니다." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const url = scriptUrl();
  if (!url) return NextResponse.json({ error: "NEXT_PUBLIC_GOOGLE_SCRIPT_URL이 설정되지 않았습니다." }, { status: 503 });

  try {
    const body = await request.json() as { action?: Action } & Record<string, unknown>;
    if (!body.action || !["create", "update", "delete", "reorder"].includes(body.action)) {
      return NextResponse.json({ error: "지원하지 않는 메모 작업입니다." }, { status: 400 });
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "follow",
    });
    const payload = await parseResponse(response);
    if (!response.ok || payload.ok === false) throw new Error(String(payload.error ?? "Google 시트 작업을 완료하지 못했습니다."));
    return NextResponse.json({ ...payload, enabled: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google 시트 연결에 실패했습니다." }, { status: 502 });
  }
}
