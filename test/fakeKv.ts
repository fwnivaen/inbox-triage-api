/** Minimal in-memory stand-in for KVNamespace, enough for unit tests that
 * never need real TTL expiry (expirationTtl is accepted and ignored). */
export function fakeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}
