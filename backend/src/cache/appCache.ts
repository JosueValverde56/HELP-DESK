// Cache en memoria con TTL — evita sobrecargar Oracle con consultas repetidas.
// Usar para stats, reportes y listados que no cambian en cada request.
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class AppCache {
  private store = new Map<string, CacheEntry<unknown>>();

  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  // Borra todas las claves que empiezan con el prefijo dado.
  invalidate(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void { this.store.clear(); }
  size(): number { return this.store.size; }
}

export const cache = new AppCache();
