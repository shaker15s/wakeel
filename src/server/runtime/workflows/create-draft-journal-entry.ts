import { JournalDraftInput, validateJournalDraft, JournalDraftPolicyAccount } from '@/server/accounting/journal-entry';

/** Pure journal proposal builder. It deliberately has no connector/write capability. */
export function createDraftJournalEntryProposal(input: JournalDraftInput, configuredAccounts: JournalDraftPolicyAccount[]) {
  try {
    return { status: 'proposal' as const, journal: validateJournalDraft(input, configuredAccounts), approvalRequiredBeforeAnyERPWrite: true as const };
  } catch (error) {
    return { status: 'review_required' as const, reason: error instanceof Error ? error.message : 'Journal proposal could not be validated.' };
  }
}
