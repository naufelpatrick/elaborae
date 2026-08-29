import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CofreSessionSchema } from "@/lib/cofre";
import { runElaboraEngine } from "@/lib/elabora-ai";
import { checkSafety } from "@/lib/safety";
import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

const FREE_LIMIT = Math.max(1, Number(process.env.FREE_CONSULTATIONS_LIMIT || 3));

const RequestSchema = z.object({
  session: CofreSessionSchema,
  forceCompose: z.boolean().optional().default(false),
  consultationId: z.string().min(8).max(128),
});

type SupabaseServer = ReturnType<typeof getSupabaseServerClient>;
type ProductEvent = "engine_request" | "consultation_completed" | "safety_block";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
}

async function authenticatedContext(request: NextRequest) {
  const token = bearerToken(request);
  if (!token || !isSupabaseConfigured()) return null;

  const supabase = getSupabaseServerClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  return { token, supabase, user: data.user };
}

async function usageForUser(supabase: SupabaseServer, userId: string) {
  const { count, error } = await supabase
    .from("consultation_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw error;
  return count || 0;
}

async function requestCountForUser(supabase: SupabaseServer, userId: string) {
  const { count, error } = await supabase
    .from("product_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "engine_request");

  if (error) throw error;
  return count || 0;
}

async function recordEvent(
  supabase: SupabaseServer,
  userId: string,
  consultationId: string,
  eventType: ProductEvent,
  source?: string | null,
) {
  const { error } = await supabase.from("product_events").insert({
    user_id: userId,
    consultation_id: consultationId,
    event_type: eventType,
    source: source || null,
  });

  if (error) console.warn("[Elabora Telemetry]", eventType, error.message);
}

export async function GET(request: NextRequest) {
  const hasApiKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const model = process.env.OPENROUTER_MODEL?.trim() || null;
  const auth = await authenticatedContext(request);

  let used = 0;
  let requests = 0;
  if (auth) {
    try {
      used = await usageForUser(auth.supabase, auth.user.id);
    } catch (error) {
      console.error("[Elabora Usage]", error);
    }
    try {
      requests = await requestCountForUser(auth.supabase, auth.user.id);
    } catch (error) {
      console.warn("[Elabora Telemetry] request count unavailable", error);
    }
  }

  return NextResponse.json({
    ok: hasApiKey && Boolean(model) && isSupabaseConfigured(),
    openrouter: {
      hasApiKey,
      hasModel: Boolean(model),
      model,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    },
    auth: {
      configured: isSupabaseConfigured(),
      authenticated: Boolean(auth),
      email: auth?.user.email || null,
    },
    usage: {
      used,
      limit: FREE_LIMIT,
      limitReached: used >= FREE_LIMIT,
      requests,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticatedContext(request);
    if (!auth) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Entre com seu e-mail para continuar." },
        { status: 401 },
      );
    }

    const body = RequestSchema.parse(await request.json());

    const { data: existing, error: existingError } = await auth.supabase
      .from("consultation_usage")
      .select("consultation_id")
      .eq("user_id", auth.user.id)
      .eq("consultation_id", body.consultationId)
      .maybeSingle();

    if (existingError) throw existingError;

    const usedBefore = await usageForUser(auth.supabase, auth.user.id);
    if (!existing && usedBefore >= FREE_LIMIT) {
      return NextResponse.json(
        {
          error: "FREE_ACCOUNT_LIMIT_REACHED",
          message: "Você já utilizou o limite gratuito da sua conta.",
          usage: { used: usedBefore, limit: FREE_LIMIT, limitReached: true },
        },
        { status: 429 },
      );
    }

    const safety = checkSafety(body.session);
    if (safety.blocked) {
      await recordEvent(auth.supabase, auth.user.id, body.consultationId, "safety_block", safety.category);
      return NextResponse.json(
        {
          source: "fallback",
          question: {
            dimension: "restricoes",
            eyebrow: "Uso responsável",
            text: "Esse pedido precisa ser reformulado para uma finalidade segura.",
            hint: safety.message,
            options: ["Quero abordar prevenção", "Quero uma análise educacional", "Vou reformular o pedido"],
            type: "conflict_resolution",
          },
          prompt: null,
          assumptions: [],
          safetyBlocked: true,
          usage: { used: usedBefore, limit: FREE_LIMIT, limitReached: usedBefore >= FREE_LIMIT },
        },
        { status: 200 },
      );
    }

    await recordEvent(auth.supabase, auth.user.id, body.consultationId, "engine_request");

    const result = await runElaboraEngine(body.session, body.forceCompose);
    const completed = Boolean(result.prompt);
    let usedAfter = usedBefore;

    if (completed && !existing) {
      const { error: insertError } = await auth.supabase
        .from("consultation_usage")
        .insert({ user_id: auth.user.id, consultation_id: body.consultationId });

      if (insertError && insertError.code !== "23505") throw insertError;
      usedAfter = Math.min(FREE_LIMIT, usedBefore + 1);
      await recordEvent(auth.supabase, auth.user.id, body.consultationId, "consultation_completed", result.source);
    }

    return NextResponse.json(
      {
        ...result,
        usage: {
          used: usedAfter,
          limit: FREE_LIMIT,
          limitReached: usedAfter >= FREE_LIMIT,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Elabora API]", error);
    return NextResponse.json({ error: "Não foi possível processar esta etapa." }, { status: 400 });
  }
}
