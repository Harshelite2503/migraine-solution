/// <reference types="expo/types" />
// The web shell, loaded once from _layout.tsx. Web only: CSS imports and `document` belong to the
// browser, so native resolves the empty webShell.ts instead.
import { colors } from './theme';
import './shell.css';

// The default `single` web output builds index.html from the CLI template and ignores +html.tsx, so
// the shell's metas are set here, before the first render, for the safe-area insets to read them.
if (typeof document !== 'undefined') {
  const meta = (name: string, content: string) => {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
    el.content = content;
  };
  meta('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content');
  meta('theme-color', colors.night);
  meta('color-scheme', 'dark');
}

export {};
