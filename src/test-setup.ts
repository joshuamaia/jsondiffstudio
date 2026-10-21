/** Complementos do ambiente jsdom usados pelos componentes. */
if (typeof globalThis.CSS === 'undefined' || typeof globalThis.CSS.escape !== 'function') {
  (globalThis as { CSS?: Partial<typeof CSS> }).CSS = {
    ...(globalThis.CSS ?? {}),
    escape: (value: string) => value.replace(/["\\]\[#.:]/g, '\$&'),
  };
}
