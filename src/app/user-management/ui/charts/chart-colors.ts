import type { ScriptableContext } from 'chart.js';

/*
 * Colors for chart data. Only types come from Chart.js here, so a page can build its chart data without loading
 * Chart.js; UiChart loads it when the chart is drawn.
 */

/** Series colors that sit well on both themes, in order of use */
export const UI_CHART_PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

/**
 * A vertical fade from `color` to transparent, for the area under a line.
 *
 *   { data, borderColor: '#6366f1', backgroundColor: areaFill('#6366f1'), fill: true }
 */
export function areaFill(color: string, opacity = 0.22) {
  const rgb = hexToRgb(color);
  return ({ chart }: ScriptableContext<'line'>) => {
    const { ctx, chartArea } = chart;
    if (!chartArea) {
      return 'transparent';
    }
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, `rgba(${rgb}, ${opacity})`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    return gradient;
  };
}

function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map(char => char + char).join('') : value;
  const number = parseInt(full, 16);
  return `${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}`;
}
