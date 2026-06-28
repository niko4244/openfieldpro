-- OpenFieldPro production baseline migration.
-- Safe for a fresh database; existing deployments should review before applying.

CREATE EXTENSION IF NOT EXISTS postgis;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('lead', 'scheduled', 'in_progress', 'completed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'dispatcher', 'technician');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reminder_channel AS ENUM ('email', 'sms', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE milestone_status AS ENUM ('draft', 'ready', 'invoiced', 'paid', 'void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE proposal_tier AS ENUM ('good', 'better', 'best', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  company_address text,
  company_phone text,
  company_email text,
  company_website text,
  license_number text,
  logo_url text,
  accent_color text NOT NULL DEFAULT '#2463eb',
  template_style text NOT NULL DEFAULT 'modern',
  invoice_prefix text NOT NULL DEFAULT 'INV',
  default_tax_rate_bps integer NOT NULL DEFAULT 0,
  default_discount_cents integer NOT NULL DEFAULT 0,
  payment_terms text NOT NULL DEFAULT 'Due on receipt',
  accepted_payment_methods text NOT NULL DEFAULT 'Credit card, ACH, cash, check',
  late_fee_policy text NOT NULL DEFAULT 'Late fees may apply to overdue balances.',
  memo text NOT NULL DEFAULT 'Thank you for your business.',
  footer text NOT NULL DEFAULT 'Questions? Contact us before paying.',
  terms_and_conditions text NOT NULL DEFAULT 'All work is subject to the terms agreed before service.',
  show_line_item_prices boolean NOT NULL DEFAULT true,
  show_payment_history boolean NOT NULL DEFAULT true,
  show_company_contact boolean NOT NULL DEFAULT true,
  show_customer_details boolean NOT NULL DEFAULT true,
  show_service_address boolean NOT NULL DEFAULT true,
  show_technician boolean NOT NULL DEFAULT true,
  show_tax_and_discount boolean NOT NULL DEFAULT true,
  show_terms boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  role user_role NOT NULL DEFAULT 'technician',
  password_hash text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address text NOT NULL,
  lat text,
  lng text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status job_status NOT NULL DEFAULT 'lead',
  scheduled_at timestamptz,
  total integer NOT NULL DEFAULT 0,
  labor_cost_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price integer NOT NULL DEFAULT 0,
  unit_cost integer NOT NULL DEFAULT 0,
  taxable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  total integer NOT NULL DEFAULT 0,
  accepted boolean NOT NULL DEFAULT false,
  public_token text,
  accepted_option_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS estimate_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  tier proposal_tier NOT NULL DEFAULT 'custom',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  total integer NOT NULL DEFAULT 0,
  included text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  number text NOT NULL,
  po_number text,
  status invoice_status NOT NULL DEFAULT 'draft',
  total integer NOT NULL DEFAULT 0,
  tax_rate_bps integer NOT NULL DEFAULT 0,
  discount_cents integer NOT NULL DEFAULT 0,
  public_token text,
  due_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_reminder_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  days_after_due integer NOT NULL DEFAULT 0,
  channel reminder_channel NOT NULL DEFAULT 'email',
  message text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS progress_invoice_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  label text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  percent_bps integer NOT NULL DEFAULT 0,
  status milestone_status NOT NULL DEFAULT 'draft',
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  method text NOT NULL DEFAULT 'manual',
  reference text,
  provider text NOT NULL DEFAULT 'manual',
  provider_payment_id text,
  idempotency_key text,
  paid_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  org_id uuid REFERENCES orgs(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'received',
  error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recurring_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title text NOT NULL,
  interval_days integer NOT NULL,
  next_run_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  rating integer NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  technician_id uuid REFERENCES users(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_templates_org_idx ON invoice_templates(org_id);
CREATE INDEX IF NOT EXISTS users_org_email_idx ON users(org_id, email);
CREATE INDEX IF NOT EXISTS customers_org_idx ON customers(org_id);
CREATE INDEX IF NOT EXISTS jobs_org_status_idx ON jobs(org_id, status);
CREATE INDEX IF NOT EXISTS jobs_scheduled_idx ON jobs(scheduled_at);
CREATE INDEX IF NOT EXISTS estimates_public_token_idx ON estimates(public_token);
CREATE INDEX IF NOT EXISTS estimate_options_estimate_idx ON estimate_options(org_id, estimate_id);
CREATE INDEX IF NOT EXISTS invoices_org_status_idx ON invoices(org_id, status);
CREATE INDEX IF NOT EXISTS invoices_public_token_idx ON invoices(public_token);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_number_uidx ON invoices(org_id, number);
CREATE INDEX IF NOT EXISTS invoice_reminders_invoice_idx ON invoice_reminder_schedules(org_id, invoice_id);
CREATE INDEX IF NOT EXISTS progress_milestones_job_idx ON progress_invoice_milestones(org_id, job_id);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments(org_id, invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_uidx ON payments(org_id, provider, provider_payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_uidx ON payments(org_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS stripe_webhook_events_event_uidx ON stripe_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS activities_customer_idx ON activities(org_id, customer_id, created_at);
CREATE INDEX IF NOT EXISTS activities_job_idx ON activities(job_id);
CREATE INDEX IF NOT EXISTS appts_window_idx ON appointments(org_id, starts_at);
