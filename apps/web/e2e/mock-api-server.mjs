import http from "node:http";

const host = "127.0.0.1";
const port = 3001;

const owner = {
  id: "owner-1",
  name: "Morgan Owner",
  email: "owner@example.test",
  role: "owner",
};

const technician = {
  id: "tech-1",
  name: "Alex Rivera",
  email: "alex@example.test",
  role: "technician",
};

const customers = [
  {
    id: "customer-1",
    name: "Taylor Morgan",
    email: "taylor@example.test",
    phone: "515-555-0101",
    createdAt: "2026-07-11T12:00:00.000Z",
  },
  {
    id: "customer-2",
    name: "Casey Nguyen",
    email: "casey@example.test",
    phone: "515-555-0102",
    createdAt: "2026-07-10T12:00:00.000Z",
  },
];

const jobs = [
  {
    id: "job-scheduled",
    orgId: "org-1",
    customerId: "customer-1",
    assignedTo: "tech-1",
    title: "Washer not draining",
    description: "Drain cycle stops with water remaining in the tub.",
    status: "scheduled",
    total: 18900,
    laborCostCents: 4500,
    scheduledAt: "2026-07-11T14:00:00.000Z",
    createdAt: "2026-07-09T12:00:00.000Z",
  },
  {
    id: "job-active",
    orgId: "org-1",
    customerId: "customer-2",
    assignedTo: "tech-1",
    title: "Refrigerator warm",
    description: "Fresh-food compartment is warm while the compressor runs.",
    status: "in_progress",
    total: 22900,
    laborCostCents: 5500,
    scheduledAt: "2026-07-11T16:00:00.000Z",
    createdAt: "2026-07-09T13:00:00.000Z",
  },
  {
    id: "job-completed",
    orgId: "org-1",
    customerId: "customer-1",
    assignedTo: "tech-1",
    title: "Dryer no heat",
    description: "Drum turns but the load remains cold.",
    status: "completed",
    total: 31900,
    laborCostCents: 7000,
    scheduledAt: "2026-07-11T18:00:00.000Z",
    createdAt: "2026-07-08T12:00:00.000Z",
  },
];

const appointments = [
  {
    id: "appointment-1",
    jobId: "job-scheduled",
    technicianId: "tech-1",
    startsAt: "2026-07-11T14:00:00.000Z",
    endsAt: "2026-07-11T15:30:00.000Z",
  },
  {
    id: "appointment-2",
    jobId: "job-active",
    technicianId: "tech-1",
    startsAt: "2026-07-11T16:00:00.000Z",
    endsAt: "2026-07-11T17:30:00.000Z",
  },
];

const invoices = [
  {
    id: "invoice-1",
    jobId: "job-completed",
    number: "INV-1042",
    status: "draft",
    total: 31900,
    createdAt: "2026-07-11T20:00:00.000Z",
  },
];

const lineItems = {
  "job-scheduled": [
    {
      id: "line-1",
      jobId: "job-scheduled",
      description: "Drain pump",
      quantity: 1,
      unitPrice: 14900,
      unitCost: 6200,
      createdAt: "2026-07-11T12:30:00.000Z",
    },
    {
      id: "line-2",
      jobId: "job-scheduled",
      description: "Diagnostic labor",
      quantity: 1,
      unitPrice: 4000,
      unitCost: 0,
      createdAt: "2026-07-11T12:31:00.000Z",
    },
  ],
};

const equipment = [
  {
    id: "equipment-1",
    orgId: "org-1",
    customerId: "customer-1",
    type: "appliance",
    make: "Whirlpool",
    model: "WTW5057LW",
    serialNumber: "CX1200456",
    installDate: "2024-03-15T00:00:00.000Z",
    warrantyExpiry: "2027-03-15T00:00:00.000Z",
    notes: "Laundry room, left side of basement.",
    createdAt: "2026-07-09T12:00:00.000Z",
  },
];

const servicePlans = [
  {
    id: "plan-1",
    orgId: "org-1",
    name: "Home Appliance Care",
    description: "Two preventive visits per year.",
    includedVisitsPerTerm: 2,
    termMonths: 12,
    priceCents: 19900,
    priorityScheduling: true,
    benefits: ["Priority scheduling"],
    active: true,
    createdAt: "2026-07-01T12:00:00.000Z",
  },
];

const servicePlanEnrollments = [
  {
    id: "enrollment-1",
    orgId: "org-1",
    customerId: "customer-1",
    servicePlanId: "plan-1",
    status: "active",
    startsAt: "2026-01-01T00:00:00.000Z",
    renewsAt: "2027-01-01T00:00:00.000Z",
    renewalReminderAt: "2026-12-02T00:00:00.000Z",
    visitsIncluded: 2,
    visitsCompleted: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const servicePlanVisits = [
  {
    id: "visit-1",
    orgId: "org-1",
    customerServicePlanId: "enrollment-1",
    title: "Annual washer inspection",
    status: "completed",
    createdAt: "2026-04-01T00:00:00.000Z",
  },
];

const catalogCategories = [
  { id: "category-laundry", name: "Laundry", description: "Washer and dryer service" },
  { id: "category-cooling", name: "Refrigeration", description: "Cooling service" },
];

const catalogItems = [
  {
    id: "catalog-drain-pump",
    orgId: "org-1",
    categoryId: "category-laundry",
    name: "Drain pump replacement",
    description: "Replace an accessible washer drain pump after diagnosis.",
    priceCents: 24900,
    costCents: 7800,
    taxable: true,
    active: true,
    createdAt: "2026-07-01T12:00:00.000Z",
  },
  {
    id: "catalog-diagnostic",
    orgId: "org-1",
    categoryId: "category-laundry",
    name: "Appliance diagnostic",
    description: "On-site diagnosis and written findings.",
    priceCents: 8900,
    costCents: 1800,
    taxable: false,
    active: true,
    createdAt: "2026-07-01T12:05:00.000Z",
  },
  {
    id: "catalog-sealed-system",
    orgId: "org-1",
    categoryId: "category-cooling",
    name: "Sealed-system evaluation",
    description: "Pressure, temperature, and compressor-current evaluation.",
    priceCents: 15900,
    costCents: 3200,
    taxable: false,
    active: true,
    createdAt: "2026-07-01T12:10:00.000Z",
  },
];

let requests = [];

function roleFromRequest(request) {
  const cookie = request.headers.cookie ?? "";
  if (cookie.includes("ofp_session=technician-session")) return "technician";
  if (cookie.includes("ofp_session=owner-session")) return "owner";
  return null;
}

function sessionUser(role) {
  return role === "technician" ? technician : role === "owner" ? owner : null;
}

function fieldJob(job) {
  const { total: _total, laborCostCents: _laborCostCents, ...rest } = job;
  return { ...rest, financialsRestricted: true };
}

function fieldLineItem(item) {
  const { unitPrice: _unitPrice, unitCost: _unitCost, ...rest } = item;
  return { ...rest, financialsRestricted: true };
}

function fieldCatalogItem(item) {
  const { costCents: _costCents, ...rest } = item;
  return { ...rest, costRestricted: true };
}

function send(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "http://127.0.0.1:3000",
    "access-control-allow-credentials": "true",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function pathParts(pathname) {
  return pathname.split("/").filter(Boolean);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  const role = roleFromRequest(request);

  if (url.pathname === "/health") return send(response, 200, { ok: true });
  if (url.pathname === "/__reset" && request.method === "POST") {
    requests = [];
    return send(response, 200, { ok: true });
  }
  if (url.pathname === "/__requests") return send(response, 200, { requests });

  requests.push({ method: request.method, path: url.pathname, role });

  if (request.method === "OPTIONS") return send(response, 204, {});
  if (url.pathname === "/api/auth/me") {
    const user = sessionUser(role);
    return user ? send(response, 200, user) : send(response, 401, { error: "unauthorized" });
  }
  if (!role) return send(response, 401, { error: "authentication required" });

  if (url.pathname === "/api/jobs") {
    return send(response, 200, role === "technician" ? jobs.map(fieldJob) : jobs);
  }
  if (/^\/api\/jobs\/[^/]+$/.test(url.pathname)) {
    const id = pathParts(url.pathname)[2];
    const job = jobs.find((item) => item.id === id);
    if (!job) return send(response, 404, { error: "not found" });
    return send(response, 200, role === "technician" ? fieldJob(job) : job);
  }
  if (/^\/api\/jobs\/[^/]+\/line-items$/.test(url.pathname)) {
    const id = pathParts(url.pathname)[2];
    const rows = lineItems[id] ?? [];
    return send(response, 200, role === "technician" ? rows.map(fieldLineItem) : rows);
  }

  if (url.pathname === "/api/customers" && request.method === "GET") {
    return send(response, 200, customers);
  }
  if (url.pathname === "/api/customers" && request.method === "POST") {
    return role === "technician"
      ? send(response, 403, { error: "insufficient role for this operation" })
      : send(response, 201, customers[0]);
  }
  if (/^\/api\/customers\/[^/]+$/.test(url.pathname)) {
    const id = pathParts(url.pathname)[2];
    const customer = customers.find((item) => item.id === id);
    if (!customer) return send(response, 404, { error: "not found" });
    if (request.method === "PATCH" && role === "technician") {
      return send(response, 403, { error: "insufficient role for this operation" });
    }
    return send(response, 200, customer);
  }

  if (url.pathname === "/api/appointments") return send(response, 200, appointments);
  if (url.pathname === "/api/invoices") {
    return role === "technician"
      ? send(response, 403, { error: "insufficient role for this operation" })
      : send(response, 200, invoices);
  }
  if (url.pathname === "/api/activities") {
    return send(response, 200, [
      {
        id: "activity-1",
        customerId: url.searchParams.get("customerId") ?? "customer-1",
        jobId: url.searchParams.get("jobId") ?? "job-scheduled",
        kind: "job.status_changed",
        summary: "Job assigned to Alex Rivera",
        createdAt: "2026-07-11T12:15:00.000Z",
      },
    ]);
  }

  if (url.pathname === "/api/equipment" && request.method === "GET") {
    const customerId = url.searchParams.get("customerId");
    return send(response, 200, customerId ? equipment.filter((item) => item.customerId === customerId) : equipment);
  }
  if (url.pathname === "/api/equipment" && request.method === "POST") {
    return send(response, 201, equipment[0]);
  }
  if (/^\/api\/equipment\/[^/]+$/.test(url.pathname) && request.method === "DELETE") {
    return role === "technician"
      ? send(response, 403, { error: "equipment deletion requires office access" })
      : send(response, 204, {});
  }

  if (url.pathname === "/api/service-plans") {
    return role === "technician"
      ? send(response, 403, { error: "insufficient role for this operation" })
      : send(response, 200, servicePlans);
  }
  if (url.pathname === "/api/service-plans/enrollments" && request.method === "GET") {
    return role === "technician"
      ? send(response, 403, { error: "insufficient role for this operation" })
      : send(response, 200, servicePlanEnrollments);
  }
  if (url.pathname === "/api/service-plans/enrollments" && request.method === "POST") {
    return role === "technician"
      ? send(response, 403, { error: "insufficient role for this operation" })
      : send(response, 201, servicePlanEnrollments[0]);
  }
  if (url.pathname === "/api/service-plans/visits") {
    return role === "technician"
      ? send(response, 403, { error: "insufficient role for this operation" })
      : send(response, 200, servicePlanVisits);
  }

  if (url.pathname === "/api/diagnostics/sessions") return send(response, 200, []);
  if (url.pathname === "/api/catalog/categories") return send(response, 200, catalogCategories);
  if (url.pathname === "/api/catalog/items" && request.method === "GET") {
    return send(response, 200, role === "technician" ? catalogItems.map(fieldCatalogItem) : catalogItems);
  }
  if (url.pathname.startsWith("/api/catalog/") && request.method !== "GET") {
    return role === "technician"
      ? send(response, 403, { error: "insufficient role for this operation" })
      : send(response, 200, { ok: true });
  }
  if (url.pathname === "/api/notifications/unread-count") return send(response, 200, { count: 0 });
  if (url.pathname === "/api/notifications") return send(response, 200, []);

  return send(response, 404, { error: "fixture route not found", path: url.pathname });
});

server.listen(port, host, () => {
  console.log(`OpenFieldPro deterministic API fixture listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
