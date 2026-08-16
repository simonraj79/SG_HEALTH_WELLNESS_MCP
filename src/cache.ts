interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache {
  readonly #entries = new Map<string, CacheEntry<unknown>>();
  readonly #pending = new Map<string, Promise<unknown>>();

  async getOrLoad<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.#entries.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }

    const inFlight = this.#pending.get(key);
    if (inFlight) {
      return inFlight as Promise<T>;
    }

    const promise = loader()
      .then((value) => {
        this.#entries.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      })
      .finally(() => {
        this.#pending.delete(key);
      });

    this.#pending.set(key, promise);
    return promise;
  }

  clear(): void {
    this.#entries.clear();
  }
}
