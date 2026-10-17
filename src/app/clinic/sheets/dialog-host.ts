import { Component, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';

import { UiAlert, UiButton, UiDialog, UiDialogFooter, UiFormField, UiInput } from '../../user-management/ui';
import { ClinicUi, DialogField } from '../clinic-ui';
import { TxPipe } from '../i18n/clinic-i18n';

/**
 * The workspace's confirmation dialog, with fields when a decision needs them (the design's openDialog): a reason, a
 * finding, how a result was acknowledged. Confirm stays off until every field it needs will do.
 */
@Component({
  selector: 'cl-dialog-host',
  imports: [TxPipe, UiDialog, UiDialogFooter, UiButton, UiFormField, UiInput, UiAlert],
  template: `
    @let request = ui.dialog();
    <ui-dialog [open]="!!request" (openChange)="$event || ui.dialog.set(null)" [title]="(request?.title ?? '') | tx" size="sm" [closeLabel]="'ปิด' | tx">
      @if (request) {
        <div class="clinic-dialog">
          @for (line of request.intro ?? []; track $index) {
            <p class="dialog-text">{{ line | tx }}</p>
          }
          @if (request.facts?.length) {
            <dl class="data-grid">
              @for (fact of request.facts; track $index) {
                <dt>{{ fact[0] | tx }}</dt>
                <dd>{{ fact[1] | tx }}</dd>
              }
            </dl>
          }
          @if (request.warning) {
            <ui-alert tone="danger">{{ request.warning | tx }}</ui-alert>
          }
          @for (field of request.fields ?? []; track field.name) {
            @if (field.type === 'checkbox') {
              <label class="check">
                <input type="checkbox" [checked]="values()[field.name] === 'yes'" (change)="set(field.name, $any($event.target).checked ? 'yes' : '')" />
                {{ field.label | tx }}
              </label>
            } @else {
              <ui-form-field [label]="field.label | tx" [for]="'dlg-' + field.name" [optionalLabel]="field.optional ? ('(ไม่บังคับ)' | tx) : ''">
                @switch (field.type) {
                  @case ('select') {
                    <select uiInput [id]="'dlg-' + field.name" [value]="values()[field.name]" (change)="set(field.name, $any($event.target).value)"
                      [attr.aria-invalid]="shown(field) && !!error(field)">
                      @for (option of field.options ?? []; track option.value) {
                        <option [value]="option.value" [selected]="option.value === values()[field.name]">{{ option.label | tx }}</option>
                      }
                    </select>
                  }
                  @case ('textarea') {
                    <textarea uiInput [id]="'dlg-' + field.name" rows="3" [value]="values()[field.name]" [placeholder]="(field.placeholder ?? '') | tx"
                      (input)="set(field.name, $any($event.target).value)" [attr.aria-invalid]="shown(field) && !!error(field)"></textarea>
                  }
                  @default {
                    <input uiInput [id]="'dlg-' + field.name" [value]="values()[field.name]" [placeholder]="(field.placeholder ?? '') | tx"
                      (input)="set(field.name, $any($event.target).value)" [attr.aria-invalid]="shown(field) && !!error(field)" />
                  }
                }
                @if (shown(field) && error(field); as message) {
                  <p class="field-error" role="alert">{{ message | tx }}</p>
                }
              </ui-form-field>
            }
          }
          @if (request.after) {
            <p class="secondary">{{ request.after | tx }}</p>
          }
        </div>
      }
      <div uiDialogFooter>
        <button uiButton variant="secondary" type="button" (click)="ui.dialog.set(null)">{{ 'ยกเลิก' | tx }}</button>
        <button uiButton type="button" [variant]="request?.tone === 'danger' ? 'danger' : 'primary'" [disabled]="!valid()" (click)="confirm()">
          {{ (request?.confirmLabel ?? '') | tx }}
        </button>
      </div>
    </ui-dialog>
  `,
  host: { class: 'contents' },
})
export class DialogHost {
  protected readonly ui = inject(ClinicUi);

  /** The fields' values, starting from what each field brings */
  protected readonly values = linkedSignal<Record<string, string>>(() => {
    const fields = this.ui.dialog()?.fields ?? [];
    return Object.fromEntries(fields.map(f => [f.name, f.value ?? (f.type === 'select' ? f.options?.[0]?.value ?? '' : '')]));
  });
  /** The fields someone has changed; their errors show. All of them, once Confirm was pressed */
  protected readonly touched = signal(new Set<string>());
  protected readonly submitted = signal(false);
  protected readonly valid = computed(() => (this.ui.dialog()?.fields ?? []).every(field => !this.error(field)));

  constructor() {
    // A new question starts untouched
    effect(() => {
      this.ui.dialog();
      untracked(() => {
        this.touched.set(new Set());
        this.submitted.set(false);
      });
    });
  }

  protected set(name: string, value: string) {
    this.values.update(values => ({ ...values, [name]: value }));
    this.touched.update(set => new Set(set).add(name));
  }

  protected shown(field: DialogField): boolean {
    return this.submitted() || this.touched().has(field.name);
  }

  protected error(field: DialogField): string | null {
    const value = this.values()[field.name] ?? '';
    if (!field.optional && field.type !== 'checkbox' && !value.trim()) {
      return 'กรุณากรอกข้อมูล';
    }
    return field.validate?.(value, this.values()) ?? null;
  }

  protected confirm() {
    const request = this.ui.dialog();
    if (!request || !this.valid()) {
      this.submitted.set(true);
      return;
    }
    // Read before closing: the values start over with the next question
    const values = this.values();
    this.ui.dialog.set(null);
    request.onConfirm(values);
  }
}
