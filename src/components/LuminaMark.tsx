/**
 * The Lumina Study mark: a hexagonal badge with a branching mint "growth"
 * line on deep indigo — an original SVG interpretation of the reference
 * logo's shape language (hexagon + tree/branch), not a copy of its artwork.
 */
export function LuminaMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path
        d="M20 2 35.3 11v18L20 38 4.7 29V11Z"
        fill="var(--primary-container)"
      />
      <path
        d="M20 10v20M20 10c0 4-5 5-5 9M20 10c0 3 4 4 4 7"
        stroke="var(--secondary-fixed)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
