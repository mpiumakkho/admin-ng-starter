import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  createComponent,
  DOCUMENT,
  EnvironmentInjector,
  inject,
  Injectable,
  input,
  model,
  output,
} from '@angular/core';

import { UiButton } from '../button/button.component';
import { UiDialog, UiDialogFooter } from './dialog.component';

export interface UiConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` paints the confirm button red, for deleting and other actions that cannot be undone */
  tone?: 'primary' | 'danger';
}

@Component({
  selector: 'ui-confirm-dialog',
  imports: [UiDialog, UiDialogFooter, UiButton],
  template: `
    <ui-dialog [(open)]="open" [title]="options().title" [description]="options().message ?? ''" size="sm" (openChange)="!$event && answer(false)">
      <div uiDialogFooter>
        <button uiButton variant="secondary" type="button" (click)="answer(false)">{{ options().cancelLabel ?? 'Cancel' }}</button>
        <button uiButton type="button" [variant]="options().tone === 'danger' ? 'danger' : 'primary'" (click)="answer(true)">{{ options().confirmLabel ?? 'Confirm' }}</button>
      </div>
    </ui-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class UiConfirmDialog {
  readonly options = input.required<UiConfirmOptions>();
  readonly answered = output<boolean>();
  protected readonly open = model(true);
  private done = false;

  protected answer(confirmed: boolean) {
    if (!this.done) {
      this.done = true;
      this.open.set(false);
      this.answered.emit(confirmed);
    }
  }
}

/**
 * Ask a yes/no question in a modal dialog.
 *
 *   if (await this.confirm.ask({ title: 'Delete 3 users?', message: 'This cannot be undone.', tone: 'danger', confirmLabel: 'Delete' })) { ... }
 */
@Injectable({ providedIn: 'root' })
export class UiConfirmService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly document = inject(DOCUMENT);

  ask(options: UiConfirmOptions): Promise<boolean> {
    return new Promise(resolve => {
      const ref = createComponent(UiConfirmDialog, { environmentInjector: this.injector });
      ref.setInput('options', options);
      this.appRef.attachView(ref.hostView);
      this.document.body.appendChild(ref.location.nativeElement);

      const subscription = ref.instance.answered.subscribe(confirmed => {
        subscription.unsubscribe();
        resolve(confirmed);
        // Let the closing animation finish before removing the dialog
        setTimeout(() => {
          this.appRef.detachView(ref.hostView);
          ref.destroy();
        }, 200);
      });
    });
  }
}
