import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCheckoutSession, getSupabaseAdminClient } from "@/lib/billing";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

const CheckoutSchema = z.object({ credits: z.union([z.literal(30), z.literal(60)]) });

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
}

export async function POST(request: NextRequest) {
  try {
    const token = bearerToken(request);
    if (!token || !isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Sua sessão não foi reconhecida. Entre novamente no Elaborae." },
        { status: 401 },
      );
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user?.email) {
      console.warn("[Stripe Checkout Auth]", error?.message || "USER_EMAIL_MISSING");
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Sua sessão expirou. Entre novamente no Elaborae." },
        { status: 401 },
      );
    }

    const { credits } = CheckoutSchema.parse(await request.json());
    const origin = request.nextUrl.origin;
    const session = await createCheckoutSession({
      userId: data.user.id,
      email: data.user.email,
      credits,
      origin,
    });

    return NextResponse.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error("[Stripe Checkout]", error);
    return NextResponse.json(
      { error: "CHECKOUT_FAILED", message: "Não foi possível iniciar o pagamento agora." },
      { status: 400 },
    );
  }
}
