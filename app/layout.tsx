import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PromptExIA — transforme ideias em prompts",
  description: "Entrevista adaptativa baseada no COFRE Engine para criar prompts universais.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
