// Transfer memos. Free text from the user, stored locally only (ERC-20/native
// transfers have no memo field, and putting one on-chain would defeat a stealth
// transfer). Trim, cap, and treat blank as absent so an empty field never
// writes a row.

export const NOTE_MAX = 80;

export function cleanNote(s: string | undefined): string | undefined {
  return s?.trim().slice(0, NOTE_MAX) || undefined;
}
