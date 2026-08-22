// Runnable check (no DB needed):  node --import tsx --test test/reports.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arAgingReport,
  estimateConversionReport,
  jobOnTime,
  revenueTrendReport,
  toCsv,
} from "../src/reports.ts";

const NOW = new Date("2026-08-22T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

test("arAgingReport buckets by days past due", () => {
  const report = arAgingReport([
    { total: 10_000, paid: 0, dueAt: daysAgo(-5) }, // current
    { total: 20_000, paid: 0, dueAt: daysAgo(15) }, // 1-30
    { total: 30_000, paid: 0, dueAt: daysAgo(45) }, // 31-60
    { total: 40_000, paid: 0, dueAt: daysAgo(75) }, // 61-90
    { total: 50_000, paid: 0, dueAt: daysAgo(200) }, // 90+
  ], NOW);
  assert.deepEqual(
    report.buckets.map((bucket) => [bucket.label, bucket.count, bucket.totalCents]),
    [
      ["current", 1, 10_000],
      ["1-30", 1, 20_000],
      ["31-60", 1, 30_000],
      ["61-90", 1, 40_000],
      ["90+", 1, 50_000],
    ],
  );
  assert.equal(report.totalOutstandingCents, 150_000);
  assert.equal(report.invoiceCount, 5);
});

test("arAgingReport excludes invoices with no outstanding balance", () => {
  const report = arAgingReport([
    { total: 10_000, paid: 10_000, dueAt: daysAgo(30) }, // fully paid
    { total: 10_000, paid: 12_000, dueAt: daysAgo(30) }, // overpaid
    { total: 5_000, paid: 2_000, dueAt: daysAgo(30) }, // partial
  ], NOW);
  assert.equal(report.invoiceCount, 1);
  assert.equal(report.totalOutstandingCents, 3_000);
  assert.equal(report.buckets.find((bucket) => bucket.label === "1-30")?.count, 1);
});

test("arAgingReport falls back to createdAt when dueAt is missing", () => {
  const report = arAgingReport([
    { total: 10_000, paid: 0, createdAt: daysAgo(40) },
  ], NOW);
  assert.equal(report.buckets.find((bucket) => bucket.label === "31-60")?.totalCents, 10_000);
});

test("estimateConversionReport counts the funnel and excludes drafts", () => {
  const report = estimateConversionReport([
    { status: "sent", sentAt: daysAgo(10) },
    { status: "approved", sentAt: daysAgo(20), acceptedAt: daysAgo(15) },
    { status: "declined", sentAt: daysAgo(5) },
    { status: "expired", sentAt: daysAgo(60) },
    { status: "draft", sentAt: daysAgo(2) }, // drafts never reach the funnel
    { status: "sent", sentAt: daysAgo(400) }, // outside the window
  ], 90, NOW);
  assert.equal(report.sent, 1);
  assert.equal(report.approved, 1);
  assert.equal(report.declined, 1);
  assert.equal(report.expired, 1);
  assert.equal(report.conversionRate, 0.25);
  assert.equal(report.avgDaysToApprove, 5);
});

test("estimateConversionReport handles an empty funnel", () => {
  const report = estimateConversionReport([], 90, NOW);
  assert.equal(report.sent, 0);
  assert.equal(report.conversionRate, 0);
  assert.equal(report.avgDaysToApprove, null);
});

test("revenueTrendReport zero-fills trailing months and labels UTC months", () => {
  const report = revenueTrendReport([
    { paidAt: new Date("2026-08-05T10:00:00Z"), amount: 12_000 },
    { paidAt: new Date("2026-08-20T10:00:00Z"), amount: 3_000 },
    { paidAt: new Date("2026-06-01T00:00:00Z"), amount: 9_000 },
  ], 4, NOW);
  assert.deepEqual(
    report.months.map((point) => [point.month, point.revenueCents]),
    [
      ["2026-05", 0],
      ["2026-06", 9_000],
      ["2026-07", 0],
      ["2026-08", 15_000],
    ],
  );
  assert.equal(report.totalRevenueCents, 24_000);
});

test("revenueTrendReport clamps the window to 1..60 months", () => {
  assert.equal(revenueTrendReport([], 0, NOW).months.length, 1);
  assert.equal(revenueTrendReport([], 120, NOW).months.length, 60);
});

test("jobOnTime is null without a schedule or appointment", () => {
  assert.equal(jobOnTime(null, []), null);
  assert.equal(jobOnTime(daysAgo(1), []), null);
});

test("jobOnTime honors the grace window", () => {
  const scheduledAt = new Date("2026-08-20T09:00:00Z");
  assert.equal(jobOnTime(scheduledAt, [new Date("2026-08-20T09:14:00Z")]), true);
  assert.equal(jobOnTime(scheduledAt, [new Date("2026-08-20T09:16:00Z")]), false);
  assert.equal(jobOnTime(scheduledAt, [new Date("2026-08-19T10:00:00Z"), new Date("2026-08-20T10:00:00Z")]), true);
});

test("toCsv emits a header row and CRLF lines", () => {
  const csv = toCsv([
    { name: "a", count: 1 },
    { name: "b", count: 2 },
  ]);
  assert.equal(csv, "name,count\r\na,1\r\nb,2\r\n");
});

test("toCsv quotes commas, quotes, and newlines per RFC 4180", () => {
  const csv = toCsv([
    { label: 'He said "hi"', value: "1,000", note: "line1\nline2" },
  ]);
  assert.equal(csv, 'label,value,note\r\n"He said ""hi""","1,000","line1\nline2"\r\n');
});

test("toCsv returns empty for no rows", () => {
  assert.equal(toCsv([]), "");
});
