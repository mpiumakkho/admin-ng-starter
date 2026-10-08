import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiPagination } from './pagination.component';

describe('UiPagination', () => {
  let fixture: ComponentFixture<UiPagination>;

  async function show(page: number, pageCount: number) {
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('pageCount', pageCount);
    await fixture.whenStable();
  }

  /** What the buttons say, in order: the arrows by their labels, the pages by number, the current one in brackets */
  function buttons(): string[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map(button => {
      const label = button.getAttribute('aria-label');
      const text = label ?? button.textContent!.trim();
      return button.getAttribute('aria-current') === 'page' ? `[${text}]` : text;
    });
  }

  function click(label: string) {
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [UiPagination] }).compileComponents();
    fixture = TestBed.createComponent(UiPagination);
  });

  it('shows every page, with previous and next only, when there are five or fewer', async () => {
    await show(2, 5);
    expect(buttons()).toEqual(['Previous page', '1', '[2]', '3', '4', '5', 'Next page']);
    await show(1, 1);
    expect(buttons()).toEqual(['Previous page', '[1]', 'Next page']);
  });

  it('shows five pages around the current one, with first and last, when there are more', async () => {
    await show(8, 12);
    expect(buttons()).toEqual(['First page', 'Previous page', '6', '7', '[8]', '9', '10', 'Next page', 'Last page']);
  });

  it('keeps five pages near either end', async () => {
    await show(1, 12);
    expect(buttons().slice(2, 7)).toEqual(['[1]', '2', '3', '4', '5']);
    await show(2, 12);
    expect(buttons().slice(2, 7)).toEqual(['1', '[2]', '3', '4', '5']);
    await show(11, 12);
    expect(buttons().slice(2, 7)).toEqual(['8', '9', '10', '[11]', '12']);
    await show(12, 12);
    expect(buttons().slice(2, 7)).toEqual(['8', '9', '10', '11', '[12]']);
  });

  it('turns to five pages with first and last from six pages on', async () => {
    await show(4, 6);
    expect(buttons()).toEqual(['First page', 'Previous page', '2', '3', '[4]', '5', '6', 'Next page', 'Last page']);
  });

  it('goes to the first, previous, next and last pages, and stops at either end', async () => {
    await show(8, 12);
    const element: HTMLElement = fixture.nativeElement;
    const disabled = (label: string) => element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.disabled;

    click('Last page');
    expect(fixture.componentInstance.page()).toBe(12);
    await fixture.whenStable();
    expect(disabled('Next page')).toBe(true);
    expect(disabled('Last page')).toBe(true);

    click('Previous page');
    expect(fixture.componentInstance.page()).toBe(11);
    click('First page');
    expect(fixture.componentInstance.page()).toBe(1);
    await fixture.whenStable();
    expect(disabled('First page')).toBe(true);
    expect(disabled('Previous page')).toBe(true);

    click('Next page');
    expect(fixture.componentInstance.page()).toBe(2);
  });

  it('moves the keyboard focus to the current page when the button pressed turns off', async () => {
    await show(8, 12);
    const element: HTMLElement = fixture.nativeElement;
    const last = element.querySelector<HTMLButtonElement>('button[aria-label="Last page"]')!;
    last.focus();
    last.click();
    await fixture.whenStable();
    expect(document.activeElement?.textContent?.trim()).toBe('12');

    element.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]')!.focus();
    element.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]')!.click();
    await fixture.whenStable();
    // Still on: the focus stays where it was
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Previous page');
  });

  it('treats a page outside the range as the nearest end', async () => {
    await show(40, 12);
    expect(buttons().slice(2, 7)).toEqual(['8', '9', '10', '11', '[12]']);
    await show(3, 0);
    expect(buttons()).toEqual(['Previous page', '[1]', 'Next page']);
  });
});
