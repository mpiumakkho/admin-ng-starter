import { computed, inject, Injectable, signal } from '@angular/core';

import { ClinicStore } from '../clinic/clinic.store';
import { NOW, TODAY } from '../clinic/data/model';
import { fullName, Session } from '../user-management';
import { approvalAging, severityCounts, worklist } from './data/home';
import { createBackofficeSeed } from './data/seed';
import type { ActivityEntry, Approval, BackofficeData, BoException, Module } from './data/types';

/** Who works in the back office when nobody is signed in, as in tests: the finance manager the sample is drawn for */
const SAMPLE_USER = 'วรรณา (ผู้จัดการการเงิน)';

/**
 * The back office's sample data and what its pages do with it. The clinic's records (bills, stock) are read from the
 * clinic's own store, so what is done there shows here at once; the back office's own records (approvals, exceptions,
 * its audit) change in place, as the clinic's do, and `data` tells everyone on every change.
 */
@Injectable({ providedIn: 'root' })
export class BackofficeStore {
  private readonly session = inject(Session);
  readonly clinic = inject(ClinicStore);
  readonly userName = computed(() => {
    const me = this.session.user();
    return me ? fullName(me) : SAMPLE_USER;
  });
  readonly data = signal<BackofficeData>(createBackofficeSeed(), { equal: () => false });

  /** Everything that waits, across the modules */
  readonly worklist = computed(() => worklist(this.data(), this.clinic.data()));
  readonly pendingApprovals = computed(() => this.data().approvals.filter(a => a.status === 'pending'));
  readonly openExceptions = computed(() => this.data().exceptions.filter(x => !x.acknowledgedAt));
  /** Counts for the menu and the bell */
  readonly counts = computed(() => ({
    overview: this.worklist().length,
    approvals: approvalAging(this.data().approvals).pending,
    alerts: this.openExceptions().length,
    critical: severityCounts(this.data().exceptions).critical,
  }));

  mutate(change: (data: BackofficeData) => void) {
    change(this.data());
    this.data.set(this.data());
  }

  reset() {
    this.data.set(createBackofficeSeed());
  }

  /** A decision on a request, with why; it goes into the back office's audit */
  decide(a: Approval, status: 'approved' | 'rejected', decision: string) {
    this.mutate(d => {
      a.status = status;
      a.decidedBy = this.userName();
      a.decidedAt = `${TODAY} ${NOW}`;
      a.decision = decision;
      this.log(d, a.module, status === 'approved' ? 'อนุมัติคำขอ' : 'ปฏิเสธคำขอ', a.id === a.ref ? a.ref : a.ref, a.title, decision, 'รออนุมัติ', status === 'approved' ? 'อนุมัติแล้ว' : 'ปฏิเสธ');
    });
  }

  /** Seen, and what was done about it or where it went; the exception is settled in its own workflow */
  acknowledge(x: BoException, note: string) {
    this.mutate(d => {
      x.acknowledgedBy = this.userName();
      x.acknowledgedAt = `${TODAY} ${NOW}`;
      x.note = note || undefined;
      this.log(d, x.module, 'รับทราบข้อยกเว้น', x.ref, x.title, note);
    });
  }

  private log(d: BackofficeData, module: Module, action: string, target: string, ref: string, detail?: string, before?: string, after?: string) {
    const entry: ActivityEntry = {
      id: 'A' + (d.activity.length + 1), at: `${TODAY} ${NOW}`, by: this.userName(), module, action, target, ref, detail: detail || undefined, before, after,
    };
    d.activity.unshift(entry);
  }
}
