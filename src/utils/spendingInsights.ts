/**
 * Group Spending Insights Utility
 * 
 * Provides read-only analytics for group spending.
 * 
 * CRITICAL DESIGN DECISIONS:
 * - Uses `share_amount` (split.amount) NOT `paidAmount` for per-user spend
 *   Rationale: "Spend" = consumption, not payment behavior
 * - Excludes deleted expenses
 * - Excludes settle-up transactions (they're not expenses)
 * - All calculations in cents to avoid floating point drift
 * - This is a DERIVED VIEW only - does not mutate any ledger data
 */

import type { Expense } from "../types";
import { matchesMember, type GroupMember } from "./groupBalanceUtils";

export interface SpendingSummary {
  /** Total group spend in cents (multiply by 100 from display amount) */
  totalSpendCents: number;
  /** Per-user spend in cents, keyed by user/member identifier */
  perUserSpendCents: Map<string, number>;
}

export interface UserSpendInfo {
  userId: string;
  name: string;
  avatar: string;
  spendCents: number;
  percentage: number;
}

/**
 * Calculate group spending summary.
 * 
 * @param expenses - All expenses (will be filtered by groupId and deleted status)
 * @param groupId - The group to calculate spending for
 * @param members - Group members (for ID normalization)
 * @returns SpendingSummary with total and per-user spend in cents
 * 
 * Edge Cases Handled:
 * - Multi-payer expenses: Each participant's share_amount is counted
 * - Unequal splits: Correct attribution per user
 * - Zero-share participants: Appear with 0 spend
 * - Payer excluded from split: No spend for that payer in that expense
 * - Deleted expenses: Excluded
 * - Members who joined late: Only expenses they participated in are counted
 */
export function calculateGroupSpendingSummary(
  expenses: Expense[],
  groupId: string,
  members: GroupMember[]
): SpendingSummary {
  // Filter to only this group's non-deleted expenses
  const groupExpenses = expenses.filter(
    (e) => e.groupId === groupId && !e.deleted
  );

  let totalSpendCents = 0;
  const perUserSpendCents = new Map<string, number>();

  // Initialize all members with 0 spend
  members.forEach((m) => {
    perUserSpendCents.set(m.id, 0);
  });

  groupExpenses.forEach((expense) => {
    // Total Group Spend = sum of expense.amount
    // Convert to cents (assuming amount is in rupees with potential decimals)
    const expenseAmountCents = Math.round(expense.amount * 100);
    totalSpendCents += expenseAmountCents;

    // Per-User Spend = sum of their share_amount (split.amount)
    expense.splits.forEach((split) => {
      if (!split.userId) return;
      
      const shareAmountCents = Math.round((split.amount || 0) * 100);
      
      // Find which member this split belongs to
      const member = members.find((m) => matchesMember(split.userId, m));
      if (member) {
        const current = perUserSpendCents.get(member.id) || 0;
        perUserSpendCents.set(member.id, current + shareAmountCents);
      } else {
        // Handle case where split.userId doesn't match any member
        // (shouldn't happen in normal use, but be defensive)
        const current = perUserSpendCents.get(split.userId) || 0;
        perUserSpendCents.set(split.userId, current + shareAmountCents);
      }
    });
  });

  return {
    totalSpendCents,
    perUserSpendCents,
  };
}

/**
 * Convert spending summary to a sorted list of user spend info.
 * 
 * @param summary - The spending summary from calculateGroupSpendingSummary
 * @param members - Group members with name and avatar info
 * @returns Sorted array of UserSpendInfo (descending by spend)
 */
export function formatSpendingSummary(
  summary: SpendingSummary,
  members: GroupMember[]
): UserSpendInfo[] {
  const result: UserSpendInfo[] = [];
  
  summary.perUserSpendCents.forEach((spendCents, memberId) => {
    const member = members.find((m) => m.id === memberId);
    
    result.push({
      userId: memberId,
      name: member?.name || "Unknown",
      avatar: (member as any)?.avatar || "",
      spendCents,
      percentage:
        summary.totalSpendCents > 0
          ? (spendCents / summary.totalSpendCents) * 100
          : 0,
    });
  });

  // Sort by spend descending
  result.sort((a, b) => b.spendCents - a.spendCents);

  return result;
}

/**
 * Format cents to display currency (₹).
 * @param cents - Amount in cents
 * @returns Formatted string like "12,450" or "12,450.50"
 */
export function formatCentsToRupees(cents: number): string {
  const rupees = cents / 100;
  // Format with Indian locale (includes comma separators)
  return rupees.toLocaleString("en-IN", {
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
