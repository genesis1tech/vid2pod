/**
 * Test helper: creates a Bearer token for test requests.
 *
 * In test mode, the auth middleware accepts tokens in the format
 * "test_{userId}_{role}" as a bypass for Clerk JWT verification.
 */
export function createTestToken(userId = 'test-user-id', role = 'admin'): string {
  return `test_${userId}_${role}`;
}
