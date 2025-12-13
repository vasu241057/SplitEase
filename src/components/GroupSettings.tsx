import { useState } from "react"
import { X, Trash2, LogOut, UserPlus, Wallet, Users, Settings, Pencil, Check } from "lucide-react"
import { Button } from "./ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import { Input } from "./ui/input"

interface GroupSettingsProps {
    isOpen: boolean
    onClose: () => void
    group: any
    currentUser: any
    onAddMember: () => void
    onRemoveMember: (memberId: string) => void
    onLeaveGroup: () => void
    onDeleteGroup: () => void
    onSettleUp: () => void
    onRenameGroup: (name: string) => Promise<void>
    memberBalances: Record<string, number>
    isGroupSettled: boolean
}

export function GroupSettings({
    isOpen,
    onClose,
    group,
    currentUser,
    onAddMember,
    onRemoveMember,
    onLeaveGroup,
    onDeleteGroup,
    onSettleUp,
    onRenameGroup,
    memberBalances,
    isGroupSettled
}: GroupSettingsProps) {
    const [isEditingName, setIsEditingName] = useState(false)
    const [newName, setNewName] = useState(group.name)
    const [confirmAction, setConfirmAction] = useState<{
        type: 'remove' | 'leave' | 'delete',
        title: string,
        message: string,
        onConfirm: () => void
    } | null>(null)

    if (!isOpen) return null

    const handleSaveName = async () => {
        if (!newName.trim()) return;
        await onRenameGroup(newName);
        setIsEditingName(false);
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center transition-opacity duration-300 animate-in fade-in">
            <div 
                className="bg-background w-full sm:max-w-md rounded-t-xl sm:rounded-xl shadow-xl flex flex-col max-h-[90vh] transition-transform duration-300 animate-in slide-in-from-bottom-10"
                onClick={(e) => e.stopPropagation()}
                style={{ animationDuration: '300ms', animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }} // iOS-like spring
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                     <div className="flex items-center gap-2 flex-1 mr-2">
                        {isEditingName ? (
                            <div className="flex items-center gap-2 flex-1">
                                <Input 
                                    value={newName} 
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="h-8 text-lg font-bold px-2 py-0"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveName();
                                        if (e.key === 'Escape') setIsEditingName(false);
                                    }}
                                />
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={handleSaveName}>
                                    <Check className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setIsEditingName(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setNewName(group.name); setIsEditingName(true); }}>
                                <Settings className="h-5 w-5 text-muted-foreground" />
                                <h2 className="text-lg font-bold truncate">{group.name}</h2>
                                <Pencil className="h-3 w-3 text-muted-foreground opacity-50" />
                            </div>
                        )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                <div className="overflow-y-auto flex-1 p-4 space-y-6">
                    {/* Members Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase flex items-center gap-2">
                                <Users className="h-4 w-4" /> Members ({group.members.length})
                            </h3>
                            <Button variant="ghost" size="sm" className="h-8 text-primary" onClick={onAddMember}>
                                <UserPlus className="h-4 w-4 mr-2" />
                                Add
                            </Button>
                        </div>
                        
                        <div className="bg-card border rounded-lg overflow-hidden divide-y">
                            {group.members.map((member: any) => {
                                const isMe = member.userId === currentUser.id;
                                const balance = memberBalances[member.id] || 0;
                                const isSettled = Math.abs(balance) < 0.05;
                                
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
                                                    {isMe && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Admin</span>}
                                                </p>
                                                {!isSettled && (
                                                    <p className={`text-xs ${balance < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                        {balance < 0 ? 'Owes' : 'Owed'} ₹{Math.abs(balance).toFixed(2)}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {!isMe && (
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className={`h-8 w-8 ${!isSettled ? 'opacity-30 cursor-not-allowed text-muted-foreground' : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'}`}
                                                disabled={!isSettled}
                                                onClick={() => {
                                                    if (!isSettled) return;
                                                    setConfirmAction({
                                                        type: 'remove',
                                                        title: `Remove ${member.name}?`,
                                                        message: `${member.name} has settled all balances. Are you sure you want to remove them from the group?`,
                                                        onConfirm: () => onRemoveMember(member.id)
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

                    {/* Actions Section */}
                     <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase flex items-center gap-2">
                            Actions
                        </h3>
                        
                        <div className="grid gap-2">
                            <Button variant="outline" className="w-full justify-start h-12" onClick={onSettleUp}>
                                <Wallet className="h-5 w-5 mr-3 text-green-600" />
                                <span className="flex-1 text-left">Settle Up</span>
                            </Button>
                            
                            <Button variant="outline" className="w-full justify-start h-12 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={() => {
                                setConfirmAction({
                                    type: 'leave',
                                    title: "Leave Group?",
                                    message: "Are you sure you want to leave this group?",
                                    onConfirm: onLeaveGroup
                                });
                            }}>
                                <LogOut className="h-5 w-5 mr-3" />
                                <span className="flex-1 text-left">Leave Group</span>
                            </Button>

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
                                                onConfirm: onDeleteGroup
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
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 rounded-xl animate-in fade-in duration-200">
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
            </div>
        </div>
    )
}
