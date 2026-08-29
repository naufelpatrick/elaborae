import type { Metadata } from "next";
import "./globals.css";
import "./limit.css";

export const metadata: Metadata = {
  title: "Elaborae — transforme ideias em prompts",
  description: "Elabore ideias com clareza usando uma entrevista guiada pelo Framework COFRE.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <div
          role="note"
          style={{
            padding: "10px 5vw 18px",
            textAlign: "center",
            color: "#71697c",
            fontSize: "11px",
            lineHeight: 1.5,
            background: "#f8f4ef",
          }}
        >
          O Elaborae auxilia na elaboração de prompts. Você é responsável por revisar, validar e usar o conteúdo gerado. · Elaborae | info@elaborae.com.br
        </div>
      </body>
    </html>
  );
}
