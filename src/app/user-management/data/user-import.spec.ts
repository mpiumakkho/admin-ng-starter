import { parseCsv, toCsv } from '../shared/csv';
import { Role } from './models';
import { checkImportRows, ImportContext } from './user-import';

const roles = [
  { id: 'admin', name: 'Administrator', permissions: ['users.view', 'roles.manage'] },
  { id: 'viewer', name: 'Viewer', permissions: ['users.view'] },
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
    expect(rows[0]).toMatchObject({ line: 2, problems: [], draft: { email: 'ann@example.com', roleId: 'viewer', department: 'Engineering', status: 'invited' } });
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
});
