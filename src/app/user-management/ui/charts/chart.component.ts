import { Component, computed, inject, input, viewChildren } from '@angular/core';
import { Chart, type ChartData, type ChartOptions, type ChartType, type Plugin } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { UiAccessibleViewService } from '../theme/accessible-view.service';
import { syncChartTheme } from './chart-theme';

/** Room above the tallest bar for its number */
const VALUE_ROOM = 20;

/**
 * Writes each bar's number above it, so reading one does not take hovering a bar with the mouse (the accessible view,
 * WCAG 2.1.3), in the color of the axis text
 */
const BAR_VALUES: Plugin = {
  id: 'uiBarValues',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = String(Chart.defaults.color);
    ctx.font = `600 12px ${Chart.defaults.font.family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    chart.data.datasets.forEach((dataset, index) => {
      const meta = chart.getDatasetMeta(index);
      if (meta.type === 'bar' && chart.isDatasetVisible(index)) {
        meta.data.forEach((bar, item) => ctx.fillText(String(dataset.data[item] ?? ''), bar.x, bar.y - 4));
      }
    });
    ctx.restore();
  },
};

/**
 * A Chart.js chart that follows the light or dark theme. It brings Chart.js with it, so put it in a @defer block and
 * the page opens without waiting for Chart.js:
 *
 *   @defer (on viewport) {
 *     <ui-chart type="bar" [data]="data()" [options]="options" [label]="summary()" />
 *   } @placeholder {
 *     <div></div>
 *   }
 *
 * Import it from its own line ('ui/charts/chart.component'): Angular defers a component only when nothing else in
 * the same import line is used outside @defer.
 *
 * With a label the chart is an image with that text for screen readers; without one it is hidden from them, for
 * charts whose numbers are shown next to them. In the accessible view a bar chart writes its numbers on the bars.
 */
@Component({
  selector: 'ui-chart',
  imports: [BaseChartDirective],
  template: `
    <canvas baseChart [type]="type()" [data]="data()" [options]="chartOptions()" [plugins]="plugins()"
      [attr.role]="label() ? 'img' : null" [attr.aria-label]="label() || null" [attr.aria-hidden]="label() ? null : 'true'"></canvas>
  `,
  // Chart.js sizes the canvas from this box: it fills a box of fixed height, or takes the chart's own aspect ratio
  styles: `:host { display: block; position: relative; height: 100%; min-width: 0; }`,
})
export class UiChart<TType extends ChartType = ChartType> {
  readonly type = input.required<TType>();
  readonly data = input.required<ChartData<TType>>();
  readonly options = input<ChartOptions<TType>>();
  readonly label = input<string>();

  private readonly charts = viewChildren(BaseChartDirective);
  private readonly accessibleView = inject(UiAccessibleViewService);
  private readonly barValues = computed(() => this.accessibleView.on() && this.type() === 'bar');

  protected readonly plugins = computed(() => (this.barValues() ? [BAR_VALUES] : []) as Plugin<TType>[]);
  protected readonly chartOptions = computed(() => {
    const options = this.options();
    if (!this.barValues()) {
      return options;
    }
    const layout = (options as ChartOptions<'bar'> | undefined)?.layout;
    return { ...options, layout: { ...layout, padding: { top: VALUE_ROOM } } } as ChartOptions<TType>;
  });

  constructor() {
    syncChartTheme(this.charts);
  }
}
