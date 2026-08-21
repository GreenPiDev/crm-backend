// Ürünte satılan modüllerin statik kataloğu. Yeni bir modül eklemek bilinçli
// bir kod değişikliğidir (buraya bir satır eklemek); tenant entitlement'ları
// (kimin hangi modülü kullandığı) ise DB'de dinamik tutulur (bkz. tenant-modules).
export const MODULE_CATALOG = [
  { key: 'accounts', label: 'Firmalar' },
  { key: 'contacts', label: 'Kişiler' },
] as const;

export type ModuleKey = (typeof MODULE_CATALOG)[number]['key'];

export const MODULE_KEYS: ModuleKey[] = MODULE_CATALOG.map((m) => m.key);

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as string[]).includes(value);
}
