import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  contentChild,
  Directive,
  effect,
  ElementRef,
  input,
  model,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';

import { UiButton } from '../button/button.component';

/** Marks the button row at the bottom of a dialog */
@Directive({ selector: '[uiDialogFooter]' })
export class UiDialogFooter {}

/**
 * A modal dialog on the native <dialog> element: focus stays inside, Escape closes it.
 *
 *   <ui-dialog [(open)]="editing" title="Edit role" description="Change its name and description">
 *     ...form...
 *     <div uiDialogFooter>
 *       <button uiButton variant="secondary" (click)="editing.set(false)">Cancel</button>
 *       <button uiButton (click)="save()">Save</button>
 *     </div>
 *   </ui-dialog>
 */
@Component({
  selector: 'ui-dialog',
  imports: [NgIcon, UiButton],
  template: `
    <dialog #dialog class="ui-dialog" [class]="'ui-dialog ui-dialog-' + size()" [attr.aria-labelledby]="titleId" (cancel)="cancel($event)" (close)="closed()" (click)="closeOnBackdrop($event)">
      <div class="ui-dialog-panel">
        <header class="ui-dialog-head">
          <div>
            <h2 class="ui-dialog-title" [id]="titleId">{{ title() }}</h2>
            @if (description()) {
              <p class="ui-dialog-description">{{ description() }}</p>
            }
          </div>
          @if (dismissible()) {
            <button uiButton variant="ghost" size="sm" iconOnly type="button" [attr.aria-label]="closeLabel()" (click)="open.set(false)">
              <ng-icon [svg]="closeIcon" />
            </button>
          }
        </header>
        <div class="ui-dialog-body">
          <ng-content />
        </div>
        @if (footer()) {
          <footer class="ui-dialog-foot">
            <ng-content select="[uiDialogFooter]" />
          </footer>
        }
      </div>
    </dialog>
  `,
  styleUrl: './dialog.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiDialog {
  private static nextId = 0;

  readonly open = model(false);
  readonly title = input('');
  readonly description = input('');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly closeLabel = input('Close');
  /**
   * Close with Escape, the close button or a click on the dimmed area around the dialog. Without it, only the
   * dialog's own buttons close it, for a question that must be answered.
   */
  readonly dismissible = input(true, { transform: booleanAttribute });

  protected readonly titleId = `ui-dialog-title-${UiDialog.nextId++}`;
  protected readonly closeIcon = lucideX;
  protected readonly footer = contentChild(UiDialogFooter);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) {
        element.showModal();
      } else if (!this.open() && element.open) {
        element.close();
      }
    });
  }

  protected cancel(event: Event) {
    if (!this.dismissible()) {
      event.preventDefault();
    }
  }

  protected closed() {
    // The browser can still close a modal on a second Escape; one that must be answered opens again
    if (!this.dismissible() && this.open()) {
      this.dialog().nativeElement.showModal();
    } else {
      this.open.set(false);
    }
  }

  protected closeOnBackdrop(event: MouseEvent) {
    // The panel fills the dialog box, so a click that lands on the <dialog> itself is on the backdrop
    if (this.dismissible() && event.target === this.dialog().nativeElement) {
      this.open.set(false);
    }
  }
}
