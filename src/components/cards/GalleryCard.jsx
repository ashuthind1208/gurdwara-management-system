import { useState } from 'react';
import Card from '../ui/Card';
import gurdwaraLogo from '../../assets/default-gurdwara.svg';

const GalleryCard = ({ album }) => {
  const [imageSrc, setImageSrc] = useState(album.frontImage || album.cover || gurdwaraLogo);
  const previewCaption = album.images?.[0]?.caption;

  const card = (
    <Card className="overflow-hidden p-0">
      <img src={imageSrc} alt={album.title} className="h-40 w-full object-cover" loading="lazy" onError={() => setImageSrc(gurdwaraLogo)} />
      <div className="p-4">
        <h3 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">{album.title}</h3>
        {album.eventDate ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{album.eventDate}</p> : null}
        {album.description ? <p className="mt-2 text-xs text-slate-500 line-clamp-2">{album.description}</p> : previewCaption ? <p className="mt-2 text-xs text-slate-500">{previewCaption}</p> : <p className="mt-2 text-xs text-slate-500">No description added yet.</p>}
      </div>
    </Card>
  );

  return album.folderUrl ? (
    <a href={album.folderUrl} target="_blank" rel="noreferrer" aria-label={`Open ${album.title} folder in a new tab`} className="block">
      {card}
    </a>
  ) : card;
};

export default GalleryCard;
