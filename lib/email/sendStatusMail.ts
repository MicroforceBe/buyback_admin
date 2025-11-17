// lib/email/sendStatusMail.ts
"use server";

import {
  sendStatusUpdateMail,
  StatusMailInput,
} from "./sendStatusUpdateMail";

// Exporteer hetzelfde input-type naar de rest van de code
export type { StatusMailInput };

/**
 * Backwards-compatible wrapper.
 * Oude code die nog `sendStatusMail` gebruikt, komt nu automatisch
 * terecht in de nieuwe implementatie in `sendStatusUpdateMail`.
 */
export async function sendStatusMail(input: StatusMailInput) {
  return sendStatusUpdateMail(input);
}
