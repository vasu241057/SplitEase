/* eslint-disable */
import { useState, useMemo, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, X, Trash2, LogOut, UserPlus, Wallet, Users, Pencil, Check, Info, TrendingUp, ChevronRight, Loader2 } from "lucide-react"
import { Label } from "../components/ui/label"
import { useData } from "../context/DataContext"
// DEPRECATED: useGroupBalance hook is no longer needed here
// import { useGroupBalance } from "../hooks/useGroupBalance"
import { api } from "../utils/api"
import { Button } from "../components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { Input } from "../components/ui/input"
import { cn } from "../utils/cn"
import { calculateGroupSpendingSummary, formatCentsToRupees } from "../utils/spendingInsights"

export function GroupSettingsPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { groups, currentUser, refreshGroups, expenses } = useData()
    
    // Derived State
    const group = groups.find(g => g.id === id)
    // DEPRECATED: useGroupBalance hook is no longer used for action gating
    // const { isGroupSettled, isMemberFullySettled } = useGroupBalance(group)
    
    // =========================================================================
    // ACTION GATING LOGIC (Truthful UI)
    // =========================================================================
    
    // DELETE GROUP: Can delete only if ALL members have net balance === 0
    const isGroupSettled = useMemo(() => {
        if (!group || !group.user_balances) return true;
        const balances = Object.values(group.user_balances) as number[];
        return balances.every(bal => Math.abs(bal) < 0.01);
    }, [group]);
    
    // LEAVE GROUP: Current user can leave only if their balance === 0
    const canLeaveGroup = useMemo(() => {
        if (!group) return true;
        return Math.abs(group.currentUserBalance || 0) < 0.01;
    }, [group]);
    
    // REMOVE MEMBER: Helper to check if a specific member can be removed
    const canRemoveMember = (memberUserId: string): boolean => {
        if (!group || !group.user_balances) return true;
        const memberBalance = group.user_balances[memberUserId] || 0;
        return Math.abs(memberBalance) < 0.01;
    };

    // Local State
    const [isEditingName, setIsEditingName] = useState(false)
    const [newName, setNewName] = useState(group?.name || "")
    const [confirmAction, setConfirmAction] = useState<{
        type: 'remove' | 'leave' | 'delete',
        title: string,
        message: string,
        onConfirm: () => void
    } | null>(null)
    const [errorModal, setErrorModal] = useState<string | null>(null)
    const [isTogglingSimplify, setIsTogglingSimplify] = useState(false);

    useEffect(() => {
        if (group) {
            console.log('[SIMPLIFY STATE]', {
                groupId: group.id,
                enabled: group.simplifyDebtsEnabled,
                screenName: 'GroupSettings'
            });
        }
    }, [group?.id, group?.simplifyDebtsEnabled]);

    // Use group state as source of truth (fallback to false if null/undefined)
    // NOTE: We do NOT use localStorage for logic anymore.
    const simplifyDebts = group?.simplifyDebtsEnabled ?? false;

    const handleToggleSimplify = async (enabled: boolean) => {
        if (!group) return;
        
        setIsTogglingSimplify(true);
        // Optimistic update logging
        console.log('[SIMPLIFY SYNC]', {
            groupId: group.id,
            previousValue: simplifyDebts,
            newValue: enabled,
            triggeredByUserId: currentUser.id,
            screenName: 'GroupSettings'
        });

        try {
            // Update DB via API
            await api.put(`/api/groups/${group.id}`, { simplifyDebtsEnabled: enabled });
            
            // INVARIANT: Simplify toggle affects both group.simplified_debts AND friend.group_breakdown
            // Must invalidate BOTH queries to prevent stale UI state
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['groups'] }),
                queryClient.invalidateQueries({ queryKey: ['friends'] })
            ]);

        } catch (error: any) {
            console.error("Failed to toggle simplify debts:", error);
            setErrorModal("Failed to update group settings");
        } finally {
            setIsTogglingSimplify(false);
        }
    };

    // Calculate group spending summary (read-only analytics)
    const spendingSummary = useMemo(() => {
        if (!group) return null;
        const members = group.members.map(m => ({
            id: m.id,
            userId: m.userId || undefined,
            name: m.name,
        }));
        return calculateGroupSpendingSummary(expenses, group.id, members);
    }, [group, expenses]);

    // Handlers
    const handleSaveName = async () => {
        if (!newName.trim() || !group) return;
        try {
            await api.put(`/api/groups/${group.id}`, { name: newName });
            await refreshGroups();
            setIsEditingName(false);
        } catch (error: any) {
             setErrorModal("Failed to rename group");
        }
    }

    const handleRemoveMember = async (memberId: string) => {
        if (!group) return;
        try {
            await api.delete(`/api/groups/${group.id}/members/${memberId}`);
            await refreshGroups();
        } catch (error: any) {
            setErrorModal(error.response?.data?.error || "Failed to remove member");
        }
    }

    const handleLeaveGroup = async () => {
        if (!group) return;
        try {
            await api.post(`/api/groups/${group.id}/leave`, {});
            await refreshGroups();
            navigate('/groups');
        } catch (error: any) {
            setErrorModal(error.response?.data?.error || "Failed to leave group.");
        }
    }

    const handleDeleteGroup = async () => {
         if (!group) return;
        try {
            await api.delete(`/api/groups/${group.id}`)
            await refreshGroups()
            navigate('/groups')
        } catch (error: any) {
            setErrorModal(error.response?.data?.error || "Failed to delete group.");
        }
    }
    
    // Add Member is complex because it uses a modal in GroupDetail. 
    // For now, let's keep Add Member flow simple or redirect back to GroupDetail with 'addMember' state?
    // OR we can move AddMember modal here? 
    // The user said "Keep all existing settings functionality".
    // "Add Member" button was in the settings modal. 
    // In GroupSettings modal, it called `onAddMember`.
    // Let's implement a simple prompt or navigate back to group with a flag?
    // Actually, making it a page means we can have our own Add Member UI here if we want.
    // Simplifying: Use the existing logic or just a simple search interface here?
    // Let's assume for now we don't refactor AddMember totally.
    // Wait, the "Add Member" logic in GroupDetail was tightly coupled with `availableFriends`.
    // I should ideally copy that logic here to keep it self-contained in Settings Page.
    // It's better UX to have it here.

    if (!group) return <div>Group not found</div>

    return (
        <div className="min-h-screen bg-background pb-20">
             {/* Header */}
            <div className="flex items-center gap-4 sticky top-0 bg-background/95 backdrop-blur z-10 py-2 border-b px-4">
                <Button variant="ghost" size="icon" onClick={() => navigate(`/groups/${id}`)}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-xl font-bold">Group Settings</h1>
            </div>

            <div className="p-4 space-y-6 max-w-2xl mx-auto">
                 {/* Group Name Editing */}
                 <div className="flex items-center gap-2">
                     {isEditingName ? (
                        <div className="flex items-center gap-2 flex-1">
                            <Input 
                                value={newName} 
                                onChange={(e) => setNewName(e.target.value)}
                                className="h-10 text-lg font-bold"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveName();
                                    if (e.key === 'Escape') setIsEditingName(false);
                                }}
                            />
                            <Button size="icon" variant="ghost" className="text-green-600" onClick={handleSaveName}>
                                <Check className="h-5 w-5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setIsEditingName(false)}>
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                     ) : (
                        <div className="flex items-center gap-2 group cursor-pointer w-full p-2 hover:bg-muted rounded-lg transition-colors" onClick={() => { setNewName(group.name); setIsEditingName(true); }}>
                            <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                                <Users className="h-6 w-6" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm text-muted-foreground">Group Name</p>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-xl font-bold">{group.name}</h2>
                                    <Pencil className="h-4 w-4 text-muted-foreground opacity-50" />
                                </div>
                            </div>
                        </div>
                     )}
                 </div>

                {/* Members Section */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase flex items-center gap-2">
                            <Users className="h-4 w-4" /> Members ({group.members.length})
                        </h3>
                        {/* 
                            For "Add Member", since recreating the whole search modal here is a lot of duplicate code,
                            I will trigger navigation back to GroupDetail with state to open the modal there, 
                            OR simply implement a basic version. 
                            Given constraint "Do NOT Refactor unrelated code", moving AddMember logic is risky.
                            However, the user wants "Group Settings Content Unchanged Functionally". 
                            If I navigate away to add, it's slightly different flow.
                            Let's keep it simple: Add Member button here redirects to Group Detail with ?action=addMember
                         */}
                        <Button variant="ghost" size="sm" className="h-8 text-primary" onClick={() => navigate(`/groups/${id}`, { state: { action: 'addMember' } })}>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Add
                        </Button>
                    </div>
                    
                    <div className="bg-card border rounded-lg overflow-hidden divide-y">
                        {group.members.map((member: any) => {
                            const isMe = member.userId === currentUser.id;
                            // Use user_balances to check if member can be removed
                            const isSettled = canRemoveMember(member.userId);
                            
                            return (
                                <div key={member.id} className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={member.avatar} />
                                            <AvatarFallback>{member.name[0]}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-medium text-sm flex items-center gap-2">
                                                {isMe ? "You" : member.name}
                                                {member.userId === group.createdBy && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Admin</span>}
                                            </p>
                                            {/* Show 'Not settled' text for members who cannot be removed */}
                                            {!isMe && !isSettled && (
                                                <p className="text-xs text-amber-500">Not settled - cannot remove</p>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {!isMe && (
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className={cn("h-8 w-8", !isSettled ? 'opacity-30 cursor-not-allowed text-muted-foreground' : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10')}
                                            disabled={!isSettled}
                                            onClick={() => {
                                                if (!isSettled) return;
                                                setConfirmAction({
                                                    type: 'remove',
                                                    title: `Remove ${member.name}?`,
                                                    message: `${member.name} has settled all balances. Are you sure you want to remove them from the group?`,
                                                    onConfirm: () => handleRemoveMember(member.id)
                                                });
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Display Preferences */}
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase flex items-center gap-2">
                        Preferences
                    </h3>
                    <div className="bg-card border rounded-lg p-4 flex items-center justify-between">
                         <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="simplify-debts" className="text-base font-medium">Simplify group debts</Label>
                                <div className="group relative flex items-center">
                                    <Info className="h-4 w-4 text-muted-foreground cursor-help ml-1" />
                                    {isTogglingSimplify && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />}
                                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-popover text-popover-foreground text-xs rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity w-48 pointer-events-none border">
                                        Reduces the number of payments needed. Your total balance stays the same.
                                    </div>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                                Reduces the number of payments needed.<br/>
                                Your total amount owed or received does not change.
                            </p>
                        </div>
                        {/* Simple Switch Implementation */}
                        <button
                            type="button"
                            role="switch"
                            aria-checked={simplifyDebts}
                            onClick={() => handleToggleSimplify(!simplifyDebts)}
                            className={cn(
                                "w-11 h-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border-2 border-transparent",
                                simplifyDebts ? "bg-primary" : "bg-input"
                            )}
                        >
                            <span
                                className={cn(
                                    "block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                                    simplifyDebts ? "translate-x-5" : "translate-x-0"
                                )}
                            />
                        </button>
                    </div>
                </div>

                {/* Spending Stats (Read-Only Analytics) */}
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" /> Spending Stats
                    </h3>
                    <div 
                        className="bg-card border rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => navigate(`/groups/${id}/spending`)}
                    >
                        <div>
                            <p className="text-sm text-muted-foreground">Total Group Spend</p>
                            <p className="text-lg font-bold">
                                ₹{spendingSummary ? formatCentsToRupees(spendingSummary.totalSpendCents) : "0"}
                            </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground px-1">
                        Tap to see spending breakdown by member
                    </p>
                </div>

                {/* Actions Section */}
                 <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase flex items-center gap-2">
                        Actions
                    </h3>
                    
                    <div className="grid gap-2">
                        <Button variant="outline" className="w-full justify-start h-12" onClick={() => navigate(`/groups/${id}`, { state: { action: 'settleUp' } })}>
                            <Wallet className="h-5 w-5 mr-3 text-green-600" />
                            <span className="flex-1 text-left">Settle Up</span>
                        </Button>
                        
                        {canLeaveGroup ? (
                            <Button variant="outline" className="w-full justify-start h-12 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={() => {
                                setConfirmAction({
                                    type: 'leave',
                                    title: "Leave Group?",
                                    message: "Are you sure you want to leave this group?",
                                    onConfirm: handleLeaveGroup
                                });
                            }}>
                                <LogOut className="h-5 w-5 mr-3" />
                                <span className="flex-1 text-left">Leave Group</span>
                            </Button>
                        ) : (
                            <div className="w-full h-12 flex items-center justify-start p-3 rounded-md border border-amber-500/20 bg-amber-500/10">
                                <LogOut className="h-5 w-5 mr-3 text-amber-500" />
                                <div className="flex-1">
                                    <span className="text-sm text-amber-500">Cannot leave group</span>
                                    <p className="text-xs text-muted-foreground">Settle your balances first</p>
                                </div>
                            </div>
                        )}

                         <div className="pt-4 mt-2 border-t space-y-2">
                            {isGroupSettled ? (
                                <Button
                                    variant="destructive"
                                    className="w-full"
                                    onClick={() => {
                                        setConfirmAction({
                                            type: 'delete',
                                            title: "Delete Group?",
                                            message: "This will permanently delete the group and all its expenses. This action cannot be undone.",
                                            onConfirm: handleDeleteGroup
                                        });
                                    }}
                                >
                                    Delete Group
                                </Button>
                            ) : (
                                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3 text-center">
                                     <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
                                         Group cannot be deleted
                                     </p>
                                     <p className="text-xs text-muted-foreground mt-1">
                                         All balances must be settled first.
                                     </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

             {/* Confirmation Modal Overlay */}
             {confirmAction && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="bg-card border shadow-lg rounded-lg p-6 max-w-sm w-full space-y-4">
                        <h3 className="text-lg font-bold">{confirmAction.title}</h3>
                        <p className="text-sm text-muted-foreground">{confirmAction.message}</p>
                        <div className="flex gap-3 justify-end">
                            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
                            <Button 
                                variant="destructive" 
                                onClick={() => {
                                    confirmAction.onConfirm();
                                    setConfirmAction(null);
                                }}
                            >
                                Confirm
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Generic Error Modal */}
            {errorModal && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="bg-background rounded-lg p-6 max-w-sm w-full space-y-4 shadow-xl">
                        <div className="flex items-center gap-2 text-destructive">
                            <Info className="h-6 w-6" />
                            <h3 className="font-bold text-lg">Action Failed</h3>
                        </div>
                        <p className="text-muted-foreground">{errorModal}</p>
                        <div className="flex justify-end">
                            <Button onClick={() => setErrorModal(null)}>Okay</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
