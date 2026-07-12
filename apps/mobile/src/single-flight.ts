export class SingleFlight {
  private current: Promise<void> | null = null;
  private closed = false;

  run(operation: () => Promise<void>): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.current) return this.current;

    const execution = Promise.resolve().then(operation);
    this.current = execution.finally(() => {
      if (this.current === execution || this.current === wrapped) this.current = null;
    });
    const wrapped = this.current;
    return wrapped;
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.current?.catch(() => undefined);
  }
}
