// Web preview layer for durable field documents. The document *data*
// assembly lives in @ofp/shared so the API generates byte-identical PDFs for
// email attachments; this module only renders the branded HTML preview.
import {
  estimateDocumentData,
  invoiceDocumentData,
  renderFieldDocumentHtml,
  type DocumentCustomerLike,
  type DocumentEstimateLike,
  type DocumentInvoiceLike,
  type DocumentJobLike,
  type DocumentLineItemLike,
} from "@ofp/shared";
import type { OrgSettingsDTO } from "@/lib/api";

export function invoiceDocumentHtml({
  invoice,
  customer,
  job,
  lineItems,
  org,
}: {
  invoice: DocumentInvoiceLike & { total: number };
  customer: DocumentCustomerLike | null;
  job: DocumentJobLike | null;
  lineItems: DocumentLineItemLike[];
  org?: OrgSettingsDTO | null;
}) {
  return renderFieldDocumentHtml(invoiceDocumentData({ invoice, customer, job, lineItems, org }));
}

export function estimateDocumentHtml({
  estimate,
  customer,
  job,
  lineItems,
  org,
}: {
  estimate: DocumentEstimateLike & { total: number };
  customer: DocumentCustomerLike | null;
  job: DocumentJobLike | null;
  lineItems: DocumentLineItemLike[];
  org?: OrgSettingsDTO | null;
}) {
  return renderFieldDocumentHtml(estimateDocumentData({ estimate, customer, job, lineItems, org }));
}
