// Privacy policy text, shared by the in-app overlay (components/PrivacySheet.tsx) and the public
// web page (scripts/privacy-html.mjs -> /privacy.html, the URL for the app store listings).
// A draft for the owner to review; 1996shivankursharma@gmail.com must be filled in before publishing.
export const PRIVACY_UPDATED = 'November 2026';
export const PRIVACY_CONTACT = '1996shivankursharma@gmail.com';
/** @type {[string, string[]][]} */
export const PRIVACY_SECTIONS = [
  ['On your device', [
    'Your sound is generated on your phone or in your browser. Your answers, listening-test results, journal and activity log are stored only on that device.',
    'You can clear the journal and activity log at any time from the Journal.',
  ]],
  ['Only if you choose: an account', [
    'Signing in is optional. If you sign in, we store your email address so we can send you a sign-in link.',
    'You can delete your account at any time under My sound, Account. This deletes the account and everything stored with it on our server.',
  ]],
  ['Only if you choose: "Help improve Still"', [
    'Off unless you turn it on. When on, Still shares what you play, for how long and how it felt, with the day but never the time of day, your name or your notes.',
    'Without an account, this is linked to a random code, not to you. You can turn it off at any time, and delete everything you have shared.',
  ]],
  ['Only if you choose: the AI review', [
    'If you ask for an AI review, a short summary of your sound settings and answers is sent to our review server and an AI model, used to make the suggestion, and not kept.',
  ]],
  ['What we never do', [
    'No ads, no tracking across other apps or websites, and no selling or sharing of your data. Data about your headaches is never used for marketing.',
  ]],
  ['Where data is kept', [
    'Account and shared usage data are stored with Supabase. The review server runs on Microsoft Azure.',
  ]],
  ['Medical note', [
    'Still is for comfort and does not diagnose, treat or prevent migraine. If your headaches change, or you have a sudden, severe or unusual headache, get medical help.',
  ]],
];
