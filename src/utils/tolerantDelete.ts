/**
 * Deletes several collections in order. An optional collection that Firestore refuses
 * (permission-denied, for example when its rule is not published yet) is skipped,
 * so the rest of the account can still be deleted.
 * Any other error, or a refusal on a required collection, stops the deletion.
 */
export async function deleteCollectionsTolerant(
  names: string[],
  optional: string[],
  remove: (name: string) => Promise<void>,
): Promise<{ skipped: string[] }> {
  const skipped: string[] = [];
  for (const name of names) {
    try {
      await remove(name);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
      if (code === 'permission-denied' && optional.includes(name)) {
        skipped.push(name);
        continue;
      }
      throw error;
    }
  }
  return { skipped };
}

/** Collections of an account, in the order they are deleted. The profile document goes last. */
export const ACCOUNT_COLLECTIONS = ['day_plans', 'activities', 'messages', 'period_records', 'daily_logs', 'focus', 'behavior', 'movement_days'];

/** Collections that can be skipped without stopping the deletion. consent_events and data_requests are never deleted. */
export const OPTIONAL_ACCOUNT_COLLECTIONS = ['day_plans', 'focus', 'behavior', 'movement_days'];
