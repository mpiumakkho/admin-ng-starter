import { inject, Injectable, signal } from '@angular/core';

import { UiToastService } from '../user-management/ui';
import { ClinicI18n } from './i18n/clinic-i18n';

/**
 * Side sheets: one at a time, beside the context rail. The patient's sheets show the selected patient; the others
 * show one record, by its id.
 */
export type SheetKind =
  | 'visit' | 'patient' | 'owner' | 'notes' | 'results' | 'estimate' | 'billing'
  | 'result' | 'order' | 'appointment' | 'prescription' | 'newOrder'
  /** One of the selected patient's past visits or documents: its id is "<patient id>/<date or index>" */
  | 'pastVisit' | 'document';

export interface SheetState { kind: SheetKind; id?: string; tab?: string }

/** A field of a confirmation dialog */
export interface DialogField {
  name: string;
  label: string;
  type: 'input' | 'textarea' | 'select' | 'checkbox';
  options?: { value: string; label: string }[];
  value?: string;
  placeholder?: string;
  optional?: boolean;
  /** An error message, or null when the value will do; it can look at the other fields */
  validate?: (value: string, all: Record<string, string>) => string | null;
}

/** A dialog that asks for a decision, with fields when it needs them; values of checkboxes are 'yes' or '' */
export interface DialogRequest {
  title: string;
  tone?: 'primary' | 'danger';
  /** Short paragraphs above the fields */
  intro?: string[];
  /** Label / value rows above the fields */
  facts?: [string, string][];
  /** A warning box above the fields */
  warning?: string;
  fields?: DialogField[];
  /** A note under the fields */
  after?: string;
  confirmLabel: string;
  onConfirm: (values: Record<string, string>) => void;
}

@Injectable({ providedIn: 'root' })
export class ClinicUi {
  private readonly toasts = inject(UiToastService);
  private readonly i18n = inject(ClinicI18n);

  readonly sheet = signal<SheetState | null>(null);
  readonly dialog = signal<DialogRequest | null>(null);

  openSheet(kind: SheetKind, options: { id?: string; tab?: string } = {}) {
    this.sheet.set({ kind, ...options });
  }

  /** The same sheet again closes it, as the context rail's buttons do */
  toggleSheet(kind: SheetKind, tab?: string) {
    const open = this.sheet();
    if (open && open.kind === kind && (!tab || open.tab === tab)) {
      this.closeSheet();
    } else {
      this.openSheet(kind, { tab });
    }
  }

  closeSheet() {
    this.sheet.set(null);
  }

  ask(request: DialogRequest) {
    this.dialog.set(request);
  }

  /** A message in the workspace's language */
  toast(key: string, vars?: Record<string, string | number>, tone: 'success' | 'error' | 'info' = 'success') {
    this.toasts.show(this.i18n.t(key, vars), tone);
  }
}
