import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  createComponent,
  DOCUMENT,
  ElementRef,
  EnvironmentInjector,
  inject,
  Injectable,
  input,
  model,
  output,
  OutputEmitterRef,
  Type,
  viewChild,
} from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule } from '@angular/forms';

import { UiButton } from '../button/button.component';
import { UiFormField, UiInput } from '../forms/form-field.component';
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

export interface UiPromptOptions extends UiConfirmOptions {
  /** The text field's label, such as "Reason" */
  label: string;
  /** It must not be left blank */
  required?: boolean;
  /** After the label of a field that can be left empty, such as "(optional)" */
  optionalLabel?: string;
  /** Shown when a required field is left blank */
  requiredMessage?: string;
  maxLength?: number;
}

/** Text with something in it besides spaces */
function notBlank(control: AbstractControl<string>) {
  return control.value.trim() ? null : { required: true };
}

@Component({
  selector: 'ui-prompt-dialog',
  imports: [ReactiveFormsModule, UiDialog, UiDialogFooter, UiButton, UiFormField, UiInput],
  template: `
    <ui-dialog [(open)]="open" [title]="options().title" [description]="options().message ?? ''" size="sm" (openChange)="!$event && answer(null)">
      <form [id]="formId" (submit)="$event.preventDefault(); submit()" novalidate>
        <ui-form-field [label]="options().label" [for]="formId + '-text'" [required]="!!options().required"
          [optionalLabel]="options().required ? '' : options().optionalLabel ?? ''" [errors]="{ required: options().requiredMessage ?? 'This field is required.' }">
          <textarea #field uiInput [id]="formId + '-text'" rows="3" [attr.maxlength]="options().maxLength ?? null" [formControl]="text"></textarea>
        </ui-form-field>
      </form>
      <div uiDialogFooter>
        <button uiButton variant="secondary" type="button" (click)="answer(null)">{{ options().cancelLabel ?? 'Cancel' }}</button>
        <button uiButton type="submit" [attr.form]="formId" [variant]="options().tone === 'danger' ? 'danger' : 'primary'">{{ options().confirmLabel ?? 'Confirm' }}</button>
      </div>
    </ui-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class UiPromptDialog {
  private static nextId = 0;

  readonly options = input.required<UiPromptOptions>();
  readonly answered = output<string | null>();
  protected readonly open = model(true);
  protected readonly formId = `ui-prompt-${UiPromptDialog.nextId++}`;
  protected readonly text = new FormControl('', { nonNullable: true });
  private readonly field = viewChild.required<ElementRef<HTMLTextAreaElement>>('field');
  private done = false;

  protected submit() {
    if (this.options().required && notBlank(this.text)) {
      this.text.setErrors(notBlank(this.text));
      this.text.markAsTouched();
      this.field().nativeElement.focus();
      return;
    }
    this.answer(this.text.value.trim());
  }

  protected answer(value: string | null) {
    if (!this.done) {
      this.done = true;
      this.open.set(false);
      this.answered.emit(value);
    }
  }
}

/**
 * Ask a yes/no question in a modal dialog, or ask for a line of text with it, such as a reason.
 *
 *   if (await this.confirm.ask({ title: 'Delete 3 users?', message: 'This cannot be undone.', tone: 'danger', confirmLabel: 'Delete' })) { ... }
 *   const reason = await this.confirm.prompt({ title: 'Suspend Ann?', label: 'Reason', required: true, confirmLabel: 'Suspend' });
 *   if (reason !== null) { ... }   // the text, trimmed; null when cancelled
 */
@Injectable({ providedIn: 'root' })
export class UiConfirmService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly document = inject(DOCUMENT);

  ask(options: UiConfirmOptions): Promise<boolean> {
    return this.show(UiConfirmDialog, options);
  }

  prompt(options: UiPromptOptions): Promise<string | null> {
    return this.show(UiPromptDialog, options);
  }

  private show<T, A>(type: Type<{ answered: OutputEmitterRef<A> } & T>, options: UiConfirmOptions): Promise<A> {
    return new Promise(resolve => {
      const ref: ComponentRef<{ answered: OutputEmitterRef<A> }> = createComponent(type, { environmentInjector: this.injector });
      ref.setInput('options', options);
      this.appRef.attachView(ref.hostView);
      this.document.body.appendChild(ref.location.nativeElement);

      const subscription = ref.instance.answered.subscribe(answer => {
        subscription.unsubscribe();
        resolve(answer);
        // Let the closing animation finish before removing the dialog
        setTimeout(() => {
          this.appRef.detachView(ref.hostView);
          ref.destroy();
        }, 200);
      });
    });
  }
}
