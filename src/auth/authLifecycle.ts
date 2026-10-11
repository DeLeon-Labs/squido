export const STALE_AUTH_OPERATION = "GitHub connection changed. Reopen settings and retry.";

/** Local FIFO boundary for the entire auth operation, including credential/state writes.
 * Mutations invalidate outstanding discovery synchronously, even for A→B→A transitions.
 * A dispatched exchange still saves its replacement grant before the queued mutation runs.
 */
export class AuthLifecycle {
  private tail: Promise<unknown> = Promise.resolve();
  private paused = false;
  private active = false;
  private revision = 0;
  private transitionRevision = 0;
  get generation(): number { return this.revision; }
  get running(): boolean { return this.active; }

  constructor(private readonly enabled: () => boolean) {}

  run<T>(operation: () => Promise<T>, mutation = true): Promise<T> {
    if (this.paused || !this.enabled()) return Promise.reject(new Error(STALE_AUTH_OPERATION));
    if (mutation) this.revision++;
    const generation = this.revision;
    const transitionRevision = this.transitionRevision;
    return this.enqueue(async () => {
      if (this.paused || !this.enabled() || transitionRevision !== this.transitionRevision || (!mutation && generation !== this.revision)) throw new Error(STALE_AUTH_OPERATION);
      return operation();
    });
  }

  transition<T>(operation: () => Promise<T>): Promise<T> {
    if (this.paused) return Promise.reject(new Error(STALE_AUTH_OPERATION));
    this.revision++;
    this.transitionRevision++;
    return this.enqueue(async () => {
      if (this.paused) throw new Error(STALE_AUTH_OPERATION);
      return operation();
    });
  }

  async pause(): Promise<void> {
    this.paused = true;
    this.revision++;
    this.transitionRevision++;
    await this.tail;
  }
  resume(): void { this.paused = false; }
  assertCurrent(generation: number): void {
    if (generation !== this.revision || this.paused || !this.enabled()) throw new Error(STALE_AUTH_OPERATION);
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      this.active = true;
      try { return await operation(); } finally { this.active = false; }
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
}
