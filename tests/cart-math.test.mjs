// Tiny node:test suite for ~/Brainz/odysseus/static/js/cart-math.js.
// Zero deps — uses Node's built-in test runner + assert/strict.
// Run with:   node --test tests/cart-math.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  round2,
  lineSubtotal,
  cartTotal,
  snapShotLine,
  normalizeCartLine,
  applyInvoiceLineItemPatch,
  applyEstimateLineItemPatch,
} from '../static/js/cart-math.js';

// ---------------------------------------------------------------------------
// snapShotLine
// ---------------------------------------------------------------------------

test('snapShotLine copies the 5 expected fields from an inventory row', () => {
  const item = {
    id: 'inv-cap455',
    name: 'Dual Capacitor 45/5 µF',
    category: 'part',
    default_price: 34.99,
    unit: 'each',
    taxable: true,
    sku: 'CAP-455',
    description: 'Dual run capacitor',
  };
  const line = snapShotLine(item);
  assert.equal(line.inventory_id, 'inv-cap455');
  assert.equal(line.name,         'Dual Capacitor 45/5 µF');
  assert.equal(line.price,        34.99);
  assert.equal(line.quantity,     1);
  assert.equal(line.taxable,      true);
  // catalog-only fields must NOT leak onto the line item
  assert.equal('category'    in line, false);
  assert.equal('unit'        in line, false);
  assert.equal('sku'         in line, false);
  assert.equal('description' in line, false);
});

test('snapShotLine tolerates missing optional fields', () => {
  // default_price missing -> 0; taxable missing -> false (double-bang
  // undefined is the well-known falsy default; the rule is documented in
  // cart-math.js so future contributors can find it without reasoning
  // about coercion).
  const line = snapShotLine({ id: 'inv-x', name: 'X' });
  assert.equal(line.inventory_id, 'inv-x');
  assert.equal(line.name,         'X');
  assert.equal(line.price,        0);
  assert.equal(line.quantity,     1);
  assert.equal(line.taxable,      false);

  // Explicit `taxable: false` and `default_price: 12.5` are still honored.
  const line2 = snapShotLine({ id: 'inv-y', name: 'Y', default_price: 12.5, taxable: false });
  assert.equal(line2.price,   12.5);
  assert.equal(line2.taxable, false);

  // String-y inventory price still parses to a Number via Number(...).
  const line3 = snapShotLine({ id: 'inv-z', name: 'Z', default_price: '7.25' });
  assert.equal(line3.price, 7.25);
});

// ---------------------------------------------------------------------------
// cartTotal
// ---------------------------------------------------------------------------

test('cartTotal handles empty array (and null / undefined) as 0', () => {
  assert.equal(cartTotal([]),        0);
  assert.equal(cartTotal(null),      0);
  assert.equal(cartTotal(undefined), 0);
});

test('cartTotal applies round2 (Math.round(n*100)/100) so no floating-point drift', () => {
  // The IEEE-754 trap: 0.1 * 3 + 0.2 = 0.5 logically, but 0.1 + 0.2 is
  // 0.30000000000000004 in floats. round2 quantizes via a single
  // Math.round so the final display total is exact.
  assert.equal(
    cartTotal([
      { price: 0.1, quantity: 3 },
      { price: 0.2, quantity: 1 },
    ]),
    0.5
  );
  // The classic HVAC scenario used by the OFP smoke test:
  // 2x capacitor @ 34.99 + 4x refrigerant @ 18.50 = 143.98
  assert.equal(
    cartTotal([
      { price: 34.99, quantity: 2 },
      { price: 18.50, quantity: 4 },
    ]),
    143.98
  );
});

test('cartTotal handles missing line fields without producing NaN', () => {
  // Missing price/quantity should not poison the whole sum.
  assert.equal(
    cartTotal([
      { price: 10, quantity: 2 },        // 20
      { price: undefined, quantity: 3 }, // 0  (defaults)
      { quantity: 4 },                   // 0  (price defaults; qty honored)
    ]),
    20
  );
});

// ---------------------------------------------------------------------------
// applyInvoiceLineItemPatch (the pure equivalent of updateInvoice's
// line-items-recompute branch, so the user's "updateInvoice recomputes
// total when line_items arrives" assertion is still pinned down even
// when the function reads module-scope state we can't mock in isolation).
// ---------------------------------------------------------------------------

test('applyInvoiceLineItemPatch recomputes total from line_items, ignoring body total', () => {
  // Mirrors the OFP smoke-test scenario exactly (2×34.99 + 4×18.50 = 143.98).
  const inv = {
    id: 'i1', customer_id: 'c1', title: 'Test',
    total: 999, balance: 0, status: 'draft',
    line_items: [],
  };
  const patch = {
    line_items: [
      { inventory_id: 'inv-cap455', name: 'Capacitor',   price: 34.99, quantity: 2, taxable: true },
      { inventory_id: 'inv-refr410', name: 'Refrigerant', price: 18.50, quantity: 4, taxable: true },
    ],
    total: 999.99,  // patch tries to set 999.99 — must be ignored
    status: 'sent',
  };
  const out = applyInvoiceLineItemPatch(inv, patch);
  assert.equal(out.id,           'i1');
  assert.equal(out.customer_id,  'c1');
  assert.equal(out.title,        'Test');
  assert.equal(out.total,        143.98);           // recomputed from cart, NOT 999.99
  assert.equal(out.status,       'sent');           // non-cart patch field passes through
  assert.equal(out.line_items.length, 2);
  assert.equal(out.line_items[0].inventory_id, 'inv-cap455');
  assert.equal(out.line_items[0].price,        34.99);
  assert.equal(out.line_items[0].quantity,     2);
  assert.equal(out.line_items[1].inventory_id, 'inv-refr410');
  assert.equal(out.line_items[1].price,        18.50);
  assert.equal(out.line_items[1].quantity,     4);
  // Original invoice object is NOT mutated — patch fn returns a NEW object.
  assert.notEqual(out, inv);
  assert.equal(inv.total, 999);                    // unchanged
  assert.equal(inv.line_items.length, 0);         // unchanged
});

test('applyInvoiceLineItemPatch preserves existing total when patch has no line_items', () => {
  // Legacy flat-total path: a PUT that only flips status (or balance)
  // must not touch `total`. Cards on legacy invoices stay flat.
  const inv = {
    id: 'i-legacy', total: 100, balance: 100, status: 'sent',
    line_items: [{ inventory_id: 'x', name: 'x', price: 50, quantity: 2, taxable: true }],
  };
  const out = applyInvoiceLineItemPatch(inv, { status: 'paid' });
  assert.equal(out.total,  100);
  assert.equal(out.status, 'paid');
  assert.equal(out.line_items.length, 1);  // untouched
});

test('applyInvoiceLineItemPatch preserves legacy total when patch carries empty array', () => {
  // Mirrors the server's PUT contract (`body['line_items']` truthiness):
  // an explicitly-empty cart is NOT a request to zero the invoice. A
  // partial update that flips status / balance must keep the prior total
  // untouched. Pinned because `Array.isArray([])` is true and an earlier
  // version of this function accidentally entered the recompute branch
  // for empty arrays, silently zeroing legacy invoices.
  const inv = {
    id: 'i-empty', total: 250, balance: 250, status: 'sent',
    line_items: [{ inventory_id: 'inv-x', name: 'X', price: 125, quantity: 2, taxable: true }],
  };
  const out1 = applyInvoiceLineItemPatch(inv, { line_items: [], status: 'paid' });
  assert.equal(out1.total,        250);
  assert.equal(out1.status,       'paid');
  assert.equal(out1.line_items.length, 1);  // untouched
  assert.equal(out1.balance,      250);
  // Deep-identity pin (parity with the null guard): the legacy-empties
  // branch MUST also break the inner-array reference, otherwise a future
  // caller can silently mutate state.invoices[i].line_items through the
  // result. Same surface that the null guard was audited for.
  assert.notEqual(out1.line_items, inv.line_items);

  // Edge: empty array BUT the patch also carries a stale `total` — the
  // legacy path must still honor the prior `total`, not the patch's
  // doomed-to-be-discarded value, because the empty list means "don't
  // recompute" and the patch fn never reads `patch.total`.
  const out2 = applyInvoiceLineItemPatch(inv, { line_items: [], total: 999.99 });
  assert.equal(out2.total, 250);   // NOT 999.99
});

test('applyInvoiceLineItemPatch returns invoice unchanged when patch is null/undefined', () => {
  // Defensive guard: the post-round-3 guard dereferences
  // `patch.line_items.length`, which would throw on a null/undefined
  // patch. Early-return locks down behavior. Pinned so a future refactor
  // can't reintroduce a TypeError crash under partial-update edge cases.
  const inv = { id: 'i-1', total: 100, balance: 100, line_items: [] };
  const outNull  = applyInvoiceLineItemPatch(inv, null);
  const outUndef = applyInvoiceLineItemPatch(inv, undefined);
  assert.deepEqual(outNull,  { ...inv });
  assert.deepEqual(outUndef, { ...inv });
  // Identity pin: a future refactor that returns `invoice` directly (no
  // spread) would pass deepEqual but quietly alias the live state record
  // — defeating the "returns a NEW object" contract the recompute branch
  // relies on. Mirror the recompute-branch contract here.
  assert.notEqual(outNull,  inv);
  assert.notEqual(outUndef, inv);
  // DEEPER identity pin: the outer `{ ...invoice }` spread creates a
  // new object reference but shares the inner line_items array. A future
  // refactor that pushed onto result.line_items would silently mutate
  // the live state record. Compare inner array references too.
  assert.notEqual(outNull.line_items,  inv.line_items);
  assert.notEqual(outUndef.line_items, inv.line_items);
});

test('cartTotal round2 catches a second drift pattern (0.07 + 0.07 = 0.14)', () => {
  // Pins round2's drift-defense from a different angle: 0.07 isn't
  // representable exactly in IEEE-754 either, so direct addition gives
  // 0.14000000000000001. If a future refactor weakens round2 (switches
  // to Math.floor / Math.trunc / bankers' rounding) this breaks loudly
  // — paired with the 0.1+0.2 fixture above it locks the invariant from
  // two different angles instead of one.
  assert.equal(
    cartTotal([
      { price: 0.07, quantity: 1 },
      { price: 0.07, quantity: 1 },
    ]),
    0.14
  );
});

// Bonus: openfieldpro.js refactor preserved the original wire-up. Verify
// the round-trip works through the live .
test('cartTotal round2 quantized sum matches the canonical 2+4 OFP fixture', () => {
  // The literal 143.98 also appears in verify_routes.py stage 4's PUT
  // recompute-check. If this drifts the verifier will catch it.
  const fixtureTotal = cartTotal([
    { price: 34.99, quantity: 2 },
    { price: 18.50, quantity: 4 },
  ]);
  assert.equal(fixtureTotal, 143.98);
});

// ---------------------------------------------------------------------------
// normalizeCartLine — bug-repro pin for the snapShotLine-vs-cart-row
// distinction. The pre-fix code called snapShotLine inside
// applyInvoiceLineItemPatch and createInvoice, but patch.line_items /
// draft.line_items are CART-shaped rows (use `price`), not inventory rows
// (use `default_price`). snapShotLine silently zeros the price because it
// reads inventory-only field names. normalizeCartLine reads `price` and
// passes it through. These two tests fail loudly if someone reintroduces
// snapShotLine on the cart path.
// ---------------------------------------------------------------------------

test('normalizeCartLine preserves price on cart-shaped rows (does NOT read default_price)', () => {
  // Cart-shaped line — exactly what applyInvoiceLineItemPatch receives.
  // No `default_price` field at all; snapShotLine would coerce price to 0.
  const cart = { inventory_id: 'inv-cap455', name: 'Dual Capacitor 45/5 µF', price: 34.99, quantity: 2, taxable: true };
  const out = normalizeCartLine(cart);
  assert.equal(out.price,        34.99);    // preserved, NOT zeroed
  assert.equal(out.inventory_id, 'inv-cap455');
  assert.equal(out.name,         'Dual Capacitor 45/5 µF');
  assert.equal(out.quantity,     2);
  assert.equal(out.taxable,      true);

  // String-y price parses via Number(...) — replay an unsafe-storage path.
  const cart2 = { inventory_id: 'inv-x', name: 'X', price: '7.25', quantity: '3', taxable: false };
  const out2  = normalizeCartLine(cart2);
  assert.equal(out2.price,    7.25);
  assert.equal(out2.quantity, 3);
  assert.equal(out2.taxable,  false);

  // Quantity clamps to >=1 so a 0 / negative patch can't break cartTotal.
  const cart3 = { inventory_id: 'inv-y', name: 'Y', price: 10, quantity: 0 };
  assert.equal(normalizeCartLine(cart3).quantity, 1);
  const cart4 = { inventory_id: 'inv-z', name: 'Z', price: 10, quantity: -5 };
  assert.equal(normalizeCartLine(cart4).quantity, 1);
});

test('applyInvoiceLineItemPatch preserves price when patch carries cart-shaped line_items', () => {
  // The exact bug the original refactor had: snapShotLine was called on
  // cart-shaped rows, zeroing every price. After the normalizeCartLine
  // swap, server-side PUT bodies (which are always cart-shaped from
  // existing invoices) preserve prices end-to-end.
  const inv = {
    id: 'i1', customer_id: 'c1', title: 'Test',
    total: 0, balance: 0, status: 'draft', line_items: [],
  };
  const patch = {
    line_items: [
      { inventory_id: 'inv-cap455', name: 'Dual Capacitor 45/5 µF', price: 34.99, quantity: 2, taxable: true },
      { inventory_id: 'inv-refr410', name: 'Refrigerant R-410A',   price: 18.50, quantity: 4, taxable: true },
    ],
  };
  const out = applyInvoiceLineItemPatch(inv, patch);
  assert.equal(out.total, 143.98);
  assert.equal(out.line_items[0].price,    34.99);   // would have been 0 before the fix
  assert.equal(out.line_items[1].price,    18.50);   // would have been 0 before the fix
  assert.equal(out.line_items[0].quantity, 2);
  assert.equal(out.line_items[1].quantity, 4);
});

// ---------------------------------------------------------------------------
// applyEstimateLineItemPatch — estimates mirror applyInvoiceLineItemPatch but
// write `amount` (estimates keep the legacy flat-amount field for backwards
// compatibility with the 5 seed rows) instead of `total`. The deep-identity
// invariants from the invoice side carry over verbatim — every guard must
// break the inner line_items reference.
// ---------------------------------------------------------------------------

test('applyEstimateLineItemPatch recomputes amount from line_items, ignoring body amount', () => {
  const est = {
    id: 'e1', customer_id: 'c1', title: 'Test estimate',
    amount: 999, status: 'draft', created_at: '2026-06-26', expires_at: '2026-07-10',
    line_items: [],
  };
  const patch = {
    line_items: [
      { inventory_id: 'inv-cap455', name: 'Capacitor',   price: 34.99, quantity: 2, taxable: true },
      { inventory_id: 'inv-refr410', name: 'Refrigerant', price: 18.50, quantity: 4, taxable: true },
    ],
    amount: 999.99,  // patch tries to set 999.99 — must be ignored
    status: 'sent',
  };
  const out = applyEstimateLineItemPatch(est, patch);
  assert.equal(out.id,           'e1');
  assert.equal(out.customer_id,  'c1');
  assert.equal(out.title,        'Test estimate');
  assert.equal(out.amount,       143.98);          // recomputed from cart, NOT 999.99
  assert.equal(out.status,       'sent');          // non-cart patch field passes through
  assert.equal(out.line_items.length, 2);
  assert.equal(out.line_items[0].price,    34.99);
  assert.equal(out.line_items[0].quantity, 2);
  assert.equal(out.line_items[1].price,    18.50);
  assert.equal(out.line_items[1].quantity, 4);
  // No mutation of the source estimate; a fresh object is returned.
  assert.notEqual(out, est);
  assert.equal(est.amount, 999);
  assert.equal(est.line_items.length, 0);
});

test('applyEstimateLineItemPatch preserves existing amount when patch has no line_items', () => {
  const est = {
    id: 'e-legacy', amount: 100, status: 'sent',
    created_at: '2026-06-12', expires_at: '2026-06-26',
    line_items: [{ inventory_id: 'x', name: 'X', price: 50, quantity: 2, taxable: true }],
  };
  const out = applyEstimateLineItemPatch(est, { status: 'approved' });
  assert.equal(out.amount,  100);
  assert.equal(out.status,  'approved');
  assert.equal(out.line_items.length, 1);
});

test('applyEstimateLineItemPatch preserves legacy amount when patch carries empty array', () => {
  // Mirror the invoice contract: an explicitly-empty cart is NOT a request
  // to zero the estimate. The legacy flat-amount path keeps the prior
  // amount untouched. Pinned because `Array.isArray([])` is true and an
  // earlier iteration of this helper accidentally entered the recompute
  // branch for empty arrays.
  const est = {
    id: 'e-empty', amount: 250, status: 'sent',
    created_at: '2026-06-12', expires_at: '2026-06-26',
    line_items: [{ inventory_id: 'inv-x', name: 'X', price: 125, quantity: 2, taxable: true }],
  };
  const out1 = applyEstimateLineItemPatch(est, { line_items: [], status: 'declined' });
  assert.equal(out1.amount,         250);
  assert.equal(out1.status,         'declined');
  assert.equal(out1.line_items.length, 1);
  assert.notEqual(out1.line_items,  est.line_items);  // deep-identity pin
});

test('applyEstimateLineItemPatch returns estimate unchanged when patch is null/undefined', () => {
  const est = { id: 'e-1', amount: 100, line_items: [] };
  const outNull  = applyEstimateLineItemPatch(est, null);
  const outUndef = applyEstimateLineItemPatch(est, undefined);
  assert.deepEqual(outNull,  { ...est });
  assert.deepEqual(outUndef, { ...est });
  assert.notEqual(outNull,  est);
  assert.notEqual(outUndef, est);
  assert.notEqual(outNull.line_items,  est.line_items);
  assert.notEqual(outUndef.line_items, est.line_items);
});
