import '@testing-library/jest-dom/vitest';

// Provide a minimal localStorage mock for tests running outside jsdom.
// jsdom provides its own, but node-environment tests (e.g. services) need this.
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.clear !== 'function') {
    const store = new Map<string, string>();
    globalThis.localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
        get length() { return store.size; },
        key: (index: number) => {
            const keys = Array.from(store.keys());
            return keys[index] ?? null;
        }
    } as Storage;
}
