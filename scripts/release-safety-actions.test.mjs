import assert from "node:assert/strict";
import test from "node:test";
import { findUnpinnedActions } from "./release-safety-check.mjs";

test("commit-SHA-pinned and local actions are accepted", () => {
  const workflow = `name: CI
jobs:
  build:
    steps:
      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
      - uses: ./tools/local-action
      - name: run
        run: echo hi
`;
  assert.deepEqual(findUnpinnedActions(workflow), []);
});

test("mutable tags, branches, and digest-less docker images are flagged", () => {
  const workflow = `jobs:
  a:
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@main
      - uses: docker://alpine:3.20
`;
  assert.deepEqual(findUnpinnedActions(workflow), [
    "actions/checkout@v6",
    "actions/setup-node@main",
    "docker://alpine:3.20",
  ]);
});

test("docker images with sha256 digests are accepted", () => {
  const workflow = `steps:
      - uses: docker://alpine@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
`;
  assert.deepEqual(findUnpinnedActions(workflow), []);
});
