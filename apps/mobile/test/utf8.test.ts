import assert from "node:assert/strict";
import test from "node:test";
import { utf8ByteLength } from "../src/utf8.ts";

test("ASCII and multibyte text use deterministic UTF-8 byte lengths", () => {
  assert.equal(utf8ByteLength("OpenFieldPro"), 12);
  assert.equal(utf8ByteLength("Åmes"), 5);
  assert.equal(utf8ByteLength("😀"), 4);
  assert.equal(utf8ByteLength("A😀Å"), 7);
});

test("unpaired UTF-16 surrogates are rejected", () => {
  assert.throws(() => utf8ByteLength("\ud800"), /malformed Unicode/);
  assert.throws(() => utf8ByteLength("\udc00"), /malformed Unicode/);
  assert.throws(() => utf8ByteLength("x\ud800y"), /malformed Unicode/);
});
