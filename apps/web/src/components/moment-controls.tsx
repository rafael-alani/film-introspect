import { useState } from "react";
import {
  momentRatings,
  noteColors,
  type NoteColor,
} from "@film-introspect/contracts";

export function MomentControls({
  color,
  rating,
  disabled,
  onColor,
  onRating,
}: {
  color?: NoteColor;
  rating?: number | null;
  disabled: boolean;
  onColor: (color: NoteColor) => void;
  onRating: (rating: number) => void;
}) {
  const [hint, setHint] = useState<number | null>(null);
  const describedRating = momentRatings.find(
    (item) => item.value === (hint ?? rating),
  );
  return (
    <div className="moment-controls">
      <div className="moment-colors" role="group" aria-label="Moment color">
        {noteColors.map((item) => (
          <button
            type="button"
            key={item.value}
            className={`moment-color note-${item.value}`}
            aria-label={`${item.name}: ${item.label}`}
            aria-pressed={
              color === undefined ? undefined : color === item.value
            }
            title={item.meaning}
            disabled={disabled}
            onClick={() => onColor(item.value)}
          >
            <span aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </div>
      <div className="moment-rating-heading">Rate this moment</div>
      <div className="moment-ratings" role="group" aria-label="Moment rating">
        {momentRatings.map((item) => (
          <button
            type="button"
            key={item.value}
            aria-label={`${item.value}: ${item.label}`}
            aria-pressed={
              rating === undefined ? undefined : rating === item.value
            }
            disabled={disabled}
            onFocus={() => setHint(item.value)}
            onBlur={() => setHint(null)}
            onMouseEnter={() => setHint(item.value)}
            onMouseLeave={() => setHint(null)}
            onClick={() => onRating(item.value)}
          >
            {item.value}
          </button>
        ))}
      </div>
      <div className="moment-rating-hint">
        {describedRating
          ? `${describedRating.value} · ${describedRating.label}`
          : "10 Perfect · 5 Ok · 1 Crime against humanity"}
      </div>
    </div>
  );
}

export function MomentGuide() {
  return (
    <details className="moment-guide">
      <summary>Color meanings & rating scale</summary>
      <h3>On matters of color coding</h3>
      <p>Zotero notes, carried into film moments.</p>
      <dl>
        {noteColors.map((item) => (
          <div key={item.value}>
            <dt>
              {item.name} · {item.label}
            </dt>
            <dd>{item.meaning}</dd>
          </div>
        ))}
      </dl>
      <h3>On matters of scoring / rating</h3>
      <p>Use this film scale for individual moments, too.</p>
      <dl>
        {momentRatings.map((item) => (
          <div key={item.value}>
            <dt>
              {item.value} · {item.label}
            </dt>
            {item.meaning && <dd>{item.meaning}</dd>}
          </div>
        ))}
      </dl>
    </details>
  );
}
