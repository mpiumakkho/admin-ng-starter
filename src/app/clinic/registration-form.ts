import { Injectable, signal } from '@angular/core';

import {
  type Address, type AddressKind, type Duplicate, emptyDraft, type PetRecord, type RegistrationDraft, ROUTES,
} from './data/registration';

/**
 * What the registration tab holds. It stays while the person looks
 * at another tab, as a half-filled form at the front desk would.
 */
@Injectable({ providedIn: 'root' })
export class RegistrationForm {
  readonly draft = signal<RegistrationDraft>(emptyDraft());
  /** The pet on file the form shows, read-only; null while a new one is being registered */
  readonly record = signal<PetRecord | null>(null);
  readonly route = signal(ROUTES[0]);
  /** The same animal is on file already: no new record, only the way to the one there is */
  readonly block = signal<(Duplicate & { field: string }) | null>(null);

  set<K extends keyof RegistrationDraft>(key: K, value: RegistrationDraft[K]) {
    this.draft.update(d => ({ ...d, [key]: value }));
  }

  setAddress(kind: AddressKind, field: keyof Address, value: string) {
    this.draft.update(d => ({ ...d, addresses: { ...d.addresses, [kind]: { ...d.addresses[kind], [field]: value } } }));
  }

  /** The registered address as the current one */
  copyCurrent(kind: AddressKind) {
    this.draft.update(d => ({ ...d, addresses: { ...d.addresses, [kind]: { ...d.addresses.current } } }));
  }

  load(record: PetRecord, draft: RegistrationDraft) {
    this.record.set(record);
    this.draft.set(draft);
    this.block.set(null);
  }

  reset() {
    this.draft.set(emptyDraft());
    this.record.set(null);
    this.block.set(null);
  }
}
