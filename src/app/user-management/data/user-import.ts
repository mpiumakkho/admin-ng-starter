import { DEPARTMENTS } from './catalog';
import { Role, UserDraft, UserStatus } from './models';

/** The columns of an import file; headers match without regard to case, spaces or underscores */
export const IMPORT_COLUMNS = ['First name', 'Last name', 'Email', 'Phone', 'Department', 'Role'] as const;

const KEYS: Record<string, keyof Omit<UserDraft, 'status' | 'avatar'>> = {
  firstname: 'firstName',
  lastname: 'lastName',
  email: 'email',
  phone: 'phone',
  department: 'department',
  role: 'roleId',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+\-\s]{9,15}$/;

export interface ImportRow {
  /** Line in the file, counting the header as 1 */
  line: number;
  draft: UserDraft;
  /** Translation keys of what is wrong; empty when the row can be imported */
  problems: string[];
}

export interface ImportContext {
  roles: readonly Role[];
  /** Emails already in use, lower-cased */
  takenEmails: ReadonlySet<string>;
  allowedDomains: readonly string[];
  defaultRoleId: string;
  /** Whether the person importing may give this role */
  canAssign: (role: Role) => boolean;
  status: UserStatus;
}

/**
 * Reads parsed CSV rows (header first) into user drafts, and says what is wrong with each, the way the server
 * would refuse it. A missing role takes the default role from the settings.
 */
export function checkImportRows(rows: string[][], context: ImportContext): { rows: ImportRow[]; missingColumns: string[] } {
  const [header = [], ...data] = rows;
  const columns = header.map(name => KEYS[name.toLowerCase().replace(/[\s_-]/g, '')]);
  const missingColumns = (['firstName', 'lastName', 'email'] as const)
    .filter(key => !columns.includes(key))
    .map(key => IMPORT_COLUMNS[Object.values(KEYS).indexOf(key)]);
  const seen = new Set<string>();

  const checked = data.map((cells, index) => {
    const value = (key: string) => (cells[columns.indexOf(key as never)] ?? '').trim();
    const roleText = value('roleId').toLowerCase();
    const role = roleText
      ? context.roles.find(item => item.id.toLowerCase() === roleText || item.name.toLowerCase() === roleText)
      : context.roles.find(item => item.id === context.defaultRoleId);
    const departmentText = value('department').toLowerCase();
    const department = departmentText ? DEPARTMENTS.find(item => item.toLowerCase() === departmentText) : DEPARTMENTS[0];
    const email = value('email').toLowerCase();

    const problems: string[] = [];
    if (!value('firstName') || !value('lastName')) {
      problems.push('First and last name are needed.');
    }
    if (!EMAIL.test(email)) {
      problems.push('The email is not valid.');
    } else if (context.takenEmails.has(email)) {
      problems.push('Another user already has this email.');
    } else if (seen.has(email)) {
      problems.push('This email is in the file twice.');
    } else if (context.allowedDomains.length && !context.allowedDomains.includes(email.split('@')[1])) {
      problems.push('This email is not on one of the allowed domains.');
    }
    seen.add(email);
    if (value('phone') && !PHONE.test(value('phone'))) {
      problems.push('The phone number is not valid.');
    }
    if (!department) {
      problems.push('Unknown department.');
    }
    if (!role) {
      problems.push('Unknown role.');
    } else if (!context.canAssign(role)) {
      problems.push('Your role cannot give this role.');
    }

    const draft: UserDraft = {
      firstName: value('firstName'),
      lastName: value('lastName'),
      email,
      phone: value('phone'),
      department: department ?? '',
      roleId: role?.id ?? '',
      status: context.status,
      avatar: '',
    };
    return { line: index + 2, draft, problems };
  });
  return { rows: checked, missingColumns };
}
