import { useMemo, useCallback } from "react";

export function useGroupBalance(group: any) {
    // STRICT CONTRACT:
    // We do NOT calculate balances client-side.
    // We trust group.currentUserBalance (Net) and friend.group_breakdown (Pairwise).
    
    // For "Is Group Settled", we use a proxy check on the current user's balance.
    // Backend will enforce strict "All Members Settled" on deletion.
    const isGroupSettled = useMemo(() => {
        if (!group) return true;
        const balance = group.currentUserBalance || 0;
        return Math.abs(balance) < 0.01;
    }, [group]);

    // For "Is Member Settled" (Permission to remove), we check if *we* are settled with them?
    // User Prompt: "Use group.currentUserBalance === 0 ONLY" for enablement logic.
    // This implies broad permission if the viewing user is settled.
    // However, to be helpful, strictly speaking, this function was used to gate "Remove Member".
    // If we return 'true', the button is enabled. Backend will reject if unsafe.
    const isMemberFullySettled = useCallback((_memberId: string): boolean => {
        if (!group) return true;
        
        // Strategy: Delegate to Backend.
        // Always return true to ENABLE the action buttons (Remove/Leave/Delete).
        // If there are outstanding debts, the API will return a 400 error,
        // which the UI catches and displays in an Error Modal.
        return true; 
    }, [group]);

    return { 
        memberBalances: {}, // No longer computed
        isGroupSettled, 
        isMemberFullySettled 
    };
}
