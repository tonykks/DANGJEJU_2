export const PET_DETAIL_FIELDS = [
  ['acmpyTypeCd', '동반 유형'],
  ['acmpyNeedMtr', '동반 시 필요 사항'],
  ['acmpyPsblCpam', '동반 가능 동물'],
  ['etcAcmpyInfo', '기타 동반 안내'],
  ['relaAcdntRiskMtr', '관련 사고 위험 사항'],
  ['relaFrnshPrdlst', '비치 품목'],
  ['relaPosesFclty', '보유 시설'],
  ['relaPurcPrdlst', '구매 가능 품목'],
  ['relaRntlPrdlst', '대여 가능 품목'],
] as const;

export type PetDetailKey = typeof PET_DETAIL_FIELDS[number][0];

export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function trimmedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function stringValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(trimmedText).filter(Boolean)
    : [];
}

export function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function manualClearedFields(place: Record<string, unknown>): Set<string> {
  return new Set(stringValues(objectValue(place.manualAdmin).clearedFields));
}

export function isManuallyCleared(place: Record<string, unknown>, field: string): boolean {
  return manualClearedFields(place).has(field);
}

export function effectiveText(
  place: Record<string, unknown>,
  field: string,
  ...fallbacks: unknown[]
): string {
  if (isManuallyCleared(place, field)) return '';
  const serviceValue = trimmedText(place[field]);
  if (serviceValue) return serviceValue;
  for (const fallback of fallbacks) {
    const candidate = trimmedText(fallback);
    if (candidate) return candidate;
  }
  return '';
}

export function effectiveNumber(
  place: Record<string, unknown>,
  field: string,
  ...fallbacks: unknown[]
): number | null {
  if (isManuallyCleared(place, field)) return null;
  for (const value of [place[field], ...fallbacks]) {
    if (typeof value === 'boolean' || value === null || value === undefined) continue;
    if (typeof value === 'number') {
      if (Number.isFinite(value)) return value;
      continue;
    }
    if (typeof value !== 'string') continue;
    const raw = value.trim();
    if (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(raw)) continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function effectiveList(place: Record<string, unknown>, field: string): string[] | null {
  if (isManuallyCleared(place, field)) return [];
  if (!Array.isArray(place[field])) return null;
  return stringValues(place[field]);
}

export type EffectivePetDetail = {
  key: PetDetailKey;
  label: string;
  value: string;
  source: 'ADMIN' | 'KTO';
};

export function effectivePetDetails(
  place: Record<string, unknown>,
  source: Record<string, unknown>,
): EffectivePetDetail[] {
  const ktoPet = objectValue(objectValue(source.kto).pet);
  const overrides = objectValue(objectValue(place.adminOverrides).petDetails);
  const details: EffectivePetDetail[] = [];
  for (const [key, label] of PET_DETAIL_FIELDS) {
    if (hasOwn(overrides, key)) {
      const value = trimmedText(overrides[key]);
      if (value) details.push({ key, label, value, source: 'ADMIN' });
      continue;
    }
    const value = trimmedText(ktoPet[key]);
    if (value) details.push({ key, label, value, source: 'KTO' });
  }
  return details;
}

export function hasPetDetailOverrides(place: Record<string, unknown>): boolean {
  const overrides = objectValue(objectValue(place.adminOverrides).petDetails);
  return PET_DETAIL_FIELDS.some(([key]) => hasOwn(overrides, key));
}

export function normalizeHttpUrl(value: unknown): string {
  const candidate = trimmedText(value);
  if (!/^https?:\/\//i.test(candidate)) return '';
  return candidate.replace(/^http:/i, 'https:');
}
