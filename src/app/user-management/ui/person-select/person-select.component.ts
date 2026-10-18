import { CdkConnectedOverlay, STANDARD_DROPDOWN_BELOW_POSITIONS } from '@angular/cdk/overlay';
import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, input, model, signal, viewChild, ViewEncapsulation,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCheck, lucideChevronDown, lucideSearch, lucideUsers, lucideX } from '@ng-icons/lucide';

import { UiAvatar } from '../avatar/avatar.component';

/** Someone to pick: what shows for them, and what their name or detail is searched by */
export interface UiPersonOption {
  id: string;
  name: string;
  /** Under the name, such as their email */
  detail?: string;
  /** A photo; without one, their initials */
  avatar?: string;
}

/** One line of the list: a person, or nobody in particular (id null) */
interface Choice {
  id: string | null;
  person: UiPersonOption | null;
}

/**
 * Picks one person, or anyone, as a filter, among however many there are: the list it opens searches by name or
 * detail as you type and shows the first `limit` it finds, saying how many more there are. The keyboard works it as
 * a combobox: the arrow keys move through the list, Enter picks, Escape closes. Every piece of text comes in.
 *
 *   <ui-person-select label="Done by" [people]="people" [(value)]="actorId" anyoneLabel="Anyone"
 *     searchLabel="Search name or email" emptyLabel="No one found" clearLabel="Clear Done by" [moreText]="more" />
 */
@Component({
  selector: 'ui-person-select',
  imports: [CdkConnectedOverlay, NgIcon, UiAvatar],
  template: `
    <button #trigger type="button" class="ui-ps-trigger" aria-haspopup="dialog" [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? id + '-panel' : null" (click)="toggle()" (keydown)="triggerKey($event)">
      <span class="ui-ps-label">{{ label() }}:</span>
      @if (picked(); as person) {
        <ui-avatar [name]="person.name" [src]="person.avatar ?? ''" size="xs" />
        <span class="ui-ps-value">{{ person.name }}</span>
      } @else {
        <span class="ui-ps-value">{{ anyoneLabel() }}</span>
        <ng-icon [svg]="icons.caret" class="ui-ps-caret" />
      }
    </button>
    @if (picked()) {
      <button type="button" class="ui-ps-clear" [attr.aria-label]="clearLabel()" [title]="clearLabel()" (click)="clear()">
        <ng-icon [svg]="icons.clear" />
      </button>
    }
    <ng-template cdkConnectedOverlay [cdkConnectedOverlayOrigin]="host" [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions" cdkConnectedOverlayLockPosition
      (overlayOutsideClick)="outsideClick($event)" (detach)="open.set(false)" (attach)="focusSearch()">
      <div class="ui-ps-panel" role="dialog" [id]="id + '-panel'" [attr.aria-label]="label()">
        <div class="ui-ps-search">
          <ng-icon [svg]="icons.search" class="ui-ps-search-icon" />
          <input #search type="text" class="ui-input ui-input-sm ui-ps-input" role="combobox" aria-autocomplete="list" aria-expanded="true"
            [attr.aria-controls]="id + '-list'" [attr.aria-activedescendant]="choices().length ? id + '-option-' + active() : null"
            [placeholder]="searchLabel()" [attr.aria-label]="searchLabel()" [value]="query()" autocomplete="off" spellcheck="false"
            (input)="typed($any($event.target).value)" (keydown)="searchKey($event)" />
        </div>
        @if (choices().length) {
          <div #list class="ui-ps-list" role="listbox" [id]="id + '-list'" [attr.aria-label]="label()">
            @for (choice of choices(); track choice.id; let index = $index) {
              <div class="ui-ps-option" role="option" [id]="id + '-option-' + index" [class.ui-ps-active]="index === active()"
                [attr.aria-selected]="index === active()" (pointermove)="active.set(index)" (mousedown)="$event.preventDefault()"
                (click)="pick(choice.id)">
                @if (choice.person; as person) {
                  <ui-avatar [name]="person.name" [src]="person.avatar ?? ''" size="xs" />
                  <span class="ui-ps-text">
                    <span class="ui-ps-name">{{ person.name }}</span>
                    @if (person.detail) {
                      <span class="ui-ps-detail">{{ person.detail }}</span>
                    }
                  </span>
                } @else {
                  <span class="ui-ps-anyone" aria-hidden="true"><ng-icon [svg]="icons.anyone" /></span>
                  <span class="ui-ps-text"><span class="ui-ps-name">{{ anyoneLabel() }}</span></span>
                }
                @if (choice.id === value()) {
                  <ng-icon [svg]="icons.check" class="ui-ps-check" />
                }
              </div>
            }
          </div>
        } @else {
          <p class="ui-ps-empty" role="status">{{ emptyLabel() }}</p>
        }
        @if (matches().length > shownCount()) {
          <p class="ui-ps-more">{{ moreText()(shownCount(), matches().length) }}</p>
        }
      </div>
    </ng-template>
  `,
  styleUrl: './person-select.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-person-select',
    '[class.ui-ps-open]': 'open()',
    '[class.ui-ps-picked]': '!!picked()',
  },
})
export class UiPersonSelect {
  private static nextId = 0;

  /** What it filters by, shown before what is picked: "Done by: Anyone" */
  readonly label = input.required<string>();
  readonly people = input<readonly UiPersonOption[]>([]);
  /** The id of the person picked; null for anyone */
  readonly value = model<string | null>(null);
  readonly anyoneLabel = input('Anyone');
  readonly searchLabel = input('Search');
  readonly emptyLabel = input('No one found');
  /** The cross that clears it, which shows only an icon */
  readonly clearLabel = input('Clear');
  /** How many people the list shows at once; typing finds the others */
  readonly limit = input(50);
  /** Under the list when it shows only some of those found */
  readonly moreText = input<(shown: number, total: number) => string>((shown, total) => `Showing ${shown} of ${total.toLocaleString('en')}. Type a name to find the others.`);

  protected readonly id = `ui-person-select-${UiPersonSelect.nextId++}`;
  protected readonly icons = { caret: lucideChevronDown, clear: lucideX, search: lucideSearch, anyone: lucideUsers, check: lucideCheck };
  protected readonly positions = STANDARD_DROPDOWN_BELOW_POSITIONS;
  protected readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly open = signal(false);
  protected readonly query = signal('');
  /** The line the arrow keys are on */
  protected readonly active = signal(0);

  protected readonly picked = computed(() => {
    const id = this.value();
    return id === null ? null : this.people().find(person => person.id === id) ?? { id, name: id };
  });

  /** Everyone whose name or detail holds what is typed; those whose name starts with it first */
  protected readonly matches = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    if (!query) {
      return this.people();
    }
    const found = this.people().filter(person =>
      person.name.toLocaleLowerCase().includes(query) || !!person.detail?.toLocaleLowerCase().includes(query));
    return [...found.filter(person => person.name.toLocaleLowerCase().startsWith(query)),
      ...found.filter(person => !person.name.toLocaleLowerCase().startsWith(query))];
  });

  /** The people the list shows: the first it finds, and, before anything is typed, the one picked among them */
  private readonly shown = computed(() => {
    const limit = this.limit();
    const picked = this.picked();
    const first = this.matches().slice(0, limit);
    if (!picked || this.query().trim() || first.some(person => person.id === picked.id)) {
      return first;
    }
    return [picked, ...first.slice(0, limit - 1)];
  });
  protected readonly shownCount = computed(() => this.shown().length);

  /** Anyone first, until something is typed; then the people found */
  protected readonly choices = computed<Choice[]>(() => [
    ...(this.query().trim() ? [] : [{ id: null, person: null }]),
    ...this.shown().map(person => ({ id: person.id, person })),
  ]);

  protected toggle() {
    if (this.open()) {
      this.close(false);
    } else {
      this.show();
    }
  }

  protected triggerKey(event: KeyboardEvent) {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !this.open()) {
      event.preventDefault();
      this.show();
    }
  }

  private show() {
    this.query.set('');
    this.active.set(Math.max(0, this.choices().findIndex(choice => choice.id === this.value())));
    this.open.set(true);
  }

  private close(focusTrigger: boolean) {
    this.open.set(false);
    if (focusTrigger) {
      this.trigger().nativeElement.focus();
    }
  }

  protected focusSearch() {
    afterNextRender(() => {
      this.search()?.nativeElement.focus();
      this.scrollToActive();
    }, { injector: this.injector });
  }

  /** A click outside closes it; one on its own button toggles it there */
  protected outsideClick(event: MouseEvent) {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close(false);
    }
  }

  protected typed(query: string) {
    this.query.set(query);
    this.active.set(0);
    const list = this.list()?.nativeElement;
    if (list) {
      list.scrollTop = 0;
    }
  }

  protected searchKey(event: KeyboardEvent) {
    const count = this.choices().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (count) {
          this.active.update(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
          this.scrollToActive();
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (count) {
          this.pick(this.choices()[this.active()].id);
        }
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        break;
      case 'Tab':
        // On to what follows the button, as if the list were not there
        this.close(true);
        break;
    }
  }

  private scrollToActive() {
    this.list()?.nativeElement.querySelector(`#${this.id}-option-${this.active()}`)?.scrollIntoView({ block: 'nearest' });
  }

  protected pick(id: string | null) {
    this.close(true);
    if (id !== this.value()) {
      this.value.set(id);
    }
  }

  protected clear() {
    this.value.set(null);
    this.trigger().nativeElement.focus();
  }
}
