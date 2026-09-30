// Turns what someone types into the login box into the real email Supabase
// Auth needs. Every account in this project follows one convention: its real
// address is `onyxtech26+<code>@gmail.com`, where <code> is the branch code for
// staff (MRT, KMT, ...) or the role name for everyone else (admin, boss, manager).
// Gmail delivers every one of those to the same inbox — that's what makes "Forgot
// password?" still work: the short code expands to a REAL address before it is
// sent anywhere, so recovery email is unaffected by this shortcut.
//
// This is specific to this deployment (one owner's inbox, during the internship
// build-out). If MPT later gives branches their own real email addresses, this
// becomes a lookup against a stored email instead of a formula — see
// docs/REPAIR_MODULE_SPEC.md's Daily Report / login section.
//
// A value already containing "@" is trusted as a full email and passed through
// unchanged, so anyone who prefers typing the real address still can.
const EMAIL_DOMAIN = 'onyxtech26+%@gmail.com';

export function toLoginEmail(input: string): string {
  const v = input.trim();
  if (v === '' || v.includes('@')) return v;
  return EMAIL_DOMAIN.replace('%', v.toLowerCase());
}
