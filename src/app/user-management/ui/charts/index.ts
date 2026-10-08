/*
 * ui/charts: Chart.js helpers that follow the ui theme. Separate from
 * index.ts so pages without charts do not load Chart.js.
 * Needs chart.js and ng2-charts installed.
 *
 * chart-colors.ts loads no Chart.js code; UiChart and syncChartTheme do.
 */

export * from './chart-colors';
export * from './chart-theme';
export * from './chart.component';
