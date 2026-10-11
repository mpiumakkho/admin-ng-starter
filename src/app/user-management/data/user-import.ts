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
  role: 'roles',
  roles: 'roles',
};

/** Several roles in one cell, such as "Support; Auditor" */
const ROLE_SEPARATOR = /[;|]/;

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
 * would refuse it. The role cell may name several roles, separated by semicolons, each given for good; an empty one
 * gives the default role from the settings. A role with rules for giving it (an end date or a reason) is given from
 * the person's profile instead.
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
    const roleTexts = value('roles').toLowerCase().split(ROLE_SEPARATOR).map(text => text.trim()).filter(Boolean);
    const roles = roleTexts.length
      ? roleTexts.map(text => context.roles.find(item => item.id.toLowerCase() === text || item.name.toLowerCase() === text))
      : [context.roles.find(item => item.id === context.defaultRoleId)];
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
    if (roles.some(role => !role)) {
      problems.push('Unknown role.');
    } else if (roles.some(role => !context.canAssign(role!))) {
      problems.push('Your role cannot give this role.');
    } else if (roles.some(role => role!.assignment.maxDays !== null || role!.assignment.reasonRequired)) {
      problems.push('This role needs an end date or a reason. Give it from the profile after the import.');
    }

    const draft: UserDraft = {
      firstName: value('firstName'),
      lastName: value('lastName'),
      email,
      phone: value('phone'),
      department: department ?? '',
      roles: [...new Set(roles.filter(role => !!role).map(role => role!.id))].map(roleId => ({ roleId, endsAt: null })),
      status: context.status,
      avatar: '',
    };
    return { line: index + 2, draft, problems };
  });
  return { rows: checked, missingColumns };
}
