/** Color role shared by badges, chips, stat cards and other tinted components */
export type UiTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** One choice in a segmented control, filter chip row or similar picker */
export interface UiOption<T = string> {
  value: T;
  label: string;
  /** Number shown beside the label, such as how many rows match */
  count?: number;
  /** SVG markup, for example a Lucide icon from @ng-icons/lucide */
  icon?: string;
  /** Read out instead of a short label, such as "English" for "EN"; also shown as a tooltip */
  ariaLabel?: string;
  /** Language of the label, such as "th", so screen readers pronounce it right */
  lang?: string;
}
