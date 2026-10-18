import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiPersonOption, UiPersonSelect } from './person-select.component';

/** 120 people, Person 000 to Person 119, more than the list shows at once */
const MANY: UiPersonOption[] = Array.from({ length: 120 }, (_, index) => ({
  id: `p${index}`,
  name: `Person ${String(index).padStart(3, '0')}`,
  detail: `person${index}@example.com`,
}));

describe('UiPersonSelect', () => {
  let fixture: ComponentFixture<UiPersonSelect>;
  let picked: (string | null)[];

  beforeEach(async () => {
    // jsdom lays nothing out, so it cannot scroll an option into view
    Element.prototype.scrollIntoView ??= () => undefined;
    await TestBed.configureTestingModule({ imports: [UiPersonSelect] }).compileComponents();
    fixture = TestBed.createComponent(UiPersonSelect);
    fixture.componentRef.setInput('label', 'Done by');
    fixture.componentRef.setInput('people', MANY);
    picked = [];
    fixture.componentInstance.value.subscribe(value => picked.push(value));
    await fixture.whenStable();
  });

  const host = () => fixture.nativeElement as HTMLElement;
  const trigger = () => host().querySelector<HTMLButtonElement>('.ui-ps-trigger')!;
  const input = () => document.querySelector<HTMLInputElement>('.ui-ps-input')!;
  /** The names in the open list, in order */
  const names = () => [...document.querySelectorAll('.ui-ps-option .ui-ps-name')].map(name => name.textContent!.trim());

  async function open() {
    trigger().click();
    await fixture.whenStable();
  }

  async function type(text: string) {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function press(key: string) {
    input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await fixture.whenStable();
  }

  it('shows anyone, then the first fifty people, and says how many more there are', async () => {
    await open();
    expect(names().length).toBe(51);
    expect(names().slice(0, 3)).toEqual(['Anyone', 'Person 000', 'Person 001']);
    expect(document.querySelector('.ui-ps-more')!.textContent).toContain('Showing 50 of 120.');
    expect(document.activeElement).toBe(input());
  });

  it('finds people by name or detail as you type, those whose name starts with it first', async () => {
    fixture.componentRef.setInput('people', [
      { id: 'b', name: 'Bob Stone', detail: 'ann.b@example.com' },
      { id: 'j', name: 'Joann Lee', detail: 'jl@example.com' },
      { id: 'a', name: 'Ann Smith', detail: 'as@example.com' },
    ]);
    await open();
    await type('ANN');
    expect(names()).toEqual(['Ann Smith', 'Bob Stone', 'Joann Lee']);
    expect(document.querySelector('.ui-ps-more')).toBeNull();

    await type('nobody');
    expect(names()).toEqual([]);
    expect(document.querySelector('.ui-ps-empty')!.textContent).toContain('No one found');
  });

  it('moves through the list with the arrow keys and picks with Enter; Escape closes and picks nothing', async () => {
    await open();
    await press('ArrowDown');
    await press('ArrowDown');
    await press('Enter');
    expect(picked).toEqual(['p1']);
    expect(document.querySelector('.ui-ps-panel')).toBeNull();
    expect(trigger().textContent).toContain('Person 001');
    expect(document.activeElement).toBe(trigger());

    await open();
    await press('ArrowUp');
    await press('Escape');
    expect(picked).toEqual(['p1']);
    expect(document.querySelector('.ui-ps-panel')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('keeps the one picked in the list before anything is typed, wherever it is, and starts there', async () => {
    fixture.componentRef.setInput('value', 'p100');
    await open();
    expect(names().length).toBe(51);
    expect(names()[1]).toBe('Person 100');
    expect(document.querySelector('.ui-ps-option[aria-selected="true"] .ui-ps-name')!.textContent).toBe('Person 100');
  });

  it('clears what is picked with the cross', async () => {
    fixture.componentRef.setInput('value', 'p3');
    await fixture.whenStable();
    expect(host().classList).toContain('ui-ps-picked');
    host().querySelector<HTMLButtonElement>('.ui-ps-clear')!.click();
    await fixture.whenStable();
    expect(picked).toEqual([null]);
    expect(trigger().textContent).toContain('Anyone');
  });
});
