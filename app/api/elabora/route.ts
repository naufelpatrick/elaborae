import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CofreSessionSchema } from "@/lib/cofre";
import { runElaboraEngine } from "@/lib/elabora-ai";
import { checkSafety } from "@/lib/safety";
import { getSupabaseAdminClient } from "@/lib/billing";
import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

const FREE_LIMIT = Math.max(1, Number(process.env.FREE_CONSULTATIONS_LIMIT || 3));
const DAILY_FREE_LIMIT = Math.max(1, Number(process.env.DAILY_FREE_CONSULTATIONS_LIMIT || 100));

const RequestSchema = z.object({
  session: CofreSessionSchema,
  forceCompose: z.boolean().optional().default(false),
  consultationId: z.string().min(8).max(128),
});

type SupabaseServer = ReturnType<typeof getSupabaseServerClient>;
type ProductEvent = "engine_request" | "consultation_completed" | "safety_block";
type DailyCapacity = { allowed: boolean; used: number; limit: number; usageDay: string | null };

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

async function totalConsultationsForUser(supabase: SupabaseServer, userId: string) {
  const { count, error } = await supabase
    .from("consultation_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count || 0;
}

async function paidBalanceForUser(supabase: SupabaseServer, userId: string) {
  const { data, error } = await supabase
    .from("user_credit_wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.balance || 0);
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

async function reserveDailyFreeSlot(supabase: SupabaseServer, consultationId: string): Promise<DailyCapacity> {
  const { data, error } = await supabase.rpc("reserve_daily_free_consultation_slot", {
    p_consultation_id: consultationId,
    p_daily_limit: DAILY_FREE_LIMIT,
  }).single();
  if (error) throw error;
  const row = data as { allowed?: boolean; used?: number; daily_limit?: number; usage_day?: string } | null;
  return {
    allowed: Boolean(row?.allowed),
    used: Number(row?.used || 0),
    limit: Number(row?.daily_limit || DAILY_FREE_LIMIT),
    usageDay: row?.usage_day || null,
  };
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

function usagePayload(total: number, paidBalance: number, requests?: number) {
  const freeUsed = Math.min(total, FREE_LIMIT);
  return {
    used: freeUsed,
    limit: FREE_LIMIT,
    paidBalance,
    limitReached: freeUsed >= FREE_LIMIT && paidBalance <= 0,
    ...(typeof requests === "number" ? { requests } : {}),
  };
}

export async function GET(request: NextRequest) {
  const hasApiKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const model = process.env.OPENROUTER_MODEL?.trim() || null;
  const auth = await authenticatedContext(request);

  let total = 0;
  let paidBalance = 0;
  let requests = 0;
  if (auth) {
    try {
      total = await totalConsultationsForUser(auth.supabase, auth.user.id);
      paidBalance = await paidBalanceForUser(auth.supabase, auth.user.id);
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
    usage: usagePayload(total, paidBalance, requests),
    dailyFree: { limit: DAILY_FREE_LIMIT, timezone: "America/Sao_Paulo" },
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

    const totalBefore = await totalConsultationsForUser(auth.supabase, auth.user.id);
    let paidBalance = await paidBalanceForUser(auth.supabase, auth.user.id);

    if (!existing && totalBefore >= FREE_LIMIT && paidBalance <= 0) {
      return NextResponse.json(
        {
          error: "NO_CONSULTATIONS_AVAILABLE",
          message: "Você já utilizou suas consultas gratuitas. Adquira um pacote para continuar.",
          usage: usagePayload(totalBefore, paidBalance),
        },
        { status: 429 },
      );
    }

    const safety = checkSafety(body.session);
    if (safety.blocked) {
      await recordEvent(auth.supabase, auth.user.id, body.consultationId, "safety_block", safety.category);
      return NextResponse.json({
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
        usage: usagePayload(totalBefore, paidBalance),
      });
    }

    if (!existing && totalBefore < FREE_LIMIT) {
      const dailyCapacity = await reserveDailyFreeSlot(auth.supabase, body.consultationId);
      if (!dailyCapacity.allowed) {
        return NextResponse.json(
          {
            error: "DAILY_FREE_LIMIT_REACHED",
            message: "A capacidade gratuita de hoje foi atingida. Novas consultas gratuitas serão liberadas amanhã.",
            usage: usagePayload(totalBefore, paidBalance),
            daily: {
              used: dailyCapacity.used,
              limit: dailyCapacity.limit,
              limitReached: true,
              usageDay: dailyCapacity.usageDay,
              timezone: "America/Sao_Paulo",
            },
          },
          { status: 429 },
        );
      }
    }

    await recordEvent(auth.supabase, auth.user.id, body.consultationId, "engine_request");
    const result = await runElaboraEngine(body.session, body.forceCompose);
    const completed = Boolean(result.prompt);
    let totalAfter = totalBefore;

    if (completed && !existing) {
      const admin = getSupabaseAdminClient();
      const { data, error } = await admin.rpc("complete_consultation_with_entitlement", {
        p_user_id: auth.user.id,
        p_consultation_id: body.consultationId,
        p_free_limit: FREE_LIMIT,
      }).single();
      if (error) throw error;

      const completion = data as { inserted?: boolean; free_used?: number; paid_balance?: number } | null;
      totalAfter = totalBefore + (completion?.inserted ? 1 : 0);
      paidBalance = Number(completion?.paid_balance ?? paidBalance);
      await recordEvent(auth.supabase, auth.user.id, body.consultationId, "consultation_completed", result.source);
    }

    return NextResponse.json(
      { ...result, usage: usagePayload(totalAfter, paidBalance) },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Elabora API]", error);
    if (message.includes("NO_PAID_CREDITS")) {
      return NextResponse.json(
        { error: "NO_CONSULTATIONS_AVAILABLE", message: "Seu saldo de consultas acabou. Adquira um novo pacote para continuar." },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: "Não foi possível processar esta etapa." }, { status: 400 });
  }
}
