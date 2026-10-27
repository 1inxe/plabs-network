import { useQuery } from '@tanstack/react-query';
import { Gem } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadNftImage, loadNftManifest, type NftCollection } from '@/services/platform/nft-launch';

export function useNftManifest(collection: NftCollection) {
  return useQuery({
    queryKey: ['nft', 'manifest', collection.pool, collection.metadataManifestHash],
    queryFn: ({ signal }) => loadNftManifest(collection, signal),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
export function NftArtwork({
  collection,
  tokenId,
}: {
  collection: NftCollection;
  tokenId?: string;
}) {
  const manifest = useNftManifest(collection);
  const entry = tokenId ? manifest.data?.tokens[tokenId] : manifest.data?.collection;
  const artwork = useQuery({
    queryKey: ['nft', 'image', entry?.thumbnail_sha256],
    enabled: !!entry,
    queryFn: ({ signal }) => {
      if (!entry) throw new Error('Artwork unavailable.');
      return loadNftImage(entry, signal);
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const [url, setUrl] = useState('');
  useEffect(() => {
    setUrl('');
    if (!artwork.data) return;
    const value = URL.createObjectURL(artwork.data.image);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [artwork.data]);
  return url ? (
    <img
      src={url}
      alt={`${collection.name}${tokenId ? ` #${tokenId}` : ' collection artwork'}`}
      loading="lazy"
    />
  ) : (
    <div className="nft-launch-placeholder">
      <Gem aria-hidden="true" size={32} />
      <span>
        {manifest.isError || artwork.isError ? 'Artwork unavailable' : 'Loading artwork…'}
      </span>
    </div>
  );
}
