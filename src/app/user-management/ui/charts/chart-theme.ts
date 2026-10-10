import { DestroyRef, DOCUMENT, inject, Signal } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import type { BaseChartDirective } from 'ng2-charts';

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
/** The accessible view (UiAccessibleViewService): axis text at 7:1 or more, as all its text (WCAG 1.4.6) */
const LIGHT_AAA: ChartColors = { ...LIGHT, text: '#334155', grid: '#d5dce5' };
const DARK_AAA: ChartColors = { ...DARK, text: '#e2e8f0', grid: 'rgba(148, 163, 184, 0.3)' };

let defaultsApplied = false;
/** Chart.js's own animation settings, for turning them back on after the accessible view */
let defaultAnimation: typeof Chart.defaults.animation;
let reducedMotion = false;

/**
 * Keeps Chart.js text, grid lines and tooltips matching the light or dark theme, including when
 * the theme changes while the charts are on screen. Call it from a component constructor:
 *
 *   private readonly charts = viewChildren(BaseChartDirective);
 *   constructor() { syncChartTheme(this.charts); }
 *
 * The theme is read from `theme-dark` or `data-theme="dark"` on <body>, as set by UiThemeService, and the
 * accessible view from `ui-aaa`, as set by UiAccessibleViewService: stronger text, and nothing animates.
 */
export function syncChartTheme(charts: Signal<readonly BaseChartDirective[]>): void {
  const document = inject(DOCUMENT);
  const body = document.body;
  applyChartDefaults(document);

  const look = () => {
    const dark = body.classList.contains('theme-dark') || body.dataset['theme'] === 'dark';
    return body.classList.contains('ui-aaa') ? (dark ? DARK_AAA : LIGHT_AAA) : (dark ? DARK : LIGHT);
  };
  let current = look();
  applyChartColors(current);

  // Chart.js copies colors into a chart when it is created, so charts on screen are rebuilt on a change
  const observer = new MutationObserver(() => {
    if (look() !== current) {
      current = look();
      applyChartColors(current);
      charts().forEach(chart => chart.render());
    }
  });
  observer.observe(body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  inject(DestroyRef).onDestroy(() => observer.disconnect());
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

  defaultAnimation = Chart.defaults.animation;
  reducedMotion = !!document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function applyChartColors(colors: ChartColors): void {
  // Bars and lines appear at once when the system asks for less motion, and in the accessible view (WCAG 2.3.3)
  Chart.defaults.animation = reducedMotion || colors === LIGHT_AAA || colors === DARK_AAA ? false : defaultAnimation;
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
