export class SingleFlight {
  private current: Promise<void> | null = null;
  private closed = false;

  run(operation: () => Promise<void>): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.current) return this.current;

    const execution = Promise.resolve().then(operation);
    let tracked!: Promise<void>;
    tracked = execution.finally(() => {
      if (this.current === tracked) this.current = null;
    });
    this.current = tracked;
    return tracked;
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.current?.catch(() => undefined);
  }
}
