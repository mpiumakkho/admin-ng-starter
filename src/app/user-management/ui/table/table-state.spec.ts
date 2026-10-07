import { signal } from '@angular/core';

import { UiTableState } from './table-state';

interface Row {
  id: number;
  name: string;
  team: string;
}

const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `Person ${index + 1}`, team: index % 2 ? 'Sales' : 'Design' }));

describe('UiTableState', () => {
  const create = (data = rows(25)) => {
    const source = signal<Row[]>(data);
    const team = signal<string | null>(null);
    const table = new UiTableState<Row, 'name' | 'id'>({
      rows: source,
      id: row => row.id,
      search: (row, query) => row.name.toLowerCase().includes(query),
      filter: signal((row: Row) => !team() || row.team === team()),
      sorters: { name: (a, b) => a.name.localeCompare(b.name), id: (a, b) => a.id - b.id },
      pageSize: 10,
    });
    return { table, source, team };
  };

  it('pages the rows', () => {
    const { table } = create();

    expect(table.pageCount()).toBe(3);
    expect(table.pageRows().length).toBe(10);
    table.page.set(3);
    expect(table.pageRows().map(row => row.id)).toEqual([21, 22, 23, 24, 25]);
    expect(table.range()).toEqual({ from: 21, to: 25, total: 25 });
  });

  it('searches and goes back to the first page', () => {
    const { table } = create();
    table.page.set(2);

    table.search('  PERSON 2');

    expect(table.page()).toBe(1);
    expect(table.pageRows().map(row => row.id)).toEqual([2, 20, 21, 22, 23, 24, 25]);
  });

  it('applies extra filters', () => {
    const { table, team } = create();

    team.set('Sales');

    expect(table.total()).toBe(12);
    expect(table.filtered().every(row => row.team === 'Sales')).toBe(true);
  });

  it('sorts, and reverses when asked again for the same column', () => {
    const { table } = create(rows(3));

    table.sortBy('id');
    expect(table.pageRows().map(row => row.id)).toEqual([1, 2, 3]);
    table.sortBy('id');
    expect(table.sortDirection()).toBe('desc');
    expect(table.pageRows().map(row => row.id)).toEqual([3, 2, 1]);
  });

  it('selects a page and forgets rows that are gone', () => {
    const { table, source } = create();

    table.togglePage();
    expect(table.allOnPageSelected()).toBe(true);
    expect(table.selectedRows().length).toBe(10);

    table.toggle(source()[0]);
    expect(table.someOnPageSelected()).toBe(true);

    source.update(all => all.slice(5));
    expect(table.selectedRows().map(row => row.id)).toEqual([6, 7, 8, 9, 10]);

    table.clearSelection();
    expect(table.selectedRows()).toEqual([]);
  });

  it('only ticks rows that can be selected', () => {
    const locked = signal(new Set([2, 4]));
    const table = new UiTableState<Row>({ rows: signal(rows(5)), id: row => row.id, selectable: row => !locked().has(row.id) });

    table.togglePage();
    table.toggle(rows(5)[1]);
    expect([...table.selectedIds()]).toEqual([1, 3, 5]);
    expect(table.allOnPageSelected()).toBe(true);

    // A row that becomes locked drops out of the selection
    locked.set(new Set([2, 4, 5]));
    expect(table.selectedRows().map(row => row.id)).toEqual([1, 3]);

    locked.set(new Set([1, 2, 3, 4, 5]));
    expect(table.pageHasSelectable()).toBe(false);
    expect(table.allOnPageSelected()).toBe(false);
  });

  it('keeps the page in range when rows are removed', () => {
    const { table, source } = create();
    table.page.set(3);

    source.set(rows(12));

    expect(table.currentPage()).toBe(2);
    expect(table.pageRows().map(row => row.id)).toEqual([11, 12]);
  });
});
