import assert from "node:assert/strict";
import test from "node:test";
import { SingleFlight } from "../src/single-flight.ts";

test("overlapping synchronization requests share one execution", async () => {
  const flight = new SingleFlight();
  let executions = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const first = flight.run(async () => {
    executions += 1;
    await gate;
  });
  const second = flight.run(async () => {
    executions += 1;
  });

  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(executions, 1);
  release();
  await Promise.all([first, second]);
});

test("a later synchronization starts after the prior execution settles", async () => {
  const flight = new SingleFlight();
  let executions = 0;
  await flight.run(async () => {
    executions += 1;
  });
  await flight.run(async () => {
    executions += 1;
  });
  assert.equal(executions, 2);
});

test("close waits for the active operation and suppresses future work", async () => {
  const flight = new SingleFlight();
  let release!: () => void;
  let finished = false;
  let afterCloseExecutions = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const running = flight.run(async () => {
    await gate;
    finished = true;
  });
  const closing = flight.close();
  await Promise.resolve();
  assert.equal(finished, false);
  release();
  await Promise.all([running, closing]);
  assert.equal(finished, true);

  await flight.run(async () => {
    afterCloseExecutions += 1;
  });
  assert.equal(afterCloseExecutions, 0);
});

test("close absorbs an in-flight failure while callers still observe it", async () => {
  const flight = new SingleFlight();
  const running = flight.run(async () => {
    throw new Error("sync failed");
  });
  await flight.close();
  await assert.rejects(running, /sync failed/);
});
