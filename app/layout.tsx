import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elaborae — transforme ideias em prompts",
  description: "Elabore ideias com clareza usando uma entrevista guiada pelo Framework COFRE.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
