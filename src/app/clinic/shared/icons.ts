/* The workspace's icons, one registry as in the design (components/icons.tsx); Lucide, no emoji */
import {
  lucideBaby, lucideBadgeAlert, lucideCalculator, lucideCalendarDays, lucideCat, lucideCircleDot, lucideClipboardCheck, lucideClipboardList,
  lucideDog, lucideFlaskConical, lucideHand, lucideHeartOff, lucideHistory, lucideListOrdered, lucideNotebookPen, lucidePawPrint, lucidePill,
  lucideReceipt, lucideScrollText, lucideShieldHalf, lucideStethoscope, lucideSyringe, lucideTriangleAlert, lucideUserPlus, lucideUserRound,
} from '@ng-icons/lucide';

import type { AlertType, PetKind } from '../data/types';

export const NAV_ICONS = {
  queue: lucideListOrdered,
  appointments: lucideCalendarDays,
  encounter: lucideStethoscope,
  orders: lucideClipboardList,
  results: lucideFlaskConical,
  dispense: lucidePill,
  register: lucideUserPlus,
};

export const ALERT_ICONS: Record<AlertType, string> = {
  allergy: lucideTriangleAlert,
  drug: lucideBadgeAlert,
  handling: lucideHand,
  dnr: lucideHeartOff,
  isolation: lucideShieldHalf,
  pregnancy: lucideBaby,
};

export const PET_ICONS: Record<PetKind, string> = { dog: lucideDog, cat: lucideCat, other: lucidePawPrint };

export const RAIL_ICONS = {
  alerts: lucideTriangleAlert,
  patient: lucidePawPrint,
  owner: lucideUserRound,
  visit: lucideStethoscope,
  problems: lucideCircleDot,
  meds: lucidePill,
  vaccines: lucideSyringe,
  visits: lucideHistory,
  docs: lucideScrollText,
  notes: lucideNotebookPen,
  results: lucideFlaskConical,
  estimate: lucideCalculator,
  billing: lucideReceipt,
  consent: lucideClipboardCheck,
};
