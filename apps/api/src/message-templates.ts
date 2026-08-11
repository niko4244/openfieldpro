// Outbound customer message rendering. Templates use Mustache syntax:
// {{variable}} substitution and {{#name}}…{{/name}} sections that render only
// when the variable is a non-empty value. Unknown variables render empty.
//
// Emails are plain text (not HTML), so Mustache's HTML escaping is disabled —
// otherwise URLs in variables like the portal link would be mangled.
import Mustache from "mustache";

Mustache.escape = (value: string) => value;

export type TemplateVariables = Record<string, string | number | null | undefined>;

export function renderMessageTemplate(template: string, variables: TemplateVariables): string {
  return Mustache.render(template, variables);
}
