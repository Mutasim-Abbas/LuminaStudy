import { useMemo } from 'react';
import { heatmapCells, type ActivityState, type HeatmapCell } from '../engine/activity';

/**
 * A calendar heatmap of study activity — one square per day, columns are weeks.
 * Squares are shaded against the user's own busiest day, so the chart stays
 * legible whether they review 5 cards a day or 500.
 */

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

/** Tailwind ships grid-rows-1..6 only, so the 7-day column is set explicitly. */
const SEVEN_ROWS = { gridTemplateRows: 'repeat(7, minmax(0, 1fr))' } as const;

/** Opacity ramp for levels 1-4; level 0 falls back to a neutral surface. */
const LEVEL_OPACITY: Record<number, number> = { 1: 0.3, 2: 0.5, 3: 0.75, 4: 1 };

function cellStyle(level: HeatmapCell['level']) {
  if (level === 0) return { backgroundColor: 'var(--surface-container-high)' };
  return { backgroundColor: 'var(--secondary)', opacity: LEVEL_OPACITY[level] };
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function StudyHeatmap({ activity, days = 91 }: { activity: ActivityState; days?: number }) {
  const { columns, total, activeDayCount } = useMemo(() => {
    const cells = heatmapCells(activity, days);

    // Pad the front so every column is a full Sun-Sat week.
    const first = cells[0];
    const [fy, fm, fd] = first.date.split('-').map(Number);
    const leadingBlanks = new Date(fy, fm - 1, fd).getDay();

    const padded: (HeatmapCell | null)[] = [...Array(leadingBlanks).fill(null), ...cells];
    const cols: (HeatmapCell | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) cols.push(padded.slice(i, i + 7));

    return {
      columns: cols,
      total: cells.reduce((sum, c) => sum + c.count, 0),
      activeDayCount: cells.filter((c) => c.count > 0).length,
    };
  }, [activity, days]);

  return (
    <section
      aria-label="Study activity over the last three months"
      className="rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-soft"
    >
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-title-lg text-on-surface">Study Activity</h3>
        <p className="font-label-sm text-label-sm text-on-surface-variant">
          {total > 0
            ? `${total.toLocaleString('en-US')} reviews across ${activeDayCount} ${activeDayCount === 1 ? 'day' : 'days'}`
            : 'No activity yet — your first session will show up here'}
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {/* Weekday gutter */}
        <div style={SEVEN_ROWS} className="grid shrink-0 gap-[3px] pr-1">
          {WEEKDAY_LABELS.map((label, i) => (
            <span
              key={i}
              className="flex h-3 items-center font-label-sm text-[10px] leading-none text-on-surface-variant"
            >
              {label}
            </span>
          ))}
        </div>

        {/* Week columns */}
        <div className="flex gap-[3px]">
          {columns.map((week, wi) => (
            <div key={wi} style={SEVEN_ROWS} className="grid gap-[3px]">
              {week.map((cell, di) =>
                cell ? (
                  <div
                    key={cell.date}
                    style={cellStyle(cell.level)}
                    className="h-3 w-3 rounded-[3px] transition-transform hover:scale-125"
                    title={`${formatDate(cell.date)} — ${cell.count} ${cell.count === 1 ? 'review' : 'reviews'}`}
                  />
                ) : (
                  <div key={`blank-${di}`} className="h-3 w-3" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="font-label-sm text-[10px] text-on-surface-variant">Less</span>
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <div key={level} style={cellStyle(level)} className="h-3 w-3 rounded-[3px]" />
        ))}
        <span className="font-label-sm text-[10px] text-on-surface-variant">More</span>
      </div>
    </section>
  );
}
