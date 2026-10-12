const backendUrl = import.meta.env.VITE_API_URL || window.location.origin;

function assetUrl(url) {
  if (!url) return url;
  return url.startsWith('/') ? `${backendUrl}${url}` : url;
}

export default function QuestionMedia({ imageUrl, audioUrl, compact = false }) {
  if (!imageUrl && !audioUrl) return null;

  return (
    <div className={`question-media${compact ? ' question-media-compact' : ''}`}>
      {imageUrl && (
        <img
          src={assetUrl(imageUrl)}
          sizes={compact ? '260px' : '(max-width: 720px) 100vw, 720px'}
          width={compact ? 260 : 720}
          height={compact ? 130 : 360}
          alt="Question visual"
          loading={compact ? 'lazy' : 'eager'}
          fetchPriority={compact ? 'auto' : 'high'}
        />
      )}
      {audioUrl && <audio controls preload="metadata" src={assetUrl(audioUrl)}>Your browser does not support audio playback.</audio>}
    </div>
  );
}
