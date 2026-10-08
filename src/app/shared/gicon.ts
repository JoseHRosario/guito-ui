import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'menu'
  | 'search'
  | 'chevron-left'
  | 'chevron-right'
  | 'plus'
  | 'check'
  | 'tag'
  | 'wifi'
  | 'shopping-bag'
  | 'zap'
  | 'film'
  | 'utensils'
  | 'heart'
  | 'credit-card'
  | 'dollar-sign'
  | 'audio-lines'
  | 'refresh-cw'
  | 'briefcase'
  | 'google';

/** Inline lucide-style glyphs; colored via currentColor so only tokens paint them. */
@Component({
  selector: 'g-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (name()) {
      @case ('menu') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg> }
      @case ('search') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg> }
      @case ('chevron-left') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg> }
      @case ('chevron-right') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg> }
      @case ('plus') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> }
      @case ('check') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg> }
      @case ('tag') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg> }
      @case ('wifi') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg> }
      @case ('shopping-bag') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg> }
      @case ('zap') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg> }
      @case ('film') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /></svg> }
      @case ('utensils') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><path d="M7 2v20" /><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" /></svg> }
      @case ('heart') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg> }
      @case ('credit-card') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg> }
      @case ('dollar-sign') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg> }
      @case ('audio-lines') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="10" x2="2" y2="14" /><line x1="6" y1="6" x2="6" y2="18" /><line x1="10" y1="3" x2="10" y2="21" /><line x1="14" y1="8" x2="14" y2="16" /><line x1="18" y1="5" x2="18" y2="19" /><line x1="22" y1="10" x2="22" y2="14" /></svg> }
      @case ('refresh-cw') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></svg> }
      @case ('briefcase') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><rect width="20" height="14" x="2" y="6" rx="2" /></svg> }
      <!-- Google G: official brand asset — brand colors, exempt from the token rule. -->
      @case ('google') { <svg viewBox="0 0 24 24" fill="none"><path fill="#4285F4" d="M24.64 12.204c0-.638-.057-1.251-.164-1.84H12v3.481h7.093a6.066 6.066 0 0 1-2.63 3.98v3.308h4.257c2.49-2.292 3.92-5.67 3.92-8.929z" /><path fill="#34A853" d="M12 24c3.24 0 5.956-1.075 7.943-2.907l-3.876-3.004c-1.076.72-2.447 1.146-4.067 1.146-3.126 0-5.771-2.112-6.714-4.951H1.276v3.417A11.996 11.996 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.286 14.284A7.201 7.201 0 0 1 4.906 12c0-.792.136-1.563.38-2.284V6.3H1.276A11.99 11.99 0 0 0 0 12c0 1.936.464 3.77 1.276 5.4l4.01-3.116z" /><path fill="#EA4335" d="M12 4.765c1.766 0 3.352.607 4.6 1.798l3.443-3.443C17.951 1.19 15.235 0 12 0 7.31 0 3.254 2.69 1.276 6.3l4.01 3.116C6.229 6.577 8.874 4.765 12 4.765z" /></svg> }
    }
  `,
  styles: [
    `
      :host { display: inline-flex; }
      svg { width: 100%; height: 100%; }
    `,
  ],
})
export class GIcon {
  readonly name = input.required<IconName>();
}
