import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, ViewEncapsulation } from '@angular/core';

export type UiAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<UiAvatarSize, number> = { xs: 24, sm: 32, md: 40, lg: 56, xl: 80 };

// Background colors for initials, picked from the name so a person keeps the same color
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];

/**
 * A round photo, or the person's initials on a color when there is no photo (or it fails to load).
 *
 *   <ui-avatar name="Henry Klein" src="faces/henry.jpg" size="md" />
 */
@Component({
  selector: 'ui-avatar',
  template: `
    @if (src() && !failed()) {
      <img [src]="src()" [alt]="name()" (error)="failed.set(true)" />
    } @else {
      <span aria-hidden="true">{{ initials() }}</span>
    }
  `,
  styles: `
    .ui-avatar {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 50%;
      color: #ffffff;
      font-family: var(--ui-font);
      font-weight: 600;
      line-height: 1;
      vertical-align: middle;
      user-select: none;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-avatar',
    role: 'img',
    '[attr.aria-label]': 'name()',
    '[style.width.px]': 'pixels()',
    '[style.height.px]': 'pixels()',
    '[style.font-size.px]': 'pixels() * 0.38',
    '[style.background]': 'src() && !failed() ? "var(--ui-hover)" : color()',
  },
})
export class UiAvatar {
  readonly name = input('');
  readonly src = input<string | null | undefined>('');
  readonly size = input<UiAvatarSize>('md');

  // Resets when the source changes, so a new photo gets a fresh try
  protected readonly failed = linkedSignal({ source: this.src, computation: () => false });

  protected readonly pixels = computed(() => SIZES[this.size()]);

  protected readonly initials = computed(() => {
    const words = this.name().trim().split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2);
    return letters.toUpperCase();
  });

  protected readonly color = computed(() => {
    let hash = 0;
    for (const char of this.name()) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return COLORS[hash % COLORS.length];
  });
}
