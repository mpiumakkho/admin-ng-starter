import { DestroyRef, DOCUMENT, inject, Signal } from '@angular/core';
import { Chart, registerables, ScriptableContext } from 'chart.js';
import type { BaseChartDirective } from 'ng2-charts';

/** Series colors that sit well on both themes, in order of use */
export const UI_CHART_PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

interface ChartColors {
  text: string;
  grid: string;
  tooltipBorder: string;
}

interface ScaleColorDefaults {
  ticks?: { color?: unknown };
  title?: { color?: unknown };
  grid?: { color?: unknown };
  border?: { color?: unknown; dash?: unknown };
}

const LIGHT: ChartColors = { text: '#64748b', grid: '#e9edf3', tooltipBorder: 'rgba(15, 23, 42, 0)' };
const DARK: ChartColors = { text: '#94a3b8', grid: 'rgba(148, 163, 184, 0.14)', tooltipBorder: 'rgba(148, 163, 184, 0.25)' };

let defaultsApplied = false;

/**
 * Keeps Chart.js text, grid lines and tooltips matching the light or dark theme, including when
 * the theme changes while the charts are on screen. Call it from a component constructor:
 *
 *   private readonly charts = viewChildren(BaseChartDirective);
 *   constructor() { syncChartTheme(this.charts); }
 *
 * The theme is read from `theme-dark` or `data-theme="dark"` on <body>, as set by UiThemeService.
 */
export function syncChartTheme(charts: Signal<readonly BaseChartDirective[]>): void {
  const document = inject(DOCUMENT);
  const body = document.body;
  applyChartDefaults(document);

  const isDark = () => body.classList.contains('theme-dark') || body.dataset['theme'] === 'dark';
  let dark = isDark();
  applyChartColors(dark ? DARK : LIGHT);

  // Chart.js copies colors into a chart when it is created, so charts on screen are rebuilt on a change
  const observer = new MutationObserver(() => {
    if (isDark() !== dark) {
      dark = isDark();
      applyChartColors(dark ? DARK : LIGHT);
      charts().forEach(chart => chart.render());
    }
  });
  observer.observe(body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  inject(DestroyRef).onDestroy(() => observer.disconnect());
}

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

/** Type, tooltips and legend markers shared by every chart. Set once. */
function applyChartDefaults(document: Document): void {
  if (defaultsApplied) {
    return;
  }
  defaultsApplied = true;

  // The tooltip and legend defaults only exist once their plugins are registered
  Chart.register(...registerables);

  const font = getComputedStyle(document.documentElement).getPropertyValue('--ui-font').trim();
  Chart.defaults.font.family = font || 'system-ui, sans-serif';
  Chart.defaults.font.size = 12;

  const tooltip = Chart.defaults.plugins.tooltip;
  tooltip.backgroundColor = '#0f172a';
  tooltip.titleColor = '#f8fafc';
  tooltip.bodyColor = '#cbd5e1';
  tooltip.titleFont = { weight: 600 };
  tooltip.padding = 10;
  tooltip.cornerRadius = 8;
  tooltip.boxPadding = 4;
  tooltip.usePointStyle = true;
  tooltip.borderWidth = 1;

  const legend = Chart.defaults.plugins.legend.labels;
  legend.usePointStyle = true;
  legend.pointStyle = 'circle';
  legend.boxWidth = 8;
  legend.boxHeight = 8;
  legend.padding = 16;

  Chart.defaults.elements.bar.borderRadius = 6;
  Chart.defaults.elements.line.tension = 0.35;
}

function applyChartColors(colors: ChartColors): void {
  Chart.defaults.color = colors.text;
  Chart.defaults.borderColor = colors.grid;
  Chart.defaults.plugins.tooltip.borderColor = colors.tooltipBorder;

  // Each scale type copies the base colors when it is registered, so the copies are set too
  for (const scale of Object.values(Chart.defaults.scales) as ScaleColorDefaults[]) {
    if (scale.ticks) {
      scale.ticks.color = colors.text;
    }
    if (scale.title) {
      scale.title.color = colors.text;
    }
    if (scale.grid) {
      scale.grid.color = colors.grid;
    }
    if (scale.border) {
      scale.border.color = colors.grid;
      scale.border.dash = [4, 4];
    }
  }
}
