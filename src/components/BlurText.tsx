interface Props {
  text: string;
  className?: string;
  /** Per-word stagger in ms. */
  stagger?: number;
  /** Extra delay before the first word, in ms. */
  delay?: number;
}

/**
 * Word-by-word blur-in headline. Pure CSS keyframes (see .blur-word), so it
 * costs nothing and respects prefers-reduced-motion for free.
 */
export function BlurText({ text, className = '', stagger = 70, delay = 0 }: Props) {
  return (
    <span className={className}>
      {text.split(' ').map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="blur-word"
          style={{ marginRight: '0.25em', animationDelay: `${delay + i * stagger}ms` }}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
