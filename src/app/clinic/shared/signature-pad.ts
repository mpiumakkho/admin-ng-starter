import { Component, ElementRef, input, output, viewChild } from '@angular/core';

import { TxPipe } from '../i18n/clinic-i18n';

/**
 * A box to sign in with a finger, a pen or the mouse. It gives the signature as a PNG data URL, or '' once cleared.
 * The stroke follows the text colour, so it shows in both themes; the image is drawn dark on white for printing.
 */
@Component({
  selector: 'cl-signature-pad',
  imports: [TxPipe],
  template: `
    <div class="sig-pad">
      <canvas #canvas [attr.aria-label]="label()" role="img"
        (pointerdown)="start($event)" (pointermove)="move($event)" (pointerup)="end()" (pointercancel)="end()" (pointerleave)="end()"></canvas>
      <span class="sig-line" aria-hidden="true"></span>
      <button type="button" class="link sig-clear" (click)="clear()">{{ 'ล้างลายเซ็น' | tx }}</button>
    </div>
  `,
  host: { class: 'contents' },
})
export class SignaturePad {
  readonly label = input('');
  readonly signed = output<string>();
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private drawing = false;
  private inked = false;

  private context(): CanvasRenderingContext2D | null {
    const canvas = this.canvas().nativeElement;
    const box = canvas.getBoundingClientRect();
    // Sized to the box it is shown in, once, so strokes land under the pointer
    if (canvas.width !== Math.round(box.width) || canvas.height !== Math.round(box.height)) {
      canvas.width = Math.round(box.width);
      canvas.height = Math.round(box.height);
      this.inked = false;
    }
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = getComputedStyle(canvas).color || '#111';
    }
    return ctx;
  }

  protected start(event: PointerEvent) {
    const ctx = this.context();
    if (!ctx) {
      return;
    }
    this.drawing = true;
    this.canvas().nativeElement.setPointerCapture?.(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(event.offsetX, event.offsetY);
    ctx.lineTo(event.offsetX + 0.1, event.offsetY + 0.1);
    ctx.stroke();
    this.inked = true;
  }

  protected move(event: PointerEvent) {
    if (!this.drawing) {
      return;
    }
    const ctx = this.canvas().nativeElement.getContext('2d');
    ctx?.lineTo(event.offsetX, event.offsetY);
    ctx?.stroke();
  }

  protected end() {
    if (!this.drawing) {
      return;
    }
    this.drawing = false;
    if (this.inked) {
      this.signed.emit(printable(this.canvas().nativeElement));
    }
  }

  protected clear() {
    const canvas = this.canvas().nativeElement;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    this.inked = false;
    this.signed.emit('');
  }
}

/** The signature dark on white, whatever the theme drew it in */
export function printable(canvas: HTMLCanvasElement): string {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  if (!ctx) {
    return canvas.toDataURL('image/png');
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.filter = 'grayscale(1) brightness(0)';
  ctx.drawImage(canvas, 0, 0);
  return out.toDataURL('image/png');
}
