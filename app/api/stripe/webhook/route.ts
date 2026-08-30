import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient, verifyStripeWebhook } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeWebhook(payload, signature)) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  try {
    const event = JSON.parse(payload) as {
      type?: string;
      data?: {
        object?: {
          id?: string;
          payment_status?: string;
          payment_intent?: string | null;
          amount_total?: number | null;
          currency?: string | null;
          client_reference_id?: string | null;
          metadata?: Record<string, string>;
        };
      };
    };

    if (event.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true });
    }

    const session = event.data?.object;
    if (!session?.id || session.payment_status !== "paid") {
      return NextResponse.json({ received: true });
    }

    const userId = session.client_reference_id || session.metadata?.user_id;
    const credits = Number(session.metadata?.credits || 0);
    const priceId = session.metadata?.price_id || "";

    if (!userId || ![30, 60].includes(credits) || !priceId) {
      console.error("[Stripe Webhook] invalid checkout metadata", { sessionId: session.id });
      return NextResponse.json({ error: "INVALID_CHECKOUT_METADATA" }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.rpc("apply_stripe_credit_purchase", {
      p_user_id: userId,
      p_checkout_session_id: session.id,
      p_payment_intent_id: session.payment_intent || "",
      p_price_id: priceId,
      p_credits: credits,
      p_amount_total: session.amount_total || 0,
      p_currency: session.currency || "brl",
    });

    if (error) throw error;

    console.info("[Stripe Webhook] credits applied", {
      checkoutSessionId: session.id,
      userId,
      credits,
      balance: data,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Stripe Webhook]", error);
    return NextResponse.json({ error: "WEBHOOK_FAILED" }, { status: 500 });
  }
}
