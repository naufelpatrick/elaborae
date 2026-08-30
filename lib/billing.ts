import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const STRIPE_SANDBOX_PRICES = {
  30: "price_1UACssGuXqFqFCLPHPex4xTe",
  60: "price_1UACt4GuXqFqFCLPLM9oEBbc",
} as const;

const STRIPE_LIVE_PRICES = {
  30: "price_1UAD9iGkbNWE4GI8SCmkfmpI",
  60: "price_1UAD9tGkbNWE4GI8B92ErgZs",
} as const;

const isVercelProduction = process.env.VERCEL_ENV === "production";

export const STRIPE_PRICES = isVercelProduction
  ? STRIPE_LIVE_PRICES
  : STRIPE_SANDBOX_PRICES;

export type CreditPack = keyof typeof STRIPE_PRICES;

export function isBillingConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
    process.env.STRIPE_WEBHOOK_SECRET?.trim() &&
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export async function createCheckoutSession(input: {
  userId: string;
  email: string;
  credits: CreditPack;
  origin: string;
}) {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("STRIPE_NOT_CONFIGURED");

  const price = STRIPE_PRICES[input.credits];
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", `${input.origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`);
  body.set("cancel_url", `${input.origin}/?payment=cancelled`);
  body.set("client_reference_id", input.userId);
  body.set("customer_email", input.email);
  body.set("line_items[0][price]", price);
  body.set("line_items[0][quantity]", "1");
  body.set("metadata[user_id]", input.userId);
  body.set("metadata[credits]", String(input.credits));
  body.set("metadata[price_id]", price);
  body.set("payment_intent_data[metadata][user_id]", input.userId);
  body.set("payment_intent_data[metadata][credits]", String(input.credits));

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json() as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !data.url) {
    throw new Error(data.error?.message || "STRIPE_CHECKOUT_FAILED");
  }
  return data;
}

export function verifyStripeWebhook(payload: string, signatureHeader: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !signatureHeader) return false;

  const parts = signatureHeader.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  return signatures.some((signature) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  });
}

export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "https://pfropbkmeedoogzboitg.supabase.co";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRole) throw new Error("SUPABASE_SERVICE_ROLE_NOT_CONFIGURED");
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
