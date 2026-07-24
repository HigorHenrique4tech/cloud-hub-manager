import { useState } from 'react';
import { Play, AlertCircle } from 'lucide-react';

export default function VideoPlayer({ url, title, durationSeconds, contentType }) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!url) {
    return (
      <div className="aspect-video rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center text-gray-500 gap-2">
        <AlertCircle className="w-6 h-6" />
        <span className="text-xs">Vídeo indisponível</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="aspect-video rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 flex flex-col items-center justify-center text-red-600 dark:text-red-400 gap-2 px-4 text-center">
        <AlertCircle className="w-6 h-6" />
        <span className="text-xs">Erro ao carregar vídeo. Atualize a página para tentar novamente.</span>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden bg-black border border-gray-200 dark:border-gray-700">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-400 z-10 pointer-events-none">
          <Play className="w-8 h-8 opacity-50" />
        </div>
      )}
      <video
        controls
        preload="metadata"
        className="w-full aspect-video"
        onLoadedMetadata={() => setLoaded(true)}
        onError={() => setError(true)}
      >
        <source src={url} type={contentType || 'video/mp4'} />
        Seu navegador não suporta reprodução de vídeo.
      </video>
    </div>
  );
}

export function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
