import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
}

export async function GET(request: NextRequest) {
  const token = bearerToken(request);
  if (!token || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient(token);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const userId = authData.user.id;
  const [{ data: wallet, error: walletError }, { data: purchases, error: purchasesError }] = await Promise.all([
    supabase
      .from("user_credit_wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("stripe_credit_purchases")
      .select("credits")
      .eq("user_id", userId)
      .eq("status", "paid"),
  ]);

  if (walletError || purchasesError) {
    console.error("[Billing Usage]", walletError || purchasesError);
    return NextResponse.json({ error: "BILLING_USAGE_FAILED" }, { status: 500 });
  }

  const purchased = (purchases || []).reduce((sum, item) => sum + Number(item.credits || 0), 0);
  const remaining = Number(wallet?.balance || 0);
  const used = Math.max(0, purchased - remaining);

  return NextResponse.json({
    plan: purchased > 0 ? "paid" : "free",
    purchased,
    used,
    remaining,
  });
}
