import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Validates that all participants in an expense are still members of the group.
 * Used to block edit/delete/restore of expenses where participants have left.
 *
 * Optimized to use 2 DB queries instead of 3 by JOINing friend data with splits.
 *
 * @param supabase - Supabase client
 * @param expenseId - The expense to validate
 * @param groupId - The group the expense belongs to
 * @returns Object with valid flag and list of exited participant user IDs
 */
export async function validateExpenseParticipantsAreMembers(
    supabase: SupabaseClient,
    expenseId: string,
    groupId: string
): Promise<{ valid: boolean; exitedParticipants: string[] }> {
    // Query 1: Get splits WITH friend info (JOIN) - combines splits + friend resolution
    const { data: splits } = await supabase
        .from('expense_splits')
        .select('user_id, friend:friends(linked_user_id)')
        .eq('expense_id', expenseId);

    if (!splits || splits.length === 0) {
        return { valid: true, exitedParticipants: [] };
    }

    // Query 2: Get current group members
    const { data: members } = await supabase
        .from('group_members')
        .select('friends!inner(linked_user_id)')
        .eq('group_id', groupId);

    const memberUserIds = new Set(
        members?.map((m: any) => m.friends.linked_user_id).filter(Boolean) || []
    );

    // Compare in memory - resolve each participant's user ID
    const exitedParticipants: string[] = [];

    splits.forEach((split: any) => {
        // Get user ID - either directly from split or resolved from friend JOIN
        const userId = split.user_id || split.friend?.linked_user_id;

        if (userId && !memberUserIds.has(userId)) {
            if (!exitedParticipants.includes(userId)) {
                exitedParticipants.push(userId);
            }
        }
    });

    return {
        valid: exitedParticipants.length === 0,
        exitedParticipants
    };
}
