import { lucideLayoutDashboard, lucideUsersRound } from '@ng-icons/lucide';

import { Permission } from './data/models';

export interface UserManagementMenuLink {
  /** Translation key */
  label: string;
  link: string;
  /** The link shows only to people whose role has this permission */
  permission: Permission;
  /** And only while this setting is on, such as branchesEnabled */
  setting?: 'branchesEnabled';
  /**
   * The link also shows to people without the permission who take part in what the page lists, with how many things
   * wait for them there: 'accessReviews', the reviews they decide in (AdminStore.accessReviews and accessReviewsWaiting)
   */
  tasks?: 'accessReviews';
}

/** A page of its own in the app's menu, with an icon */
export interface UserManagementMenuPage extends UserManagementMenuLink {
  /** SVG string */
  icon: string;
}

/** One group in the app's menu, opened and closed like a dropdown */
export interface UserManagementMenuGroup {
  /** Translation key */
  label: string;
  /** SVG string */
  icon: string;
  children: UserManagementMenuLink[];
}

/** The overview: the first page after signing in, so it stands at the top of the menu rather than in the group */
export const USER_MANAGEMENT_OVERVIEW: UserManagementMenuPage = {
  label: 'Overview',
  icon: lucideLayoutDashboard,
  link: '/overview',
  permission: 'users.view',
};

/**
 * The rest of user management as one menu group. Show each link only when Session.canSomewhere(link.permission), or
 * for a link with tasks when the signed-in user takes part there, and, for a link with a setting, while
 * AdminStore.settings() has it on; and the group only when one of its links shows.
 */
export const USER_MANAGEMENT_MENU: UserManagementMenuGroup = {
  label: 'User management',
  icon: lucideUsersRound,
  children: [
    { label: 'Users', link: '/users', permission: 'users.view' },
    { label: 'Roles & permissions', link: '/roles', permission: 'roles.view' },
    { label: 'Access reviews', link: '/access-reviews', permission: 'reviews.manage', tasks: 'accessReviews' },
    { label: 'Branches', link: '/branches', permission: 'branches.view', setting: 'branchesEnabled' },
    { label: 'Activity log', link: '/activity', permission: 'activity.view' },
    { label: 'Settings', link: '/settings', permission: 'settings.view' },
  ],
};
