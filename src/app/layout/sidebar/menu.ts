import { Permission, USER_MANAGEMENT_MENU, USER_MANAGEMENT_OVERVIEW } from '../../user-management';

// The sidebar is drawn from this list. Labels are translation keys; icons are SVG strings.

export interface MenuLink {
  label: string;
  link: string;
  /** Shown only to people whose role has this permission */
  permission?: Permission;
}

export interface MenuItem {
  label: string;
  icon: string;
  /** A page; leave it out for a group */
  link?: string;
  permission?: Permission;
  /** Pages in a group, which opens and closes like a dropdown instead of navigating */
  children?: MenuLink[];
}

export interface MenuSection {
  /** A heading above the section; leave it out for the top of the menu */
  label?: string;
  items: MenuItem[];
}

export const MENU: MenuSection[] = [
  // The first page after signing in, on its own at the top
  { items: [USER_MANAGEMENT_OVERVIEW] },
  // Each part of the app brings its pages as one group; add other modules' groups here
  { label: 'Management', items: [USER_MANAGEMENT_MENU] },
];
