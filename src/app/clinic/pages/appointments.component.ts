import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCalendar, lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';

import { UiButton, UiSegmented } from '../../user-management/ui';
import { ClinicUi } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import { addDays, formatDate, SLOTS, TODAY, WAITLIST, weekStart } from '../data/model';
import type { Appointment } from '../data/types';
import { ClinicI18n, TxPipe } from '../i18n/clinic-i18n';
import { BoardColumn, MiniAlerts, TaskCard, Toolbar } from '../shared/parts';

const STATE_CHIP: Record<string, string> = { Confirmed: 'ok', 'Checked in': 'info', Waitlist: 'quiet', Completed: 'none' };
const byTime = (a: Appointment, b: Appointment) => a.time.localeCompare(b.time);

/**
 * The appointment calendar: a day by time slot (and the waitlist), or a week by day. The vet reads it; front desk
 * books, moves and checks in.
 */
@Component({
  selector: 'app-clinic-appointments',
  imports: [NgIcon, TxPipe, UiButton, UiSegmented, Toolbar, BoardColumn, TaskCard, MiniAlerts],
  template: `
    <cl-toolbar [heading]="'Appointments' | tx">
      <span subtitle class="appt-heading">
        {{ heading() }}
        @if (view() === 'day') {
          <span class="chip" [class]="'chip ' + (date() === today ? 'info' : 'quiet')">{{ relative() }}</span>
        }
      </span>
      <span class="btn-group" role="group" [attr.aria-label]="'เลือกช่วงวันที่' | tx">
        <button uiButton variant="secondary" size="sm" iconOnly type="button" [attr.aria-label]="(view() === 'day' ? 'วันก่อนหน้า' : 'สัปดาห์ก่อนหน้า') | tx" (click)="move(-1)">
          <ng-icon [svg]="icons.prev" aria-hidden="true" />
        </button>
        <button uiButton variant="secondary" size="sm" type="button" [disabled]="date() === today" (click)="date.set(today)">{{ 'วันนี้' | tx }}</button>
        <button uiButton variant="secondary" size="sm" iconOnly type="button" [attr.aria-label]="(view() === 'day' ? 'วันถัดไป' : 'สัปดาห์ถัดไป') | tx" (click)="move(1)">
          <ng-icon [svg]="icons.next" aria-hidden="true" />
        </button>
      </span>
      <span class="date-field">
        <button type="button" class="date-button" [attr.aria-label]="('ไปที่วันที่' | tx) + ' · ' + shortDate()" (click)="openPicker()">
          {{ shortDate() }}<ng-icon [svg]="icons.calendar" aria-hidden="true" />
        </button>
        <input #picker type="date" tabindex="-1" aria-hidden="true" [value]="date()" (change)="pick($any($event.target).value)" />
      </span>
      <ui-segmented size="sm" [options]="views()" [(value)]="view" [ariaLabel]="'มุมมอง' | tx" />
    </cl-toolbar>

    @if (view() === 'day') {
      <div class="board">
        <div class="board-grid cols-5">
          @for (column of columns(); track column.name) {
            <cl-column [name]="column.name" [count]="column.list.length" [empty]="'ไม่มีนัด'">
              @for (a of column.list; track a.id) {
                @let p = patientOf(a);
                <cl-task [title]="a.pet + ' · ' + (a.time === '—' ? ('Waitlist' | tx) : a.time)" [line1]="(a.type | tx) + ' · ' + (a.provider | tx)" [line2]="a.owner"
                  [status]="a.state === 'Confirmed' ? null : { text: a.state, cls: chip[a.state] || 'quiet' }" (opened)="openAppointment(a)">
                  @if (p && p.alerts.length) {
                    <cl-mini-alerts [patient]="p" [blank]="true" />
                  }
                </cl-task>
              }
            </cl-column>
          }
        </div>
      </div>
    } @else {
      <div class="board">
        <div class="week-grid">
          @for (day of week(); track day.date) {
            <section class="column day-col" [class.today]="day.date === today" [attr.aria-label]="day.label">
              <button type="button" class="day-head" [attr.title]="'เปิด Day view' | tx" (click)="date.set(day.date); view.set('day')">
                <span>{{ day.label }}</span><span class="count">{{ day.list.length }}</span>
              </button>
              @for (a of day.list; track a.id) {
                <button type="button" class="appt-mini" [class.done]="a.state === 'Completed'" (click)="openAppointment(a)">
                  <b>{{ a.time === '—' ? ('Waitlist' | tx) : a.time }}</b> {{ a.pet }}
                  <span class="secondary">{{ a.type | tx }} · {{ a.provider | tx }}</span>
                </button>
              } @empty {
                <p class="column-empty">{{ 'ว่าง' | tx }}</p>
              }
            </section>
          }
        </div>
      </div>
    }
  `,
  host: { class: 'workspace' },
})
export class AppointmentsComponent {
  private readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  private readonly i18n = inject(ClinicI18n);

  protected readonly icons = { prev: lucideChevronLeft, next: lucideChevronRight, calendar: lucideCalendar };
  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('picker');
  protected readonly chip = STATE_CHIP;
  protected readonly today = TODAY;
  protected readonly date = signal(TODAY);
  protected readonly view = signal<'day' | 'week'>('day');
  protected readonly views = computed(() => [
    { value: 'day' as const, label: this.i18n.t('Day') },
    { value: 'week' as const, label: this.i18n.t('Week') },
  ]);

  protected readonly days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart(this.date()), i)));
  protected readonly heading = computed(() => {
    const lang = this.i18n.lang();
    const days = this.days();
    return this.view() === 'day' ? formatDate(this.date(), 'long', lang) : `${formatDate(days[0], 'short', lang)} – ${formatDate(days[6], 'short', lang)}`;
  });
  protected readonly relative = computed(() => {
    const diff = Math.round((new Date(this.date() + 'T00:00:00').getTime() - new Date(TODAY + 'T00:00:00').getTime()) / 86400000);
    return diff === 0 ? this.i18n.t('วันนี้') : diff === 1 ? this.i18n.t('พรุ่งนี้') : diff === -1 ? this.i18n.t('เมื่อวาน') : formatDate(this.date(), 'short', this.i18n.lang());
  });

  protected readonly columns = computed(() => {
    const appointments = this.store.data().appointments;
    return [...SLOTS, WAITLIST].map(name => ({ name, list: appointments.filter(a => a.date === this.date() && a.slot === name).sort(byTime) }));
  });

  protected readonly week = computed(() => {
    const appointments = this.store.data().appointments;
    const lang = this.i18n.lang();
    return this.days().map(date => ({ date, label: formatDate(date, 'weekday', lang), list: appointments.filter(a => a.date === date).sort(byTime) }));
  });

  protected move(direction: number) {
    this.date.set(addDays(this.date(), direction * (this.view() === 'day' ? 1 : 7)));
  }

  protected readonly shortDate = computed(() => formatDate(this.date(), 'short', this.i18n.lang()));

  /** The browser's own calendar, from the button that shows the date in the page's language */
  protected openPicker() {
    const input = this.picker().nativeElement;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  }

  protected pick(value: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      this.date.set(value);
    }
  }

  /** An appointment opens with its pet selected, when the pet is in today's clinic, so the context rail is about it */
  protected openAppointment(a: Appointment) {
    this.store.selectPet(a.pet, a.owner);
    this.ui.openSheet('appointment', { id: a.id });
  }

  protected patientOf(a: Appointment) {
    return a.date === TODAY ? this.store.data().patients.find(p => p.pet === a.pet && p.ownerKey === a.owner) : undefined;
  }
}
