/*
 * Printing the clinic's documents: a page built from text, printed from a hidden frame so the workspace stays as it is
 * (seph1-docs 26-printing-architecture.md: the browser's print dialog, one layout per paper size).
 */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Text made safe to put in the page */
export const esc = (text: string | number | undefined | null) => String(text ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

/** The paper a document is printed on */
export type Paper = 'label' | 'a5' | 'a4';
const PAPER: Record<Paper, string> = { label: '100mm 70mm', a5: 'A5', a4: 'A4' };

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; font: 12px/1.45 'Sarabun', 'Noto Sans Thai', 'Leelawadee UI', Tahoma, sans-serif; }
  h1 { margin: 0; font-size: 15px; } h2 { margin: 10px 0 4px; font-size: 13px; }
  p { margin: 2px 0; } .muted { color: #555; } .big { font-size: 15px; font-weight: 700; }
  .head { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1.5px solid #111; padding-bottom: 4px; margin-bottom: 6px; }
  .box { border: 1px solid #111; padding: 6px 8px; margin: 6px 0; }
  .warn { border: 1.5px solid #111; padding: 3px 6px; font-weight: 700; display: inline-block; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 3px 4px; border-bottom: 1px solid #bbb; vertical-align: top; }
  th { font-weight: 600; } .num { text-align: right; white-space: nowrap; }
  .sign { display: flex; gap: 24px; margin-top: 28px; } .sign > div { flex: 1; border-top: 1px solid #111; padding-top: 3px; text-align: center; }
`;

/** Prints one document; the frame goes away after the print dialog closes */
export function printDocument(title: string, body: string, options: { paper: Paper; lang: string; css?: string }) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position: fixed; right: 0; bottom: 0; width: 0; height: 0; border: 0;';
  frame.srcdoc = `<!doctype html><html lang="${esc(options.lang)}"><head><meta charset="utf-8"><title>${esc(title)}</title>`
    + `<style>@page { size: ${PAPER[options.paper]}; margin: ${options.paper === 'label' ? '4mm' : '14mm'}; }${BASE_CSS}${options.css ?? ''}</style>`
    + `</head><body>${body}</body></html>`;
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) {
      frame.remove();
      return;
    }
    const remove = () => setTimeout(() => frame.remove(), 500);
    win.addEventListener('afterprint', remove, { once: true });
    win.focus();
    win.print();
    // Browsers that print without a dialog, or never say it closed
    setTimeout(remove, 60_000);
  };
  document.body.append(frame);
}
