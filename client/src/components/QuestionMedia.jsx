const assetUrl = (url) => (url && url.startsWith('/') ? `${window.location.origin}${url}` : url);

export default function QuestionMedia({ imageUrl, audioUrl, compact = false }) {
  if (!imageUrl && !audioUrl) return null;
  return (
    <div className={`question-media${compact ? ' question-media-compact' : ''}`}>
      {imageUrl && <img src={assetUrl(imageUrl)} alt="Question visual" loading="lazy" />}
      {audioUrl && <audio controls preload="metadata" src={assetUrl(audioUrl)}>Your browser does not support audio playback.</audio>}
    </div>
  );
}
