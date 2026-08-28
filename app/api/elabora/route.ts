import { NextResponse } from "next/server";
import { z } from "zod";
import { CofreSessionSchema } from "@/lib/cofre";
import { runElaboraEngine } from "@/lib/elabora-ai";

export const runtime = "nodejs";

const RequestSchema = z.object({
  session: CofreSessionSchema,
  forceCompose: z.boolean().optional().default(false),
});

export async function GET() {
  const hasApiKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const model = process.env.OPENROUTER_MODEL?.trim() || null;
  return NextResponse.json({
    ok: hasApiKey && Boolean(model),
    openrouter: {
      hasApiKey,
      hasModel: Boolean(model),
      model,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = RequestSchema.parse(await request.json());
    const result = await runElaboraEngine(body.session, body.forceCompose);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[Elabora API]", error);
    return NextResponse.json({ error: "Não foi possível processar esta etapa." }, { status: 400 });
  }
}
