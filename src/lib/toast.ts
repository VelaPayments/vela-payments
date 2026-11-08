/**
 * Lightweight toast facade for MVP feedback.
 * Replace the console transport with a native toast/snackbar library when UI hardening lands.
 *
 * Policy: never pass private keys, seeds, full NFC payloads, or other secrets in messages.
 */

function showSuccess(message: string) {
  console.log(`[toast.success] ${message}`);
}

function showError(message: string) {
  console.error(`[toast.error] ${message}`);
}

export const toast = {
  success: showSuccess,
  error: showError,
};
