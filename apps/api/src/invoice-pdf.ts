type PdfLine = { text: string; size?: number; x?: number; y?: number };

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function line(text: string, y: number, options: Partial<PdfLine> = {}): PdfLine {
  return { text, y, x: options.x ?? 54, size: options.size ?? 10 };
}

function dateText(value?: Date | string | null) {
  return value ? new Date(value).toLocaleDateString("en-US") : "Not set";
}

export function buildInvoicePdf(input: {
  template: { companyName: string; companyAddress?: string | null; companyPhone?: string | null; companyEmail?: string | null; paymentTerms?: string | null; acceptedPaymentMethods?: string | null; lateFeePolicy?: string | null; footer?: string | null };
  invoice: { number: string; status: string; total: number; dueAt?: Date | string | null; createdAt?: Date | string | null; poNumber?: string | null };
  customer?: { name: string; email?: string | null; phone?: string | null } | null;
  property?: { address: string } | null;
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
  paid: number;
}) {
  const lines: PdfLine[] = [];
  let y = 760;
  lines.push(line(input.template.companyName, y, { size: 18 }));
  y -= 18;
  for (const detail of [input.template.companyAddress, input.template.companyPhone, input.template.companyEmail].filter(Boolean)) {
    lines.push(line(String(detail), y));
    y -= 14;
  }

  lines.push(line(`Invoice ${input.invoice.number}`, 760, { x: 370, size: 18 }));
  lines.push(line(`Status: ${input.invoice.status}`, 736, { x: 370 }));
  lines.push(line(`Issued: ${dateText(input.invoice.createdAt)}`, 722, { x: 370 }));
  lines.push(line(`Due: ${dateText(input.invoice.dueAt)}`, 708, { x: 370 }));
  if (input.invoice.poNumber) lines.push(line(`PO: ${input.invoice.poNumber}`, 694, { x: 370 }));

  y -= 24;
  lines.push(line("Bill to", y, { size: 12 }));
  y -= 16;
  lines.push(line(input.customer?.name ?? "Customer", y));
  y -= 14;
  const contact = [input.customer?.email, input.customer?.phone].filter(Boolean).join(" · ");
  if (contact) {
    lines.push(line(contact, y));
    y -= 14;
  }
  if (input.property?.address) {
    lines.push(line(`Service address: ${input.property.address}`, y));
    y -= 18;
  }

  y -= 12;
  lines.push(line("Description", y, { size: 11 }));
  lines.push(line("Qty", y, { x: 340, size: 11 }));
  lines.push(line("Unit", y, { x: 400, size: 11 }));
  lines.push(line("Amount", y, { x: 480, size: 11 }));
  y -= 18;

  for (const item of input.items.slice(0, 22)) {
    const amount = item.quantity * item.unitPrice;
    lines.push(line(item.description.slice(0, 44), y));
    lines.push(line(String(item.quantity), y, { x: 340 }));
    lines.push(line(money(item.unitPrice), y, { x: 400 }));
    lines.push(line(money(amount), y, { x: 480 }));
    y -= 16;
  }

  const balance = Math.max(input.invoice.total - input.paid, 0);
  y -= 12;
  lines.push(line(`Total: ${money(input.invoice.total)}`, y, { x: 400, size: 12 }));
  y -= 16;
  lines.push(line(`Paid: ${money(input.paid)}`, y, { x: 400, size: 12 }));
  y -= 16;
  lines.push(line(`Balance: ${money(balance)}`, y, { x: 400, size: 12 }));

  y -= 34;
  lines.push(line(`Payment terms: ${input.template.paymentTerms ?? "Due on receipt"}`, y));
  y -= 14;
  lines.push(line(`Accepted methods: ${input.template.acceptedPaymentMethods ?? "Cash, check, card"}`.slice(0, 88), y));
  y -= 14;
  lines.push(line(`Late fee policy: ${input.template.lateFeePolicy ?? "Late fees may apply."}`.slice(0, 88), y));
  y -= 28;
  lines.push(line(input.template.footer ?? "Thank you for your business.", y));

  const content = ["BT", "/F1 10 Tf"];
  for (const row of lines) {
    content.push(`/F1 ${row.size ?? 10} Tf`);
    content.push(`${row.x ?? 54} ${row.y ?? 72} Td (${pdfEscape(row.text)}) Tj`);
    content.push(`${-(row.x ?? 54)} ${-(row.y ?? 72)} Td`);
  }
  content.push("ET");
  const stream = content.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}
