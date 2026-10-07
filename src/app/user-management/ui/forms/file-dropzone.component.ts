import { booleanAttribute, ChangeDetectionStrategy, Component, input, output, signal, ViewEncapsulation } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { lucideCloudUpload, lucideX } from '@ng-icons/lucide';

/**
 * Click or drop a file. Shows `preview` (an image URL) when set, with a button to remove it.
 * Set `compact` to lay it out as one row, for a field among other fields.
 *
 *   <ui-file-dropzone accept="image/*" [preview]="avatar()" (fileSelected)="read($event)" (removed)="avatar.set('')"
 *     title="Click to upload or drag and drop" hint="PNG or JPG, up to 2 MB" />
 */
@Component({
  selector: 'ui-file-dropzone',
  imports: [NgIcon],
  template: `
    <label
      class="ui-drop"
      [class.ui-drop-over]="dragging()"
      (dragover)="$event.preventDefault(); dragging.set(true)"
      (dragleave)="dragging.set(false)"
      (drop)="drop($event)">
      <input type="file" class="ui-sr-only" [accept]="accept()" (change)="pick($event)" />
      @if (preview()) {
        <img class="ui-drop-preview" [src]="preview()" alt="" />
      } @else {
        <span class="ui-drop-icon"><ng-icon [svg]="uploadIcon" /></span>
      }
      <span class="ui-drop-text">
        <span class="ui-drop-title">{{ title() }}</span>
        @if (hint()) {
          <span class="ui-drop-hint">{{ hint() }}</span>
        }
      </span>
    </label>
    @if (preview()) {
      <button type="button" class="ui-drop-remove" [attr.aria-label]="removeLabel()" (click)="removed.emit()">
        <ng-icon [svg]="removeIcon" />
      </button>
    }
  `,
  styles: `
    .ui-file-dropzone {
      position: relative;
      display: block;
      font-family: var(--ui-font);
    }

    .ui-drop {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .25rem;
      margin: 0;
      padding: 1.5rem 1rem;
      border: 1.5px dashed var(--ui-border-strong);
      border-radius: var(--ui-radius-lg);
      background: var(--ui-surface-muted);
      text-align: center;
      cursor: pointer;
      transition: border-color .15s ease, background-color .15s ease;

      &:hover,
      &:focus-within,
      &.ui-drop-over {
        border-color: var(--ui-primary);
        background: var(--ui-primary-soft);
      }
    }

    .ui-drop-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      margin-bottom: .375rem;
      border-radius: 50%;
      background: var(--ui-primary-soft);
      color: var(--ui-primary-text);
      font-size: 1.25rem;
    }

    .ui-drop-preview {
      width: 72px;
      height: 72px;
      margin-bottom: .375rem;
      border-radius: 50%;
      object-fit: cover;
      box-shadow: var(--ui-shadow-sm);
    }

    .ui-drop-text {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .25rem;
    }

    .ui-drop-title {
      color: var(--ui-heading);
      font-size: .875rem;
      font-weight: 500;
    }

    .ui-drop-hint {
      color: var(--ui-muted);
      font-size: .75rem;
    }

    .ui-drop-remove {
      position: absolute;
      top: .5rem;
      inset-inline-end: .5rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--ui-border);
      border-radius: .375rem;
      background: var(--ui-surface);
      color: var(--ui-muted);
      cursor: pointer;

      &:hover {
        color: var(--ui-danger-text);
      }
    }

    .ui-file-dropzone-compact {
      .ui-drop {
        flex-direction: row;
        gap: .875rem;
        padding: .75rem 1rem;
        // Room for the remove button
        padding-inline-end: 3rem;
        text-align: start;
      }

      .ui-drop-icon,
      .ui-drop-preview {
        flex-shrink: 0;
        width: 48px;
        height: 48px;
        margin-bottom: 0;
      }

      .ui-drop-text {
        align-items: flex-start;
        gap: .125rem;
      }

      .ui-drop-remove {
        top: 50%;
        inset-inline-end: .75rem;
        transform: translateY(-50%);
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-file-dropzone', '[class.ui-file-dropzone-compact]': 'compact()' },
})
export class UiFileDropzone {
  readonly accept = input('');
  readonly preview = input<string | null | undefined>('');
  readonly title = input('Click to upload or drag and drop');
  readonly hint = input('');
  readonly removeLabel = input('Remove');
  readonly compact = input(false, { transform: booleanAttribute });
  readonly fileSelected = output<File>();
  readonly removed = output<void>();

  protected readonly uploadIcon = lucideCloudUpload;
  protected readonly removeIcon = lucideX;
  protected readonly dragging = signal(false);

  protected pick(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.fileSelected.emit(file);
    }
    // Lets the same file be picked again after removing it
    input.value = '';
  }

  protected drop(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.fileSelected.emit(file);
    }
  }
}
