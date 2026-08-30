import type { Metadata } from "next";
import ResponsibleUseGate from "./responsible-use-gate";
import CreatorPhotoRepair from "./creator-photo";
import DailyCapNotice from "./daily-cap-notice";
import BillingPanel from "./billing-panel";
import PaidPlanIndicator from "./paid-plan-indicator";
import "./globals.css";
import "./limit.css";
import "./responsible-use.css";
import "./creator.css";
import "./billing.css";

export const metadata: Metadata = {
  title: "Elaborae — transforme ideias em prompts",
  description: "Transforme uma ideia em um prompt mais claro por meio de uma conversa adaptativa que identifica o que realmente faz diferença.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <BillingPanel />
        <PaidPlanIndicator />
        <CreatorPhotoRepair />
        <DailyCapNotice />
        <ResponsibleUseGate />
      </body>
    </html>
  );
}
