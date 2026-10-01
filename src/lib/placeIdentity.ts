import { objectValue } from './effectivePlace';
import type { CatalogDocument } from './placeAdapter';

export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
export const PUBLICATION_VISIBLE_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function isPlaceId(value: unknown): value is string {
  return typeof value === 'string' && (/^kto-[0-9]+$/.test(value)
    || (value.startsWith('owner-') && UUID_V4_PATTERN.test(value.slice(6))));
}
export function isPublicStatus(value: unknown): value is typeof PUBLICATION_VISIBLE_STATUSES[number] {
  return value === 'DRAFT' || value === 'PUBLISHED';
}
export function isPublicationStatus(value: unknown): value is PublicationStatus {
  return isPublicStatus(value) || value === 'HIDDEN';
}
export function ownerPlaceIdentity(uuid: string = crypto.randomUUID()) {
  if (!UUID_V4_PATTERN.test(uuid)) throw new Error('Invalid owner UUID v4');
  return { uuid, placeId: `owner-${uuid}`, sourceId: `owner-input-${uuid}` };
}
export function ownerInputSource(uuid: string, timestamp: unknown): Record<string, unknown> {
  const { placeId, sourceId } = ownerPlaceIdentity(uuid);
  return { placeSourceId: sourceId, placeId, source: 'OWNER_INPUT',
    sourceDataset: 'admin-place-create-v1', sourceId: uuid, sourceUpdatedAt: timestamp,
    importedAt: timestamp, verifiedAt: null, verificationStatus: 'UNVERIFIED', rawReference: null };
}
export function isCanonicalPlaceSource(place: CatalogDocument, source: CatalogDocument): boolean {
  const data = source.data;
  if (!isPlaceId(place.id) || place.path !== `places/${place.id}` || place.data.placeId !== place.id || data.placeId !== place.id
    || data.placeSourceId !== source.id || source.path !== `places/${place.id}/sources/${source.id}`
    || objectValue(place.data.search).primarySourceId !== source.id) return false;
  if (data.source === 'KTO') return /^kto-[0-9]+$/.test(place.id) && typeof data.kto === 'object' && data.kto !== null && !Array.isArray(data.kto);
  if (data.source !== 'OWNER_INPUT' || !place.id.startsWith('owner-')) return false;
  const expected = ownerInputSource(place.id.slice(6), data.importedAt);
  return Object.keys(data).length === 10 && Object.keys(expected).every((key) => key in data)
    && source.id === expected.placeSourceId && data.sourceId === expected.sourceId
    && data.sourceDataset === expected.sourceDataset && data.verificationStatus === 'UNVERIFIED'
    && data.verifiedAt === null && data.rawReference === null;
}
