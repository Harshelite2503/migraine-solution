// The web document shell. Expo Router only renders this file under `web.output: static`; the default
// `single` output builds index.html from the CLI template instead, so the baseline CSS lives in
// src/lib/shell.css (loaded by src/lib/webShell.web.ts) and the metas are applied at runtime there. Keeping this
// file means a switch to static output ships the same shell with no further work.
import type { ReactNode } from 'react';
import { useServerDocumentContext } from 'expo-router/html';

const NIGHT = '#0B0D12'; // colors.night; theme.ts imports react-native, which this Node-only file must not load.

// Root sizing before any JavaScript runs: a full-height flex root and the night floor, never a white frame.
const ROOT_CSS = `
html, body { height: 100%; background: ${NIGHT}; }
body { overflow: hidden; margin: 0; }
#root { display: flex; flex: 1; height: 100%; min-height: 100dvh; }
`;

export default function Root({ children }: { children: ReactNode }) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
        <meta name="theme-color" content={NIGHT} />
        <meta name="color-scheme" content="dark" />
        <style id="still-root" dangerouslySetInnerHTML={{ __html: ROOT_CSS }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
