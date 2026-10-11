import { parseCsv, toCsv } from '../shared/csv';
import { Role } from './models';
import { checkImportRows, ImportContext } from './user-import';

const anyTime = { maxDays: null, reasonRequired: false };
const roles = [
  { id: 'admin', name: 'Administrator', permissions: ['users.view', 'roles.manage'], assignment: anyTime },
  { id: 'viewer', name: 'Viewer', permissions: ['users.view'], assignment: anyTime },
] as Role[];

const context: ImportContext = {
  roles,
  takenEmails: new Set(['taken@example.com']),
  allowedDomains: [],
  defaultRoleId: 'viewer',
  canAssign: role => role.id !== 'admin',
  status: 'invited',
};

describe('parseCsv', () => {
  it('reads quotes, commas and line breaks inside quotes, and skips blank lines', () => {
    const text = '﻿First name,Note\r\n"Smith, Ann","Said ""hi""\nthen left"\r\n\r\nBo,\n';

    expect(parseCsv(text)).toEqual([['First name', 'Note'], ['Smith, Ann', 'Said "hi"\nthen left'], ['Bo', '']]);
  });

  it('keeps a quote inside a field as text, and starts quoting only at the start of a field', () => {
    expect(parseCsv('Name,Note\nBob,O"Neil\nAnn,x')).toEqual([['Name', 'Note'], ['Bob', 'O"Neil'], ['Ann', 'x']]);
  });

  it('keeps cells that look like formulas as text', () => {
    expect(toCsv([['=HYPERLINK("x")', '+66 81', '@sum', 'plain']])).toBe(`"'=HYPERLINK(""x"")",'+66 81,'@sum,plain`);
  });

  it('writes what it reads', () => {
    const rows = [['a,b', 'c"d', 'line\nbreak', 'plain']];

    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('checkImportRows', () => {
  it('matches headers loosely and fills in the default role and department', () => {
    const { rows, missingColumns } = checkImportRows([['FIRST_NAME', 'last name', 'E-mail'], ['Ann', 'Smith', 'ANN@example.com']], context);

    expect(missingColumns).toEqual([]);
    expect(rows[0]).toMatchObject({
      line: 2, problems: [], draft: { email: 'ann@example.com', roles: [{ roleId: 'viewer', endsAt: null }], department: 'Engineering', status: 'invited' },
    });
  });

  it('takes several roles in one cell, each for good, but not a role with rules of its own', () => {
    const contractor = { id: 'contractor', name: 'Contractor', permissions: ['users.view'], assignment: { maxDays: 90, reasonRequired: true } } as Role;
    const { rows } = checkImportRows([
      ['First name', 'Last name', 'Email', 'Roles'],
      ['Ann', 'Lee', 'ann@example.com', 'Viewer; admin'],
      ['Bo', 'Kim', 'bo@example.com', 'Contractor'],
    ], { ...context, roles: [...roles, contractor], canAssign: () => true });

    expect(rows[0].draft.roles).toEqual([{ roleId: 'viewer', endsAt: null }, { roleId: 'admin', endsAt: null }]);
    expect(rows[1].problems).toEqual(['This role needs an end date or a reason. Give it from the profile after the import.']);
  });

  it('names the required columns a file lacks', () => {
    expect(checkImportRows([['Name', 'Mail'], ['Ann Smith', 'ann@example.com']], context).missingColumns).toEqual(['First name', 'Last name', 'Email']);
  });

  it('says what is wrong with each row', () => {
    const { rows } = checkImportRows([
      ['First name', 'Last name', 'Email', 'Phone', 'Department', 'Role'],
      ['', 'Smith', 'not-an-email', '12', 'Space', 'Pilot'],
      ['Ann', 'Lee', 'taken@example.com', '', 'design', 'viewer'],
      ['Bo', 'Kim', 'bo@example.com', '', '', 'Administrator'],
      ['Cy', 'Ng', 'cy@example.com', '', '', ''],
      ['Cy', 'Ng', 'CY@example.com', '', '', ''],
    ], context);

    expect(rows.map(row => row.problems)).toEqual([
      ['First and last name are needed.', 'The email is not valid.', 'The phone number is not valid.', 'Unknown department.', 'Unknown role.'],
      ['Another user already has this email.'],
      ['Your role cannot give this role.'],
      [],
      ['This email is in the file twice.'],
    ]);
    expect(rows[1].draft.department).toBe('Design');
  });

  it('keeps to the allowed domains', () => {
    const { rows } = checkImportRows([['First name', 'Last name', 'Email'], ['Ann', 'Lee', 'ann@gmail.com'], ['Bo', 'Kim', 'bo@corp.example']], {
      ...context,
      allowedDomains: ['corp.example'],
    });

    expect(rows.map(row => row.problems.length)).toEqual([1, 0]);
  });

  it('puts people in an open branch by code or name, and leaves the column alone with branches off', () => {
    const branches = [
      { id: 'b-cnx', code: 'CNX', name: 'Chiang Mai', active: true, createdAt: '' },
      { id: 'b-pyx', code: 'PYX', name: 'Pattaya', active: false, createdAt: '' },
    ];
    const cells = [
      ['First name', 'Last name', 'Email', 'Branch'],
      ['Ann', 'Lee', 'ann@example.com', 'cnx'],
      ['Bo', 'Kim', 'bo@example.com', 'Chiang Mai'],
      ['Cy', 'Ng', 'cy@example.com', 'Pattaya'],
      ['Di', 'Wu', 'di@example.com', 'Nowhere'],
      ['Ed', 'Po', 'ed@example.com', ''],
    ];

    const { rows } = checkImportRows(cells, { ...context, branches });
    expect(rows.map(row => row.draft.branchId)).toEqual(['b-cnx', 'b-cnx', 'b-pyx', null, null]);
    expect(rows.map(row => row.problems)).toEqual([[], [], ['This branch is closed. Pick an open one.'], ['Unknown branch.'], []]);

    const off = checkImportRows(cells, context);
    expect(off.rows.every(row => !row.problems.length && row.draft.branchId === null)).toBe(true);
  });
});
