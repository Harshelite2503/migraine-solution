// Writes the public privacy policy page (dist-web/privacy.html) from src/legal/privacy.js, so the
// app and the page never disagree. Its URL goes in the App Store and Google Play listings.
import fs from 'node:fs';
import { PRIVACY_CONTACT, PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../src/legal/privacy.js';
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const out = process.argv[2] || 'dist-web/privacy.html';
const body = PRIVACY_SECTIONS.map(([t, lines]) => `<section><h2>${esc(t)}</h2>${lines.map(l => `<p>${esc(l)}</p>`).join('')}</section>`).join('\n');
// Same night palette as src/lib/theme.ts (night, ink, ink2, ink3, smoke, hairline, lamp); a static page cannot import it.
fs.writeFileSync(out, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0B0D12"><meta name="color-scheme" content="dark">
<title>Still privacy policy</title><style>
html{background:#0B0D12;-webkit-text-size-adjust:100%}
body{margin:0;background:#0B0D12;color:#E7E2D8;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:680px;margin:0 auto;padding:48px 20px 72px}h1{font:400 34px/1.15 ui-serif,serif;letter-spacing:-0.3px;margin:0 0 8px}
h2{font:400 20px/1.3 ui-serif,serif;margin:0 0 6px}section{border:1px solid rgba(255,255,255,0.07);border-radius:24px;padding:18px 20px;margin:16px 0;background:rgba(255,255,255,0.04)}
p{color:#A8A399;margin:6px 0}.meta{color:#8A857C;font-size:12.5px}a{color:#C29A62}
a:focus-visible{outline:2px solid rgba(194,154,98,0.7);outline-offset:3px}</style></head>
<body><main><h1>Your data stays yours</h1><p class="meta">Still privacy policy · last updated ${esc(PRIVACY_UPDATED)}</p>
<p>Short version: everything stays on your device unless you choose otherwise.</p>
${body}
<p class="meta">Questions or deletion requests: ${esc(PRIVACY_CONTACT)}.</p><p><a href="/">Open Still</a></p></main></body></html>`);
console.log('wrote', out);
