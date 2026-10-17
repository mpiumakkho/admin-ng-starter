import {
  afterNextRender, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, Injector, linkedSignal, signal, untracked, viewChild,
} from '@angular/core';

import { ClinicUi, SheetKind, SheetState } from '../clinic-ui';
import { EstimateSheet, NotesSheet, OwnerSheet, PatientSheet, ResultsPreviewSheet, VisitSheet } from './patient-sheets';
import { AppointmentSheet, NewOrderSheet, OrderSheet, PrescriptionSheet, ResultSheet } from './record-sheets';

/** Widths of the sheets, as in the design: sm 396, md 460, lg 600 pixels */
const SHEET_WIDTH: Record<SheetKind, number> = {
  visit: 396, notes: 396, results: 396, result: 396, order: 396, appointment: 396,
  owner: 460, patient: 460, newOrder: 460,
  prescription: 600, estimate: 600,
};

/**
 * The side sheet (L3) and the scrim behind it: one at a time, over the tab and beside the context rail. A new sheet is
 * drawn out of sight first and slides out a frame later, so drawing it never eats into the slide; it keeps the last
 * sheet while it slides away. Focus moves in when it opens, Escape closes it, and focus goes back to where it was.
 */
@Component({
  selector: 'cl-sheet-host',
  imports: [
    VisitSheet, PatientSheet, OwnerSheet, NotesSheet, ResultsPreviewSheet, EstimateSheet,
    ResultSheet, OrderSheet, AppointmentSheet, PrescriptionSheet, NewOrderSheet,
  ],
  template: `
    <div class="scrim" [class.show]="out()" (click)="ui.closeSheet()" aria-hidden="true"></div>
    <aside #panel class="sheet" [class.drawn]="!!ui.sheet()" [class.open]="out()" [inert]="!ui.sheet()" tabindex="-1" [style.--sheet-w.px]="width()"
      [attr.aria-labelledby]="ui.sheet() ? 'clinic-sheet-title' : null">
      @if (shown(); as sheet) {
        @switch (sheet.kind) {
          @case ('visit') { <cl-visit-sheet /> }
          @case ('patient') { <cl-patient-sheet [tab]="sheet.tab || 'overview'" /> }
          @case ('owner') { <cl-owner-sheet [tab]="sheet.tab || 'contact'" /> }
          @case ('notes') { <cl-notes-sheet /> }
          @case ('results') { <cl-results-preview-sheet /> }
          @case ('estimate') { <cl-estimate-sheet /> }
          @case ('result') { <cl-result-sheet [id]="sheet.id ?? ''" /> }
          @case ('order') { <cl-order-sheet [id]="sheet.id ?? ''" /> }
          @case ('appointment') { <cl-appointment-sheet [id]="sheet.id ?? ''" /> }
          @case ('prescription') { <cl-prescription-sheet [id]="sheet.id ?? ''" /> }
          @case ('newOrder') { <cl-new-order-sheet /> }
        }
      }
    </aside>
  `,
  host: { class: 'contents' },
})
export class SheetHost {
  protected readonly ui = inject(ClinicUi);
  private readonly injector = inject(Injector);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  /** The open sheet, or the last one while it slides away */
  protected readonly shown = linkedSignal<SheetState | null, SheetState | null>({
    source: this.ui.sheet,
    computation: (sheet, previous) => sheet ?? previous?.value ?? null,
  });
  protected readonly width = computed(() => SHEET_WIDTH[this.shown()?.kind ?? 'visit']);

  /** Out on the screen: a frame after the open sheet is drawn; back in at once when it closes */
  protected readonly out = signal(false);

  private opener: HTMLElement | null = null;
  private frame = 0;

  /** Escape closes the sheet wherever focus is, unless a dialog is open, which Escape closes first */
  @HostListener('document:keydown.escape')
  protected escape() {
    if (this.ui.sheet() && !document.querySelector('dialog[open]')) {
      this.ui.closeSheet();
    }
  }

  constructor() {
    let wasOpen = false;
    effect(() => {
      const open = !!this.ui.sheet();
      untracked(() => {
        if (open && !wasOpen) {
          this.opener = document.activeElement as HTMLElement | null;
          afterNextRender(() => {
            this.frame = requestAnimationFrame(() => {
              if (this.ui.sheet()) {
                this.out.set(true);
                // Without preventScroll the browser scrolls the workspace sideways to show the sheet still sliding in
                this.panel().nativeElement.focus({ preventScroll: true });
              }
            });
          }, { injector: this.injector });
        } else if (!open && wasOpen) {
          cancelAnimationFrame(this.frame);
          this.out.set(false);
          // Back to where it was opened from, when focus was inside the sheet
          if (this.panel().nativeElement.contains(document.activeElement) && this.opener?.isConnected) {
            this.opener.focus();
          }
          this.opener = null;
        }
        wasOpen = open;
      });
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }
}
