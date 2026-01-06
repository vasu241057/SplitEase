import { SupabaseClient } from '@supabase/supabase-js';
import { coreSimplifyGroupDebts } from './recalculate';

/**
 * Cleans up stale data when a member exits a group.
 *
 * This function:
 * 1. Removes the exited user from groups.user_balances
 * 2. Recomputes simplified_debts for remaining members
 * 3. Cleans up friends.group_breakdown for affected friend records
 *
 * @param supabase - Supabase client
 * @param groupId - The group the member is leaving
 * @param exitedUserId - The user ID of the member who left
 */
export async function cleanupAfterMemberExit(
    supabase: SupabaseClient,
    groupId: string,
    exitedUserId: string
): Promise<void> {
    try {
        console.log(`[CLEANUP_START] Member ${exitedUserId} exiting group ${groupId}`);

        // 1. Fetch and update group (remove from user_balances, recompute simplified_debts)
        const { data: group } = await supabase
            .from('groups')
            .select('user_balances, simplify_debts_enabled')
            .eq('id', groupId)
            .single();

        if (!group) {
            console.log('[CLEANUP] Group not found, skipping');
            return;
        }

        // Remove exited user from user_balances
        const userBalances: Record<string, number> = { ...(group.user_balances || {}) };
        const exitedUserBalance = userBalances[exitedUserId];
        delete userBalances[exitedUserId];

        console.log(`[CLEANUP] Removed user from user_balances. Previous balance: ${exitedUserBalance || 0}`);

        // Recompute simplified debts if enabled
        let simplifiedDebts: any[] = [];
        if (group.simplify_debts_enabled) {
            const balances = Object.entries(userBalances)
                .filter(([_, amt]) => Math.abs(amt) > 0.01)
                .map(([userId, balance]) => ({ userId, balance }));

            simplifiedDebts = coreSimplifyGroupDebts(balances);
            console.log(`[CLEANUP] Recomputed simplified_debts: ${simplifiedDebts.length} edges`);
        }

        // Update the group
        await supabase
            .from('groups')
            .update({
                user_balances: userBalances,
                simplified_debts: simplifiedDebts
            })
            .eq('id', groupId);

        // 2. Clean friend breakdowns - remove this group from breakdown
        //    for all friend records involving the exited user
        const { data: affectedFriends } = await supabase
            .from('friends')
            .select('id, group_breakdown')
            .or(`owner_id.eq.${exitedUserId},linked_user_id.eq.${exitedUserId}`);

        if (affectedFriends && affectedFriends.length > 0) {
            // Filter to only friends that have this group in their breakdown
            const friendsNeedingUpdate = affectedFriends.filter(
                (f: any) => f.group_breakdown?.some((b: any) => b.groupId === groupId)
            );

            if (friendsNeedingUpdate.length > 0) {
                console.log(`[CLEANUP] Updating ${friendsNeedingUpdate.length} friend records`);

                // Prepare and execute updates in parallel
                const updatePromises = friendsNeedingUpdate.map((f: any) => {
                    // Remove this group from breakdown
                    const newBreakdown = (f.group_breakdown || [])
                        .filter((b: any) => b.groupId !== groupId);

                    // Recalculate balance from remaining breakdown
                    const newBalance = newBreakdown.reduce(
                        (sum: number, b: any) => sum + (b.amount || 0),
                        0
                    );

                    return supabase
                        .from('friends')
                        .update({
                            group_breakdown: newBreakdown,
                            balance: Math.round(newBalance * 100) / 100
                        })
                        .eq('id', f.id);
                });

                await Promise.all(updatePromises);
            }
        }

        console.log(`[CLEANUP_COMPLETE] Member ${exitedUserId} cleaned from group ${groupId}`);

    } catch (error) {
        // Log but don't fail the exit operation
        // The data will self-heal on next recalculation if needed
        console.error('[CLEANUP_ERROR] Error during member exit cleanup:', error);
    }
}
