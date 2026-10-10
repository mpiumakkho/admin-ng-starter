import { CdkMenu, CdkMenuItem, CdkMenuItemCheckbox, CdkMenuItemRadio, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, Directive, input, ViewEncapsulation } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';

/**
 * Opens a menu, built on the Angular CDK menu (keyboard navigation, focus handling, positioning).
 *
 *   <button uiButton variant="ghost" iconOnly [uiMenuTrigger]="actions" aria-label="Actions">…</button>
 *   <ng-template #actions>
 *     <ui-menu>
 *       <button uiMenuItem [icon]="lucidePencil" (triggered)="edit()">Edit</button>
 *       <hr uiMenuDivider />
 *       <button uiMenuItem tone="danger" [icon]="lucideTrash2" (triggered)="remove()">Delete</button>
 *     </ui-menu>
 *   </ng-template>
 *
 * For one choice out of several, use `uiMenuItemRadio` items, with a label for the group:
 *
 *   <ui-menu aria-label="Rows per page">
 *     <div uiMenuHeading>Rows per page</div>
 *     <button uiMenuItemRadio [checked]="size() === 10" (triggered)="size.set(10)">10</button>
 *   </ui-menu>
 */
@Directive({
  selector: '[uiMenuTrigger]',
  hostDirectives: [{
    directive: CdkMenuTrigger,
    inputs: ['cdkMenuTriggerFor: uiMenuTrigger', 'cdkMenuPosition: uiMenuPosition'],
    outputs: ['cdkMenuOpened: menuOpened', 'cdkMenuClosed: menuClosed'],
  }],
})
export class UiMenuTrigger {}

@Component({
  selector: 'ui-menu',
  template: `<ng-content />`,
  styles: `
    .ui-menu {
      display: flex;
      flex-direction: column;
      min-width: 190px;
      margin: 4px 0;
      padding: .375rem;
      border: 1px solid var(--ui-border);
      border-radius: var(--ui-radius-lg);
      background: var(--ui-surface);
      box-shadow: var(--ui-shadow-lg);
      font-family: var(--ui-font);
      animation: ui-menu-in .16s var(--ui-ease);
      outline: none;
    }

    .ui-menu-item {
      display: flex;
      align-items: center;
      gap: .625rem;
      width: 100%;
      padding: .5rem .75rem;
      border: 0;
      border-radius: .375rem;
      background: transparent;
      color: var(--ui-text);
      font: 400 .875rem/1.3 var(--ui-font);
      text-align: start;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;

      ng-icon {
        color: var(--ui-subtle);
        font-size: 1rem;
      }

      &:hover,
      &:focus,
      &.cdk-focused {
        background: var(--ui-hover);
        color: var(--ui-heading);
        outline: none;
      }

      &:disabled {
        opacity: .5;
        cursor: not-allowed;
      }
    }

    .ui-menu-item-danger {
      color: var(--ui-danger-text);

      ng-icon {
        color: inherit;
      }

      &:hover,
      &:focus,
      &.cdk-focused {
        background: var(--ui-danger-soft);
        color: var(--ui-danger-text);
      }
    }

    .ui-menu-heading {
      padding: .375rem .75rem .25rem;
      color: var(--ui-subtle);
      font: 600 .6875rem/1.3 var(--ui-font);
      letter-spacing: .04em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .ui-menu-item-check {
      margin-inline-start: auto;
      visibility: hidden;

      [aria-checked='true'] > & {
        visibility: visible;
        color: var(--ui-primary-text);
      }
    }

    .ui-menu-divider {
      height: 1px;
      margin: .375rem -.375rem;
      border: 0;
      background: var(--ui-border);
    }

    @keyframes ui-menu-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [CdkMenu],
  host: { class: 'ui-menu' },
})
export class UiMenu {}

@Component({
  selector: 'button[uiMenuItem], a[uiMenuItem]',
  imports: [NgIcon],
  template: `
    @if (icon(); as svg) {
      <ng-icon [svg]="svg" />
    }
    <ng-content />
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: CdkMenuItem, outputs: ['cdkMenuItemTriggered: triggered'] }],
  host: { class: 'ui-menu-item', '[class.ui-menu-item-danger]': 'tone() === "danger"' },
})
export class UiMenuItem {
  /** SVG markup, for example a Lucide icon */
  readonly icon = input<string>();
  readonly tone = input<'default' | 'danger'>('default');
}

/** A menu item that is one choice out of several; the chosen one shows a check mark */
@Component({
  selector: 'button[uiMenuItemRadio]',
  imports: [NgIcon],
  template: `
    <ng-content />
    <ng-icon class="ui-menu-item-check" [svg]="checkIcon" />
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: CdkMenuItemRadio, inputs: ['cdkMenuItemChecked: checked'], outputs: ['cdkMenuItemTriggered: triggered'] }],
  host: { class: 'ui-menu-item' },
})
export class UiMenuItemRadio {
  protected readonly checkIcon = lucideCheck;
}

/** A menu item that is on or off, such as a setting; on, it shows a check mark */
@Component({
  selector: 'button[uiMenuItemCheckbox]',
  imports: [NgIcon],
  template: `
    @if (icon(); as svg) {
      <ng-icon [svg]="svg" />
    }
    <ng-content />
    <ng-icon class="ui-menu-item-check" [svg]="checkIcon" />
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: CdkMenuItemCheckbox, inputs: ['cdkMenuItemChecked: checked'], outputs: ['cdkMenuItemTriggered: triggered'] }],
  host: { class: 'ui-menu-item' },
})
export class UiMenuItemCheckbox {
  /** SVG markup, for example a Lucide icon */
  readonly icon = input<string>();
  protected readonly checkIcon = lucideCheck;
}

/** A small label above a group of items. Name the menu itself with aria-label for screen readers. */
@Directive({
  selector: '[uiMenuHeading]',
  host: { class: 'ui-menu-heading', 'aria-hidden': 'true' },
})
export class UiMenuHeading {}

@Directive({
  selector: 'hr[uiMenuDivider]',
  host: { class: 'ui-menu-divider', role: 'separator' },
})
export class UiMenuDivider {}
