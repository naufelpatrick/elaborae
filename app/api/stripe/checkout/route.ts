import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCheckoutSession } from "@/lib/billing";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

const CheckoutSchema = z.object({ credits: z.union([z.literal(30), z.literal(60)]) });
const DEFAULT_SUPABASE_URL = "https://pfropbkmeedoogzboitg.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6TNmhZ4sZy-NluoO5qCe3A_wjGf2adN";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
}

async function getAuthenticatedUser(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "GET",
    cache: "no-store",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.warn("[Stripe Checkout Auth]", response.status, detail.slice(0, 240));
    return null;
  }

  const user = await response.json() as { id?: string; email?: string };
  return user.id && user.email ? { id: user.id, email: user.email } : null;
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

    const user = await getAuthenticatedUser(token);
    if (!user) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Sua sessão expirou. Entre novamente no Elaborae." },
        { status: 401 },
      );
    }

    const { credits } = CheckoutSchema.parse(await request.json());
    const origin = request.nextUrl.origin;
    const session = await createCheckoutSession({
      userId: user.id,
      email: user.email,
      credits,
      origin,
    });

    return NextResponse.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error("[Stripe Checkout]", error);
    const message = error instanceof Error && error.message === "STRIPE_NOT_CONFIGURED"
      ? "O pagamento ainda não está configurado neste ambiente."
      : "Não foi possível iniciar o pagamento agora.";
    return NextResponse.json(
      { error: "CHECKOUT_FAILED", message },
      { status: 400 },
    );
  }
}
