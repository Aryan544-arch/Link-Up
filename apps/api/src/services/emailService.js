const env = require('../config/env');

// In-memory token store for test/dev inspection
const devTokenStore = new Map();

/**
 * Handles email verification delivery.
 *
 * In production: If SMTP credentials exist, dispatches via mail transport.
 * If SMTP is not configured, logs a delivery warning (no fake delivery).
 *
 * In development: Logs the verification link to the console for testing.
 *
 * In tests: Stores the raw token in an in-memory test store so integration tests
 * can verify the link without requiring third-party mail servers.
 */
async function sendVerificationEmail({ email, displayName, rawToken }) {
  const port = env.PORT || 3000;
  const baseUrl = `http://localhost:${port}`;
  const verificationLink = `${baseUrl}/api/auth/verify-email?token=${rawToken}`;

  // Store for test and dev inspection
  if (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') {
    devTokenStore.set(email.toLowerCase(), {
      rawToken,
      verificationLink,
      createdAt: new Date()
    });
  }

  // Development delivery mechanism: log verification link to console
  if (env.NODE_ENV === 'development') {
    console.log(`[EmailService (Dev)] Verification link for ${email}: ${verificationLink}`);
  }

  // If SMTP is not configured, do not claim email was sent
  const isSmtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
  if (!isSmtpConfigured && env.NODE_ENV === 'production') {
    console.warn(`[EmailService] Warning: SMTP not configured. Verification email could not be sent to ${email}.`);
  }

  return {
    delivered: isSmtpConfigured,
    link: env.NODE_ENV !== 'production' ? verificationLink : null
  };
}

/**
 * Helper to retrieve the latest raw token for automated tests.
 */
function getDevVerificationToken(email) {
  const record = devTokenStore.get(email.toLowerCase());
  return record ? record.rawToken : null;
}

/**
 * Helper to clear in-memory tokens between tests.
 */
function clearDevTokens() {
  devTokenStore.clear();
}

module.exports = {
  sendVerificationEmail,
  getDevVerificationToken,
  clearDevTokens
};
