import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, Users } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { useData } from "../context/DataContext";
import {
  calculateGroupSpendingSummary,
  formatSpendingSummary,
  formatCentsToRupees,
} from "../utils/spendingInsights";

export function GroupSpendingBreakdown() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { groups, expenses, currentUser } = useData();

  const group = groups.find((g) => g.id === id);

  // Calculate spending summary
  const { summary, userSpends } = useMemo(() => {
    if (!group) {
      return { summary: null, userSpends: [] };
    }

    // Convert members to GroupMember format
    const members = group.members.map((m) => ({
      id: m.id,
      userId: m.userId || undefined,
      name: m.name,
      avatar: m.avatar,
    }));

    const spendingSummary = calculateGroupSpendingSummary(expenses, group.id, members);
    const formatted = formatSpendingSummary(spendingSummary, members);

    return { summary: spendingSummary, userSpends: formatted };
  }, [group, expenses]);

  if (!group) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Group not found</p>
      </div>
    );
  }

  const totalSpend = summary ? formatCentsToRupees(summary.totalSpendCents) : "0";

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="flex items-center gap-4 sticky top-0 bg-background/95 backdrop-blur z-10 py-2 border-b px-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/groups/${id}/settings`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Spending Breakdown</h1>
          <p className="text-sm text-muted-foreground">{group.name}</p>
        </div>
      </div>

      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Total Spend Card */}
        <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 bg-primary/20 rounded-full flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Group Spend</p>
              <p className="text-3xl font-bold text-primary">₹{totalSpend}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Total spent across all group expenses. This is not a balance — just spending analytics.
          </p>
        </Card>

        {/* Per-User Breakdown */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase flex items-center gap-2">
            <Users className="h-4 w-4" /> Per Member Spending
          </h3>

          {userSpends.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No expenses yet in this group.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {userSpends.map((userSpend) => {
                const isCurrentUser =
                  userSpend.userId === currentUser.id ||
                  group.members.find(
                    (m) => m.id === userSpend.userId && m.userId === currentUser.id
                  );

                return (
                  <Card key={userSpend.userId} className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={userSpend.avatar} />
                        <AvatarFallback>{userSpend.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {isCurrentUser ? "You" : userSpend.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {/* Progress bar */}
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${Math.min(userSpend.percentage, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right">
                            {userSpend.percentage.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">
                          ₹{formatCentsToRupees(userSpend.spendCents)}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Explainer */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <h4 className="font-medium text-sm">What does this show?</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• <strong>Total Spend</strong> = Sum of all expense amounts in this group</li>
            <li>• <strong>Per Member</strong> = Each person's share of expenses (what they consumed)</li>
            <li>• This is <strong>not</strong> about who paid — it's about who spent</li>
            <li>• Settle-ups and refunds are not included</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
