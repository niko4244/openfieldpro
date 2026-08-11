// Shared customer message templates. Rendering, variable extraction, and
// validation live here so the web editor, the API, and tests agree on what a
// template may reference. Templates use Mustache-style syntax: {{variable}}
// substitution and {{#name}}…{{/name}} sections that render only when the
// variable is truthy. Unknown variables render empty; emails are plain text,
// so values are never HTML-escaped.

export type TemplateVariables = Record<string, string | number | null | undefined>;

type TemplateToken =
  | { type: "text"; text: string }
  | { type: "var"; name: string }
  | { type: "open"; name: string }
  | { type: "close"; name: string };

const TOKEN_RE = /\{\{([#/]?)([A-Za-z0-9_.]+)\}\}/g;

function tokenize(template: string): TemplateToken[] {
  const tokens: TemplateToken[] = [];
  let cursor = 0;
  for (const match of template.matchAll(TOKEN_RE)) {
    if (match.index !== undefined && match.index > cursor) {
      tokens.push({ type: "text", text: template.slice(cursor, match.index) });
    }
    const prefix = match[1];
    const name = match[2];
    if (prefix === "#") tokens.push({ type: "open", name });
    else if (prefix === "/") tokens.push({ type: "close", name });
    else tokens.push({ type: "var", name });
    cursor = (match.index ?? 0) + match[0].length;
  }
  if (cursor < template.length) tokens.push({ type: "text", text: template.slice(cursor) });
  return tokens;
}

function renderTokens(tokens: TemplateToken[], variables: TemplateVariables, start: number): { output: string; next: number } {
  let output = "";
  let index = start;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token.type === "text") {
      output += token.text;
      index += 1;
    } else if (token.type === "var") {
      const value = variables[token.name];
      output += value == null ? "" : String(value);
      index += 1;
    } else if (token.type === "open") {
      const inner = renderTokens(tokens, variables, index + 1);
      if (variables[token.name]) output += inner.output;
      index = inner.next;
    } else {
      return { output, next: index + 1 };
    }
  }
  return { output, next: index };
}

export function renderMessageTemplate(template: string, variables: TemplateVariables): string {
  return renderTokens(tokenize(template), variables, 0).output;
}

/** Unique variable names referenced by the template, in first-use order. */
export function extractTemplateVariables(template: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of template.matchAll(TOKEN_RE)) {
    const name = match[2];
    if (match[1] === "/") continue;
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

export const MESSAGE_TEMPLATE_KINDS = ["invoice", "estimate", "portal_link", "review_request"] as const;
export type MessageTemplateKind = (typeof MESSAGE_TEMPLATE_KINDS)[number];

export const MESSAGE_TEMPLATE_VARIABLES: Record<MessageTemplateKind, string[]> = {
  invoice: ["companyName", "customerName", "invoiceNumber", "invoiceTotal", "balance", "dueDate"],
  estimate: ["companyName", "customerName", "estimateNumber", "estimateTotal", "optionCount", "optionLabels", "expiresAt"],
  portal_link: ["companyName", "customerName", "portalLink", "portalExpiresAt"],
  review_request: ["companyName"],
};

/** Variables a template must use to be operationally useful. */
export const MESSAGE_TEMPLATE_REQUIRED_VARIABLES: Record<MessageTemplateKind, string[]> = {
  invoice: ["invoiceNumber"],
  estimate: ["estimateNumber"],
  portal_link: ["portalLink"],
  review_request: [],
};

export interface TemplateValidation {
  /** Variables referenced but not defined for this template kind. */
  unknown: string[];
  /** Variables this kind must reference but the template does not use. */
  missingRequired: string[];
}

export function validateMessageTemplate(template: string, kind: MessageTemplateKind): TemplateValidation {
  const known = new Set(MESSAGE_TEMPLATE_VARIABLES[kind]);
  const used = extractTemplateVariables(template);
  return {
    unknown: used.filter((name) => !known.has(name)),
    missingRequired: MESSAGE_TEMPLATE_REQUIRED_VARIABLES[kind].filter((name) => !used.includes(name)),
  };
}

/** Sample variables used by the settings live preview for a template kind. */
export function messageTemplateSampleVariables(kind: MessageTemplateKind, companyName: string): Record<string, string> {
  const common = { companyName, customerName: "Jordan Lee" };
  switch (kind) {
    case "invoice":
      return { ...common, invoiceNumber: "INV-1005", invoiceTotal: "$522.00", balance: "$443.00", dueDate: "Sep 1, 2026" };
    case "estimate":
      return { ...common, estimateNumber: "EST-1005", estimateTotal: "$200.00", optionCount: "3", optionLabels: "Good, Better, Best", expiresAt: "Sep 10, 2026" };
    case "portal_link":
      return { ...common, portalLink: "https://portal.example.test/p/pl_demo-token-0001", portalExpiresAt: "Sep 10, 2026" };
    case "review_request":
      return { companyName };
  }
}
