import { useState, type ImgHTMLAttributes } from 'react';
import type { Place } from '../types';
import { PLACEHOLDER_IMAGE } from '../lib/placeAdapter';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & { place: Place };
function ImageWithFallback({ place, alt, ...props }: Props) {
  const [index, setIndex] = useState(0);
  const urls = [...new Set([...(place.imageFallbackUrls ?? [place.imageUrl]), PLACEHOLDER_IMAGE])];
  return <img {...props} src={urls[index]} alt={urls[index] === PLACEHOLDER_IMAGE ? `${place.name} — 사진 미제공` : alt ?? place.name}
    onError={() => setIndex((current) => Math.min(current + 1, urls.length - 1))} />;
}
export default function PlaceImage(props: Props) {
  return <ImageWithFallback key={`${props.place.id}:${props.place.imageFallbackUrls?.join('|') ?? props.place.imageUrl}`} {...props} />;
}
