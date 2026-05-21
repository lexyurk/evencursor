type Handler<T> = (payload: T) => void;

export class Emitter<TEvents extends Record<string, unknown>> {
  private readonly listeners = new Map<
    keyof TEvents,
    Set<Handler<TEvents[keyof TEvents]>>
  >();

  on<K extends keyof TEvents>(
    event: K,
    handler: Handler<TEvents[K]>
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<TEvents[keyof TEvents]>);
    return () => this.off(event, handler);
  }

  off<K extends keyof TEvents>(
    event: K,
    handler: Handler<TEvents[K]>
  ): void {
    this.listeners.get(event)?.delete(handler as Handler<TEvents[keyof TEvents]>);
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      (handler as Handler<TEvents[K]>)(payload);
    }
  }
}
