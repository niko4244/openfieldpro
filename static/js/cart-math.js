// Pure cart-math helpers for the OFP modal. Extracted from openfieldpro.js
// so they can be unit-tested in isolation — no DOM, no module-scope state,
// no internal imports. openfieldpro.js re-uses these via ESM import; the
// tests in tests/cart-math.test.mjs import them directly.
//
// Keep this file dependency-free.

/** Quantize to 2 decimal places. Counterpart to the Python `round(..., 2)`
 *  the server applies in `update_invoice` so client and server agree on
 *  display totals. round2(0.1+0.2*3) === 0.5 — closes the IEEE-754 drift
 *  trap. */
export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** One line's subtotal: price × quantity. Missing fields default to 0 / 1
 *  so partial line rows don't propagate NaN. */
export function lineSubtotal(li) {
  return Number(li.price || 0) * Number(li.quantity || 1);
}

/** Sum line subtotals + round2 to cents. Tolerates null / undefined via the
 *  `(items || [])` guard so callers can be lazier than they should be. */
export function cartTotal(items) {
  return round2((items || []).reduce((s, li) => s + lineSubtotal(li), 0));
}

/** Snapshot an inventory row into a cart line item. Renames / price changes
 *  in the catalog later won't rewrite the historical invoice line because
 *  name + price + taxable are copied by value.
 *
 *  ONLY use on INVENTORY-shaped input (rows that have `default_price` and
 *  `taxable`). For cart-shaped rows already on an invoice, use
 *  `normalizeCartLine` instead — calling snapShotLine on a cart row
 *  silently zeros the price because cart rows use `price`, not
 *  `default_price`. */
export function snapShotLine(item) {
  return {
    inventory_id: item.id,
    name:         item.name,
    price:        Number(item.default_price || 0),
    quantity:     1,
    taxable:      !!item.taxable,
  };
}

/** Normalize a cart-shaped line — input that already has the invoice
 *  lineage shape ({inventory_id, name, price, quantity, taxable}). No
 *  field rename; just coerces numbers and clamps quantity so a careless
 *  patch or sessionStorage reload can't inject NaN into the cart sum.
 *
 *  Use this on ANY path that receives a cart-shaped row:
 *    - applyInvoiceLineItemPatch (server PUT body line_items)
 *    - createInvoice's draft.line_items (already cart-shaped)
 *  DO NOT use snapShotLine on cart rows — see the warning above. */
export function normalizeCartLine(line) {
  return {
    inventory_id: line.inventory_id,
    name:         line.name,
    price:        Number(line.price || 0),
    quantity:     Math.max(1, parseInt(line.quantity, 10) || 1),
    taxable:      !!line.taxable,
  };
}

/** Pure equivalent of the line-items branch of `updateInvoice` in
 *  openfieldpro.js. Returns a NEW invoice object — the caller is
 *  responsible for assigning it back into state. Mirrors the server's
 *  PUT contract: when the patch carries a line_items array, total is
 *  recomputed from the cart (body's total is ignored — a UI sending
 *  stale total alongside a fresh cart would write a mismatched total
 *  and confuse the dashboard revenue KPI). When patch has no
 *  line_items, the existing total is preserved (legacy flat-total path).
 *
 *  ALL THREE GUARDS explicitly break the inner `line_items` array
 *  reference so future callers cannot mutate `state.invoices[i]`
 *  through the result. New branches must follow the same pattern.
 */
export function applyInvoiceLineItemPatch(invoice, patch) {
  // Empty array falls through to legacy: server's PUT contract uses
  // `body['line_items']` truthiness so partial updates can't zero the
  // prior total. The spread below ALSO strips `line_items` + `total`
  // from the patch — without that, `{...invoice, ...patch}` would
  // overwrite invoice.line_items with `[]` even in the legacy branch.
  // Pin: see `applyInvoiceLineItemPatch preserves legacy total when
  // patch carries empty array` in cart-math.test.mjs.
  if (!patch) return { ...invoice, line_items: [...(invoice.line_items || [])] };   // null/undefined patch — keep prior AND break the inner-array reference
  if (!Array.isArray(patch.line_items) || patch.line_items.length === 0) {
    const { line_items: _li, total: _t, ...rest } = patch;
    // Same inner-array break as the null guard above — without it the
    // legacy branch aliases invoice.line_items, letting a future caller
    // silently mutate state.invoices[i].line_items via the result.
    return { ...invoice, ...rest, line_items: [...(invoice.line_items || [])] };
  }
  // patch.line_items are CART-shaped (they came off an existing invoice,
  // not the inventory catalog) — use normalizeCartLine, NOT snapShotLine,
  // or every price gets silently coerced to 0 (the snapShotLine helper
  // reads `default_price` from inventory rows, which is undefined on cart
  // rows). The cart-math test `applyInvoiceLineItemPatch preserves price
  // when patch carries cart-shaped line_items` pins this down.
  const line_items = patch.line_items.map(normalizeCartLine);
  const total = cartTotal(line_items);
  // Drop the two fields we just recomputed so the spread doesn't
  // re-stomp them with stale values from the patch.
  const { line_items: _li, total: _t, ...rest } = patch;
  return { ...invoice, ...rest, line_items, total };
}

/** Mirrors applyInvoiceLineItemPatch but writes `amount` instead of
 *  `total` (estimates use the legacy flat-amount field — invoices use
 *  `total`). Same contract:
 *    - null/undefined patch → return prior estimate with a fresh inner
 *      `line_items` array reference
 *    - empty / non-array line_items → legacy flat path: preserve prior
 *      `amount`, refresh the inner-array reference
 *    - non-empty line_items → recompute `amount = cartTotal(...)`
 *    - id-pivot defense: any `id` / `amount` on the patch is stripped
 *
 *  ALL THREE GUARDS explicitly break the inner `line_items` array
 *  reference so future callers cannot mutate `state.estimates[i]`
 *  through the result. New branches must follow the same pattern.
 */
export function applyEstimateLineItemPatch(estimate, patch) {
  if (!patch) return { ...estimate, line_items: [...(estimate.line_items || [])] };
  if (!Array.isArray(patch.line_items) || patch.line_items.length === 0) {
    const { line_items: _li, amount: _a, ...rest } = patch;
    return { ...estimate, ...rest, line_items: [...(estimate.line_items || [])] };
  }
  const line_items = patch.line_items.map(normalizeCartLine);
  const amount = cartTotal(line_items);
  const { line_items: _li, amount: _a, ...rest } = patch;
  return { ...estimate, ...rest, line_items, amount };
}
