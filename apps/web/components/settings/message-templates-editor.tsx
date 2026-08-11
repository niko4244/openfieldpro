"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  MESSAGE_TEMPLATE_REQUIRED_VARIABLES,
  MESSAGE_TEMPLATE_VARIABLES,
  messageTemplateSampleVariables,
  renderMessageTemplate,
  validateMessageTemplate,
  type MessageTemplateKind,
} from "@ofp/shared";
import type { BusinessSettingsDTO } from "@/lib/api";

interface EditorProps {
  settings: BusinessSettingsDTO;
  updateSettings: (next: BusinessSettingsDTO) => void;
  companyName: string;
}

const KINDS: Array<{
  kind: MessageTemplateKind;
  title: string;
  description: string;
  subjectField?: keyof BusinessSettingsDTO["messages"];
  bodyField: keyof BusinessSettingsDTO["messages"];
}> = [
  {
    kind: "invoice",
    title: "Invoice email",
    description: "Sent when you email an invoice to a customer.",
    subjectField: "invoiceEmailSubject",
    bodyField: "invoiceEmailBody",
  },
  {
    kind: "estimate",
    title: "Estimate email",
    description: "Sent when you email an estimate to a customer.",
    subjectField: "estimateEmailSubject",
    bodyField: "estimateEmailBody",
  },
  {
    kind: "portal_link",
    title: "Portal link email",
    description: "Sent when you email a customer their secure portal link.",
    subjectField: "portalLinkSubject",
    bodyField: "portalLinkBody",
  },
  {
    kind: "review_request",
    title: "Review request message",
    description: "Sent when you ask a customer to leave a review.",
    bodyField: "reviewRequestBody",
  },
];

function TemplateCard({
  kind,
  title,
  description,
  subjectField,
  bodyField,
  messages,
  onMessagesChange,
  companyName,
}: {
  kind: MessageTemplateKind;
  title: string;
  description: string;
  subjectField?: keyof BusinessSettingsDTO["messages"];
  bodyField: keyof BusinessSettingsDTO["messages"];
  messages: BusinessSettingsDTO["messages"];
  onMessagesChange: (next: BusinessSettingsDTO["messages"]) => void;
  companyName: string;
}) {
  const subject = subjectField ? (messages[subjectField] ?? "") : "";
  const body = messages[bodyField] ?? "";

  // Required-variable coverage is per kind (subject or body may carry it), so
  // the combined template is validated once; a typo anywhere is still a hard
  // save error via the same rule on the API side.
  const validation = useMemo(() => validateMessageTemplate(`${subject}\n${body}`, kind), [subject, body, kind]);
  const sample = useMemo(() => messageTemplateSampleVariables(kind, companyName), [kind, companyName]);
  const available = MESSAGE_TEMPLATE_VARIABLES[kind];

  const unknown = validation.unknown;
  const missingRequired = validation.missingRequired;

  function appendVariable(name: string) {
    const current = body;
    const next = `${current}${current && !current.endsWith("\n") ? "\n" : ""}{{${name}}}`;
    onMessagesChange({ ...messages, [bodyField]: next });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-fg-muted">{description}</p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {subjectField ? (
          <label className="grid gap-1.5 text-sm text-fg-muted">
            Subject
            <Input
              value={subject}
              onChange={(event) => onMessagesChange({ ...messages, [subjectField!]: event.target.value })}
              placeholder={`e.g. ${available[0]} placeholder`}
            />
          </label>
        ) : null}
        <label className="grid gap-1.5 text-sm text-fg-muted">
          Message
          <textarea
            value={body}
            onChange={(event) => onMessagesChange({ ...messages, [bodyField]: event.target.value })}
            rows={6}
            className="rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          />
        </label>

        {unknown.length > 0 ? (
          <div className="rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red">
            Unknown variable{unknown.length > 1 ? "s" : ""}: {unknown.join(", ")}. Check the list below.
          </div>
        ) : null}
        {unknown.length === 0 && missingRequired.length > 0 ? (
          <div className="rounded-lg border border-yellow/40 bg-yellow/10 p-3 text-sm text-fg">
            Warning: this template never references {missingRequired.join(", ")} — the customer email may not include it.
          </div>
        ) : null}

        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Available variables</p>
          <div className="flex flex-wrap gap-1.5">
            {available.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => appendVariable(name)}
                title={`Insert {{${name}}} at the end of the message`}
                className="rounded-full border border-border bg-surface-100 px-2 py-0.5 font-mono text-xs text-accent hover:border-accent/60 hover:bg-accent/10"
              >
                {`{{${name}}}`}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Live preview</p>
          <div className="rounded-lg border border-border bg-surface-100 p-3">
            <p className="text-sm font-semibold text-fg">{renderMessageTemplate(subject, sample)}</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-fg">{renderMessageTemplate(body, sample)}</pre>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MessageTemplatesEditor({ settings, updateSettings, companyName }: EditorProps) {
  const messages = settings.messages;
  const updateMessages = (next: BusinessSettingsDTO["messages"]) => {
    updateSettings({ ...settings, messages: next });
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm text-fg-muted">
        Emails are plain text. Wrap a variable name in double braces — <code>{"{{variable}}"}</code> — to insert live
        values. Unknown variables block saving; variables a template should use are highlighted when missing.
      </p>
      {KINDS.map((card) => (
        <TemplateCard
          key={card.kind}
          kind={card.kind}
          title={card.title}
          description={card.description}
          subjectField={card.subjectField}
          bodyField={card.bodyField}
          messages={messages}
          onMessagesChange={updateMessages}
          companyName={companyName}
        />
      ))}
    </div>
  );
}
