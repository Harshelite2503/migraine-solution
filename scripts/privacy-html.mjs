// Writes the public privacy policy page (dist-web/privacy.html) from src/legal/privacy.js, so the
// app and the page never disagree. Its URL goes in the App Store and Google Play listings.
import fs from 'node:fs';
import { PRIVACY_CONTACT, PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../src/legal/privacy.js';
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const out = process.argv[2] || 'dist-web/privacy.html';
const body = PRIVACY_SECTIONS.map(([t, lines]) => `<section><h2>${esc(t)}</h2>${lines.map(l => `<p>${esc(l)}</p>`).join('')}</section>`).join('\n');
fs.writeFileSync(out, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Still privacy policy</title><style>
body{margin:0;background:#0b100d;color:#e6ebe3;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:680px;margin:0 auto;padding:48px 20px 72px}h1{font:500 38px/1.15 Georgia,serif;margin:0 0 8px}
h2{font:500 21px Georgia,serif;margin:0 0 6px}section{border:1px solid #243028;border-radius:16px;padding:18px 20px;margin:16px 0;background:#111814}
p{color:#a9b3a6;margin:6px 0}.meta{color:#78857c;font-size:14px}a{color:#a9c79b}</style></head>
<body><main><h1>Your data stays yours</h1><p class="meta">Still privacy policy · last updated ${esc(PRIVACY_UPDATED)}</p>
<p>Short version: everything stays on your device unless you choose otherwise.</p>
${body}
<p class="meta">Questions or deletion requests: ${esc(PRIVACY_CONTACT)}.</p><p><a href="/">Open Still</a></p></main></body></html>`);
console.log('wrote', out);
