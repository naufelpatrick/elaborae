import type { CofreSession } from "./cofre";

export type SafetyCategory =
  | "self_harm"
  | "weapons_or_explosives"
  | "cyber_abuse"
  | "fraud_or_identity_theft"
  | "sexual_exploitation_of_minors"
  | "targeted_violence";

export type SafetyCheck =
  | { blocked: false }
  | { blocked: true; category: SafetyCategory; message: string };

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sessionText(session: CofreSession) {
  return normalize([
    session.originalRequest,
    ...session.answers.flatMap((item) => [item.question, item.answer]),
  ].join("\n"));
}

function has(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

const protectiveContext = [
  /\b(preven|combater|denunciar|conscient|educa|pesquisa|analis|noticia|jornal|politica publica|seguranca|defensiv|pentest autorizado|ctf|laboratorio)\w*/,
];

export function checkSafety(session: CofreSession): SafetyCheck {
  const text = sessionText(session);
  const protective = has(text, protectiveContext);

  if (has(text, [
    /\b(como|maneira|metodo|passo a passo|instrucoes?)\b.{0,60}\b(me matar|me suicidar|suicidio|tirar minha vida|kill myself)\b/,
    /\b(dose letal|lethal dose)\b.{0,50}\b(para mim|em mim|suicid|morrer|die)\b/,
  ])) {
    return { blocked: true, category: "self_harm", message: "Não posso ajudar a elaborar instruções para autoagressão ou suicídio. Posso ajudar a reformular o pedido para prevenção, acolhimento ou informação de segurança." };
  }

  if (has(text, [
    /\b(crianca|menor|adolescente|infantil|child|minor)\b.{0,80}\b(porn|sexo explicito|conteudo sexual|nudez sexual|sexual content)\b/,
    /\b(pornografia infantil|csam|child sexual abuse material)\b/,
  ]) && !protective) {
    return { blocked: true, category: "sexual_exploitation_of_minors", message: "Não posso ajudar a criar ou desenvolver conteúdo sexual envolvendo menores. Posso ajudar com prevenção, educação, denúncia ou políticas de proteção." };
  }

  if (has(text, [
    /\b(como fazer|como construir|como montar|como fabricar|receita|passo a passo)\b.{0,90}\b(bomba|explosiv|granada|arma caseira|veneno letal|molotov)\w*/,
    /\b(build|make|assemble)\b.{0,60}\b(bomb|explosive|weapon)\b/,
  ])) {
    return { blocked: true, category: "weapons_or_explosives", message: "Não posso ajudar a elaborar instruções operacionais para armas, explosivos ou outros meios de causar dano. Posso ajudar com segurança, prevenção ou contexto histórico e educacional." };
  }

  if (has(text, [
    /\b(crie|gere|escreva|monte|como fazer|automatize)\b.{0,80}\b(phishing|ransomware|malware|keylogger|roubar senha|roubar credenciais|capturar senha|invadir conta)\b/,
    /\b(bypass|burlar)\b.{0,50}\b(autenticacao|2fa|mfa|login|senha)\b/,
  ]) && !protective) {
    return { blocked: true, category: "cyber_abuse", message: "Não posso ajudar a elaborar instruções para roubo de credenciais, malware, invasão ou fraude digital. Posso ajudar com segurança defensiva, testes autorizados ou conscientização." };
  }

  if (has(text, [
    /\b(como|crie|monte|gere|ensine)\b.{0,80}\b(clonar cartao|falsificar documento|roubar identidade|fraudar pagamento|golpe para|lavar dinheiro)\b/,
  ])) {
    return { blocked: true, category: "fraud_or_identity_theft", message: "Não posso ajudar a elaborar instruções para fraude, falsificação ou roubo de identidade. Posso ajudar com prevenção, detecção de fraude ou educação." };
  }

  if (has(text, [
    /\b(como matar|planeje um ataque|plano para atacar|ameaca para matar|assassinar sem ser pego|kill without getting caught)\b/,
  ])) {
    return { blocked: true, category: "targeted_violence", message: "Não posso ajudar a planejar violência ou ameaças contra pessoas. Posso ajudar com prevenção de risco, segurança ou análise não operacional." };
  }

  return { blocked: false };
}
