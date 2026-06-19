import { NextResponse } from "next/server";
import { runDatabaseHealthCheck } from "@/lib/storage/dbHealth";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await runDatabaseHealthCheck();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
