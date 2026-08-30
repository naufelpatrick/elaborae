import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/billing";
import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

const ConfirmSchema = z.object({ sessionId: z.string().startsWith("cs_") });

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
}

export async function POST(request: NextRequest) {
  try {
    const token = bearerToken(request);
    if (!token || !isSupabaseConfigured()) {
      return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const supabase = getSupabaseServerClient(token);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const { sessionId } = ConfirmSchema.parse(await request.json());
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) throw new Error("STRIPE_NOT_CONFIGURED");

    const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      cache: "no-store",
    });
    const session = await stripeResponse.json() as {
      id?: string;
      payment_status?: string;
      payment_intent?: string | null;
      amount_total?: number | null;
      currency?: string | null;
      client_reference_id?: string | null;
      metadata?: Record<string, string>;
      error?: { message?: string };
    };

    if (!stripeResponse.ok || !session.id) {
      throw new Error(session.error?.message || "STRIPE_SESSION_LOOKUP_FAILED");
    }

    const userId = session.client_reference_id || session.metadata?.user_id;
    const credits = Number(session.metadata?.credits || 0);
    const priceId = session.metadata?.price_id || "";

    if (session.payment_status !== "paid" || userId !== authData.user.id || ![30, 60].includes(credits) || !priceId) {
      return NextResponse.json({ error: "PAYMENT_NOT_CONFIRMED" }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc("apply_stripe_credit_purchase", {
      p_user_id: userId,
      p_checkout_session_id: session.id,
      p_payment_intent_id: session.payment_intent || "",
      p_price_id: priceId,
      p_credits: credits,
      p_amount_total: session.amount_total || 0,
      p_currency: session.currency || "brl",
    });
    if (error) throw error;

    return NextResponse.json({ ok: true, credits, balance: Number(data || 0) });
  } catch (error) {
    console.error("[Stripe Confirm]", error);
    return NextResponse.json({ error: "CONFIRM_FAILED" }, { status: 400 });
  }
}
