import { Component, input, viewChildren } from '@angular/core';
import type { ChartData, ChartOptions, ChartType } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { syncChartTheme } from './chart-theme';

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
 * charts whose numbers are shown next to them.
 */
@Component({
  selector: 'ui-chart',
  imports: [BaseChartDirective],
  template: `
    <canvas baseChart [type]="type()" [data]="data()" [options]="options()"
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

  constructor() {
    syncChartTheme(this.charts);
  }
}
