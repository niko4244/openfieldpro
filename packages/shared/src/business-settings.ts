export type DocumentFormat = "email" | "envelope";
export type InvoiceDueTerm = "on_receipt" | "work_start" | "work_completion" | "net_days";
export type EstimateApprovalMode = "single_option" | "multiple_options";
export type DepositMode = "none" | "fixed" | "percent";

export interface BusinessHoursSettings {
  timezone: string;
  workDays: string[];
  startTime: string;
  endTime: string;
}

export interface InvoiceVisibilitySettings {
  showBusinessInfo: boolean;
  showCustomerInfo: boolean;
  showJobInfo: boolean;
  showLineItems: boolean;
  showLineItemPrices: boolean;
  showPayments: boolean;
  showBalance: boolean;
}

export interface InvoiceSettings {
  dueTerm: InvoiceDueTerm;
  netDays: number;
  format: DocumentFormat;
  defaultMessage: string;
  paymentInstructions: string;
  reminderDays: number[];
  visibility: InvoiceVisibilitySettings;
}

export interface EstimateVisibilitySettings {
  showBusinessInfo: boolean;
  showCustomerInfo: boolean;
  showJobInfo: boolean;
  showLineItems: boolean;
  showLineItemPrices: boolean;
  showOptionSummary: boolean;
}

export interface EstimateSettings {
  expirationDays: number;
  approvalMode: EstimateApprovalMode;
  signatureRequired: boolean;
  depositMode: DepositMode;
  depositValue: number;
  format: DocumentFormat;
  defaultMessage: string;
  optionLabels: [string, string, string];
  visibility: EstimateVisibilitySettings;
}

export interface PaymentSettings {
  onlinePaymentsEnabled: boolean;
  allowManualCash: boolean;
  allowManualCheck: boolean;
  allowManualCard: boolean;
  allowPartialPayments: boolean;
  tipsEnabled: boolean;
}

export interface TaxSettings {
  taxEnabled: boolean;
  taxLabel: string;
  defaultTaxRateBps: number;
  discountsEnabled: boolean;
  defaultDiscountLabel: string;
}

export interface MessageSettings {
  invoiceEmailSubject: string;
  invoiceEmailBody: string;
  estimateEmailSubject: string;
  estimateEmailBody: string;
  reviewRequestBody: string;
  portalLinkSubject: string;
  portalLinkBody: string;
}

export interface NumberingSettings {
  invoicePrefix: string;
  invoiceNextNumber: number;
  estimatePrefix: string;
  estimateNextNumber: number;
}

export interface PortalSettings {
  enabled: boolean;
  showSponsorSlot: boolean;
  allowEstimateApproval: boolean;
  allowInvoicePayment: boolean;
  allowServiceHistory: boolean;
}

export interface BusinessSettings {
  businessHours: BusinessHoursSettings;
  serviceAreas: string[];
  invoice: InvoiceSettings;
  estimate: EstimateSettings;
  payments: PaymentSettings;
  taxes: TaxSettings;
  messages: MessageSettings;
  numbering: NumberingSettings;
  portal: PortalSettings;
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  businessHours: {
    timezone: "America/New_York",
    workDays: ["mon", "tue", "wed", "thu", "fri"],
    startTime: "08:00",
    endTime: "17:00",
  },
  serviceAreas: [],
  invoice: {
    dueTerm: "net_days",
    netDays: 14,
    format: "email",
    defaultMessage: "Thank you for your business. Please review the invoice and pay the balance by the due date.",
    paymentInstructions: "Pay online if enabled, or contact the office to arrange cash, check, or card payment.",
    reminderDays: [3, 7, 14],
    visibility: {
      showBusinessInfo: true,
      showCustomerInfo: true,
      showJobInfo: true,
      showLineItems: true,
      showLineItemPrices: true,
      showPayments: true,
      showBalance: true,
    },
  },
  estimate: {
    expirationDays: 30,
    approvalMode: "single_option",
    signatureRequired: true,
    depositMode: "none",
    depositValue: 0,
    format: "email",
    defaultMessage: "This estimate is valid pending final service conditions and customer approval.",
    optionLabels: ["Good", "Better", "Best"],
    visibility: {
      showBusinessInfo: true,
      showCustomerInfo: true,
      showJobInfo: true,
      showLineItems: true,
      showLineItemPrices: true,
      showOptionSummary: true,
    },
  },
  payments: {
    onlinePaymentsEnabled: false,
    allowManualCash: true,
    allowManualCheck: true,
    allowManualCard: true,
    allowPartialPayments: true,
    tipsEnabled: false,
  },
  taxes: {
    taxEnabled: false,
    taxLabel: "Sales tax",
    defaultTaxRateBps: 0,
    discountsEnabled: true,
    defaultDiscountLabel: "Discount",
  },
  messages: {
    invoiceEmailSubject: "Invoice {{invoiceNumber}} from {{companyName}}",
    invoiceEmailBody: "Hi {{customerName}}, your invoice is ready. Balance due: {{balance}}.",
    estimateEmailSubject: "Estimate from {{companyName}}",
    estimateEmailBody: "Hi {{customerName}}, please review estimate {{estimateNumber}} and approve the option that works best.",
    reviewRequestBody: "Thanks for choosing {{companyName}}. If we earned it, please leave us a review.",
    portalLinkSubject: "Your customer portal link from {{companyName}}",
    portalLinkBody: "Hi {{customerName}},\n\nHere is your secure customer portal link for {{companyName}}:\n\n{{portalLink}}\n\n{{#portalExpiresAt}}This link expires {{portalExpiresAt}}.\n\n{{/portalExpiresAt}}Use it to review your balance, pay online, see receipts, and view your service plan.",
  },
  numbering: {
    invoicePrefix: "INV",
    invoiceNextNumber: 1000,
    estimatePrefix: "EST",
    estimateNextNumber: 1000,
  },
  portal: {
    enabled: true,
    showSponsorSlot: true,
    allowEstimateApproval: true,
    allowInvoicePayment: true,
    allowServiceHistory: true,
  },
};

export function mergeBusinessSettings(input: unknown): BusinessSettings {
  const value = isRecord(input) ? input : {};
  const invoice = isRecord(value.invoice) ? value.invoice : {};
  const estimate = isRecord(value.estimate) ? value.estimate : {};

  return {
    ...DEFAULT_BUSINESS_SETTINGS,
    ...value,
    businessHours: {
      ...DEFAULT_BUSINESS_SETTINGS.businessHours,
      ...(isRecord(value.businessHours) ? value.businessHours : {}),
    },
    serviceAreas: Array.isArray(value.serviceAreas) ? value.serviceAreas.filter((item): item is string => typeof item === "string") : [],
    invoice: {
      ...DEFAULT_BUSINESS_SETTINGS.invoice,
      ...invoice,
      visibility: {
        ...DEFAULT_BUSINESS_SETTINGS.invoice.visibility,
        ...(isRecord(invoice.visibility) ? invoice.visibility : {}),
      },
    },
    estimate: {
      ...DEFAULT_BUSINESS_SETTINGS.estimate,
      ...estimate,
      optionLabels: normalizeOptionLabels(estimate.optionLabels),
      visibility: {
        ...DEFAULT_BUSINESS_SETTINGS.estimate.visibility,
        ...(isRecord(estimate.visibility) ? estimate.visibility : {}),
      },
    },
    payments: {
      ...DEFAULT_BUSINESS_SETTINGS.payments,
      ...(isRecord(value.payments) ? value.payments : {}),
    },
    taxes: {
      ...DEFAULT_BUSINESS_SETTINGS.taxes,
      ...(isRecord(value.taxes) ? value.taxes : {}),
    },
    messages: {
      ...DEFAULT_BUSINESS_SETTINGS.messages,
      ...(isRecord(value.messages) ? value.messages : {}),
    },
    numbering: {
      ...DEFAULT_BUSINESS_SETTINGS.numbering,
      ...(isRecord(value.numbering) ? value.numbering : {}),
    },
    portal: {
      ...DEFAULT_BUSINESS_SETTINGS.portal,
      ...(isRecord(value.portal) ? value.portal : {}),
    },
  };
}

function normalizeOptionLabels(value: unknown): [string, string, string] {
  if (!Array.isArray(value)) return DEFAULT_BUSINESS_SETTINGS.estimate.optionLabels;
  return [
    typeof value[0] === "string" && value[0].trim() ? value[0] : "Good",
    typeof value[1] === "string" && value[1].trim() ? value[1] : "Better",
    typeof value[2] === "string" && value[2].trim() ? value[2] : "Best",
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
