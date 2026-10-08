import { AdminApiError, AdminApiErrorCode } from '../data/admin-api';

/** A translation key for each refusal the pages can meet; pages may say something more specific */
const MESSAGES: Partial<Record<AdminApiErrorCode, string>> = {
  forbidden: 'Your role does not allow this.',
  self_change: 'You cannot do this to your own account.',
  unauthenticated: 'Your session has ended. Sign in again to continue.',
  not_found: 'It no longer exists. Someone may have deleted it.',
  email_taken: 'Another user already has this email.',
  role_in_use: 'This role still has users. Move them to another role first.',
  system_role: 'Built-in roles cannot be deleted.',
  email_domain: 'This email is not on one of the allowed domains.',
  weak_password: 'This password is too short.',
  password_reused: 'You used this password recently. Choose another one.',
  two_factor_mandatory: 'Your role requires two-step sign-in. Turn it on to continue.',
  default_role: 'New users get this role by default. Pick another default in the settings first.',
  invalid_code: 'That code is not right. Codes change every 30 seconds; try the newest one.',
  invalid_token: 'This link has expired or was already used.',
  invalid_credentials: 'The current password is not right.',
  too_many_requests: 'Too many attempts. Wait a few minutes and try again.',
};

/** The translation key that explains why a request failed */
export function errorMessage(error: unknown): string {
  return (error instanceof AdminApiError && MESSAGES[error.code]) || 'Something went wrong. Try again.';
}
