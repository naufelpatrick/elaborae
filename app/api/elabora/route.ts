import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CofreSessionSchema } from "@/lib/cofre";
import { runElaboraEngine } from "@/lib/elabora-ai";

export const runtime = "nodejs";

const FREE_USED_COOKIE = "elabora_free_used";
const CONSULTATION_COOKIE = "elabora_consultation";

const RequestSchema = z.object({
  session: CofreSessionSchema,
  forceCompose: z.boolean().optional().default(false),
  consultationId: z.string().min(8).max(128),
});

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function GET(request: NextRequest) {
  const hasApiKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const model = process.env.OPENROUTER_MODEL?.trim() || null;
  const freeUsed = request.cookies.get(FREE_USED_COOKIE)?.value === "1";

  return NextResponse.json({
    ok: hasApiKey && Boolean(model),
    openrouter: {
      hasApiKey,
      hasModel: Boolean(model),
      model,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    },
    usage: { freeUsed },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = RequestSchema.parse(await request.json());
    const freeUsed = request.cookies.get(FREE_USED_COOKIE)?.value === "1";
    const activeConsultation = request.cookies.get(CONSULTATION_COOKIE)?.value;

    if (freeUsed && activeConsultation !== body.consultationId) {
      return NextResponse.json(
        {
          error: "FREE_SESSION_LIMIT_REACHED",
          message: "Você já utilizou sua consulta gratuita nesta sessão do navegador.",
          usage: { freeLimitReached: true },
        },
        { status: 429 },
      );
    }

    const result = await runElaboraEngine(body.session, body.forceCompose);
    const completed = Boolean(result.prompt);
    const response = NextResponse.json(
      { ...result, usage: { freeLimitReached: freeUsed || completed } },
      { status: 200 },
    );

    response.cookies.set(CONSULTATION_COOKIE, body.consultationId, sessionCookieOptions);
    if (completed) {
      response.cookies.set(FREE_USED_COOKIE, "1", sessionCookieOptions);
    }

    return response;
  } catch (error) {
    console.error("[Elabora API]", error);
    return NextResponse.json({ error: "Não foi possível processar esta etapa." }, { status: 400 });
  }
}
