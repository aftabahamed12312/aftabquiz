const backendUrl = import.meta.env.VITE_API_URL || window.location.origin;

function assetUrl(url) {
  if (!url) return url;
  return url.startsWith('/') ? `${backendUrl}${url}` : url;
}

function optimizedUrl(url, width) {
  const source = assetUrl(url);
  if (!source) return source;

  try {
    const parsed = new URL(source, window.location.origin);
    const backendOrigin = new URL(backendUrl, window.location.origin).origin;
    if (parsed.origin !== window.location.origin && parsed.origin !== backendOrigin) return source;
    return `/.netlify/images?url=${encodeURIComponent(parsed.href)}&w=${width}&q=75`;
  } catch {
    return source;
  }
}

export default function QuestionMedia({ imageUrl, audioUrl, compact = false }) {
  if (!imageUrl && !audioUrl) return null;
  const imageWidth = compact ? 260 : 720;
  const imageSrc = optimizedUrl(imageUrl, imageWidth);
  const imageSrcSet = !compact && imageSrc.startsWith('/.netlify/images?')
    ? `${optimizedUrl(imageUrl, 720)} 1x, ${optimizedUrl(imageUrl, 1440)} 2x`
    : undefined;

  return (
    <div className={`question-media${compact ? ' question-media-compact' : ''}`}>
      {imageUrl && (
        <img
          src={imageSrc}
          srcSet={imageSrcSet}
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
