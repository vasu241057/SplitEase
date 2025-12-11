
import { useState, useMemo, useEffect, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, Receipt, IndianRupee, User as UserIcon, Check, Users, X, Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { cn } from "../utils/cn"
import type { Friend, Group } from "../types"

type Step = 1 | 2 | 3 | 4 | 5 // 3: Payer Select (Group), 4: Split Select (Group), 5: Multi-Payer Amount Input
type SplitMode = "you-equal" | "you-full" | "friend-equal" | "friend-full"

export function AddExpense() {
  const navigate = useNavigate()
  const location = useLocation()
  const { friends, groups, addExpense, updateExpense, deleteExpense, currentUser, loading } = useData()
  
  const [step, setStep] = useState<Step>(1)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([])
  
  const [searchQuery, setSearchQuery] = useState("")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  
  const [isSaving, setIsSaving] = useState(false)
  
  const [splitMode] = useState<SplitMode>("you-equal")
  const [groupPayers, setGroupPayers] = useState<string[]>([currentUser.id])
  const [groupSplitMembers, setGroupSplitMembers] = useState<string[]>([])
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({})

  const searchInputRef = useRef<HTMLInputElement>(null)

  // Initialize split members when group/friends selected
  // Initialize split members when group/friends selected
  const initializedRef = useRef(false)

  // Initialize split members when group/friends selected
  useEffect(() => {
    if (loading) return
    // Check for Edit Mode
    if (location.state?.editExpense && !initializedRef.current) {
       initializedRef.current = true
       const editExp = location.state.editExpense as any // Type assertion for now
       
       setDescription(editExp.description)
       setAmount(editExp.amount.toString())
       
       // Set Group
       if (editExp.groupId) {
          const grp = groups.find(g => g.id === editExp.groupId)
          if (grp) setSelectedGroup(grp)
       }
       
       // Set Friends (derive from splits who are NOT group members and NOT current user)
       const groupMemberIds = editExp.groupId ? (groups.find(g => g.id === editExp.groupId)?.members || []) : []
       const friendIds = editExp.splits
          .map((s: any) => s.userId)
          .filter((uid: string) => uid !== currentUser.id && !groupMemberIds.includes(uid))
       
       const friendsToSelect = friends.filter(f => friendIds.includes(f.id) || (f.linked_user_id && friendIds.includes(f.linked_user_id)))
       setSelectedFriends(friendsToSelect)
       
       // Set Payers
       const payers = editExp.splits.filter((s: any) => s.paidAmount > 0).map((s: any) => s.userId)
       setGroupPayers(payers)
       
       const payerAmts: Record<string, string> = {}
       editExp.splits.forEach((s: any) => {
          if (s.paidAmount > 0) payerAmts[s.userId] = s.paidAmount.toString()
       })
       setPayerAmounts(payerAmts)
       
       // Set Split Members
       const splitters = editExp.splits.filter((s: any) => s.amount > 0).map((s: any) => s.userId)
       setGroupSplitMembers(splitters)
       
       setStep(2)
       setStep(2)
       return // Skip default init
    }

    // Check for Pre-selected Group (New Expense from Group Detail)
    if (location.state?.preSelectedGroup && !initializedRef.current) {
         initializedRef.current = true
         setSelectedGroup(location.state.preSelectedGroup)
         setStep(2)
         return // Let the next render handle the split members update based on selectedGroup
    }

    // Only run default init if NOT in edit mode and NOT initialized
    if (!location.state?.editExpense) {
        // Combine Group Members + Selected Friends
        const members = new Set([currentUser.id])
        if (selectedGroup) {
        selectedGroup.members.forEach(m => members.add(m))
        }
        if (selectedFriends.length > 0) {
        selectedFriends.forEach(f => members.add(f.id))
        }
        setGroupSplitMembers(Array.from(members))
        // Only reset payers if we are NOT in edit mode (which we are not here)
        // But we also don't want to reset if user is just adding friends?
        // Let's keep it simple: Default to current user if list changes significantly?
        // Actually, existing logic was fine for new expense.
        if (groupPayers.length === 0 || (groupPayers.length === 1 && groupPayers[0] === currentUser.id)) {
             setGroupPayers([currentUser.id])
        }
    }
  }, [selectedGroup, selectedFriends, location.state, groups, friends, loading])

  const filteredFriends = useMemo(() => {
    return friends.filter(friend => 
      friend.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !selectedFriends.find(f => f.id === friend.id) &&
      (!selectedGroup || !selectedGroup.members.includes(friend.id)) // Exclude group members
    )
  }, [friends, searchQuery, selectedFriends, selectedGroup])

  const filteredGroups = useMemo(() => {
    if (selectedFriends.length > 0 || selectedGroup) return [] // Don't show groups if friends selected OR group already selected
    return groups.filter(group => 
      group.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [groups, searchQuery, selectedFriends, selectedGroup])

  const handleFriendSelect = (friend: Friend) => {
    setSelectedFriends([...selectedFriends, friend])
    setSearchQuery("")
    setStep(2) // Auto-navigate to details
  }

  const handleGroupSelect = (group: Group) => {
    setSelectedGroup(group)
    // Remove friends who are already in the group to avoid redundancy
    setSelectedFriends(prev => prev.filter(f => !group.members.includes(f.id)))
    setStep(2)
  }

  const removeFriend = (id: string) => {
    setSelectedFriends(selectedFriends.filter(f => f.id !== id))
  }

  const getMemberDetails = (id: string) => {
    if (id === currentUser.id) return { name: "You", avatar: currentUser.avatar }
    const friend = friends.find(f => f.id === id || f.linked_user_id === id)
    return friend || { name: "Unknown", avatar: undefined }
  }

  const handleSave = async () => {
    if ((!selectedGroup && selectedFriends.length === 0) || !description || !amount) {
       return
    }

    setIsSaving(true)
    try {
        const numAmount = parseFloat(amount)
        
        // Complex Logic for Group + Friend Split
        if (selectedGroup && selectedFriends.length > 0) {
           // 1. Calculate Shares
           // Total People = Group Members + Me + Friends
           // Wait, Group Members includes Me? No, usually 'members' array excludes current user in some implementations, 
           // but here 'members' are IDs. Let's assume 'members' + 'currentUser'.
           // And 'selectedFriends' are extra.
           
           const groupMemberIds = Array.from(new Set([currentUser.id, ...selectedGroup.members]))
           const friendIds = selectedFriends.map(f => f.id).filter(id => !groupMemberIds.includes(id))
           const allParticipants = [...groupMemberIds, ...friendIds]
           const totalParticipants = allParticipants.length
           
           const amountPerPerson = numAmount / totalParticipants
           
           const groupAmount = amountPerPerson * groupMemberIds.length
           const friendAmount = amountPerPerson * friendIds.length // This is total for all friends
           
           // 2. Create Group Expense
           // Payer? If I paid 1000.
           // Group Portion: 750. I paid 750 for Group.
           // Friend Portion: 250. I paid 250 for Friend.
           
           // We need to split the 'payerAmounts' proportionally if multi-payer?
           // Or just assume single payer for simplicity in this edge case?
           // User said: "Paid by option should have all the people of the group plus person for"
           // So multi-payer is possible.
           // This is getting very complex. Let's assume proportional distribution of payment.
           
           // Simplified approach:
           // Create ONE expense for the Group, but with the full amount? No, that messes up group stats.
           // User explicitly asked for TWO expenses.
           
           // Expense 1: Group
           // Amount: groupAmount
           // Splits: groupMemberIds (equal share)
           // Payer: We need to determine who paid how much for THIS portion.
           // If I paid 1000 total. I paid 750 for group, 250 for friend.
           // So Payer for Group Expense is Me (750).
           
           // Expense 2: Friend
           // Amount: friendAmount (e.g. 250 for 1 friend)
           // Splits: friendIds + Me?
           // If I paid 250 for Friend, and Friend owes me 250.
           // Split: Me (0 share), Friend (250 share).
           // Payer: Me (250).
           
           // What if Alice (Group Member) paid 1000?
           // Group Expense: Alice paid 750.
           // Friend Expense: Alice paid 250. Friend owes Alice.
           
           // We need to construct the splits carefully.
           
           // Helper to distribute payment
           const getPaymentDistribution = (targetAmount: number, totalAmount: number) => {
              // Distribute 'targetAmount' among payers proportional to their total payment
              // This is an approximation but robust.
              let distributedPayers: Record<string, number> = {}
              let remaining = targetAmount
              
              groupPayers.forEach((pid, index) => {
                 const paid = parseFloat(payerAmounts[pid] || (groupPayers.length === 1 ? amount : "0"))
                 const ratio = paid / totalAmount
                 const portion = targetAmount * ratio
                 
                 // Adjust last one for rounding
                 const finalPortion = index === groupPayers.length - 1 ? remaining : portion
                 distributedPayers[pid] = finalPortion
                 remaining -= finalPortion
              })
              return distributedPayers
           }
           
           const groupPayments = getPaymentDistribution(groupAmount, numAmount)
           const friendPayments = getPaymentDistribution(friendAmount, numAmount) // Total friend amount
           
           // Expense 1: Group
           const groupSplits = groupMemberIds.map(uid => ({
              userId: uid,
              amount: amountPerPerson,
              paidAmount: groupPayments[uid] || 0,
              paid: (groupPayments[uid] || 0) > 0
           }))
           
           // If Editing, we need to DELETE the original expense first because we are potentially 
           // splitting 1 expense into 2 (Group + Friend). Update isn't sufficient.
           if (location.state?.editExpense) {
              await deleteExpense(location.state.editExpense.id)
           }

           await addExpense({
              description: `${description} (Group Split)`,
              amount: groupAmount,
              payerId: groupPayers[0], // Main payer ID for reference
              splits: groupSplits,
              groupId: selectedGroup.id
           })
           
           // Expense 2: Friend(s)
           // For friend expense, we need to handle each friend separately? 
           // Or one expense with multiple friends?
           // "one new expense with him separately" implies one expense per friend?
           // Or one expense for all friends?
           // Let's do one expense for ALL friends + Payer(s).
           // But wait, if I am not in the friend expense (share 0), but I paid.
           // Split: Me (0 share, paid X), Friend (250 share, paid 0).
           
           const friendSplits = [
              ...friendIds.map(fid => ({
                 userId: fid,
                 amount: amountPerPerson,
                 paidAmount: friendPayments[fid] || 0,
                 paid: (friendPayments[fid] || 0) > 0
              })),
              // Add Payers who are NOT friends (e.g. Me or Group Members who paid for friend)
              ...Object.keys(friendPayments).filter(pid => !friendIds.includes(pid)).map(pid => ({
                 userId: pid,
                 amount: 0, // They don't owe for the friend's share
                 paidAmount: friendPayments[pid],
                 paid: true
              }))
           ]
           
           await addExpense({
              description: `${description} (Friend Split)`,
              amount: friendAmount,
              payerId: groupPayers[0],
              splits: friendSplits,
              groupId: undefined
           })
           
           navigate(-1)
           return
        }

        // Standard Logic (Single Group OR Friends)
        let splits: { userId: string, amount: number, paidAmount: number, paid: boolean }[] = []
        let payerId = currentUser.id

        let finalPayerAmounts: Record<string, number> = {}
        
        if (groupPayers.length === 1) {
          finalPayerAmounts[groupPayers[0]] = numAmount
          payerId = groupPayers[0]
        } else {
          groupPayers.forEach(pid => {
            finalPayerAmounts[pid] = parseFloat(payerAmounts[pid] || "0")
          })
          payerId = groupPayers[0]
        }

        // const owedPerPerson = numAmount / groupSplitMembers.length
        const allUserIds = Array.from(new Set([...groupPayers, ...groupSplitMembers]))

        // Rounding Logic
        const rawSplitAmount = numAmount / groupSplitMembers.length
        const roundedSplitAmount = Math.round(rawSplitAmount * 100) / 100
        const totalRounded = roundedSplitAmount * groupSplitMembers.length
        const remainder = numAmount - totalRounded

        splits = allUserIds.map(userId => {
          const paidAmt = finalPayerAmounts[userId] || 0
          const isSplitter = groupSplitMembers.includes(userId)
          
          let shareAmt = 0
          if (isSplitter) {
             shareAmt = roundedSplitAmount
             // Add remainder to the first splitter to balance it out
             if (userId === groupSplitMembers[0]) {
                shareAmt += remainder
                // Ensure we keep it to 2 decimals if remainder caused precision issues (though simple addition should be fine for 0.01)
                shareAmt = Math.round(shareAmt * 100) / 100
             }
          }
          
          return {
            userId,
            amount: shareAmt,
            paidAmount: paidAmt,
            paid: paidAmt > 0
          }
        })

        // Map friend IDs to linked_user_id if available
        splits = splits.map(s => {
           const friend = friends.find(f => f.id === s.userId)
           if (friend && friend.linked_user_id) {
              return { ...s, userId: friend.linked_user_id }
           }
           return s
        })

        if (!selectedGroup && selectedFriends.length === 1) {
           if (step === 2 && groupPayers.length === 1 && groupPayers[0] === "currentUser" && groupSplitMembers.length === 2) {
              const friendId = selectedFriends[0].id
               if (splitMode === "you-equal") {
                 splits = [
                  { userId: currentUser.id, amount: numAmount/2, paidAmount: numAmount, paid: true },
                  { userId: friendId, amount: numAmount/2, paidAmount: 0, paid: false }
                 ]
              } else if (splitMode === "you-full") {
                 splits = [
                  { userId: currentUser.id, amount: 0, paidAmount: numAmount, paid: true },
                  { userId: friendId, amount: numAmount, paidAmount: 0, paid: false }
                 ]
              } else if (splitMode === "friend-equal") {
                 splits = [
                  { userId: currentUser.id, amount: numAmount/2, paidAmount: 0, paid: false },
                  { userId: friendId, amount: numAmount/2, paidAmount: numAmount, paid: true }
                 ]
              } else if (splitMode === "friend-full") {
                 splits = [
                  { userId: currentUser.id, amount: numAmount, paidAmount: 0, paid: false },
                  { userId: friendId, amount: 0, paidAmount: numAmount, paid: true }
                 ]
              }
              payerId = splits.find(s => s.paid)?.userId || currentUser.id
           }
        }

        if (location.state?.editExpense) {
           await updateExpense({
              ...location.state.editExpense,
              description,
              amount: numAmount,
              payerId,
              splits,
              groupId: selectedGroup ? selectedGroup.id : undefined
           })
        } else {
           await addExpense({
             description,
             amount: numAmount,
             payerId,
             splits,
             groupId: selectedGroup ? selectedGroup.id : undefined
           })
        }

        navigate(-1)
    } catch (e) {
        console.error("Error saving expense:", e)
    } finally {
        setIsSaving(false)
    }
  }

  const getPaidText = () => {
    if (groupPayers.length === 1) {
      return groupPayers[0] === currentUser.id ? "You" : getMemberDetails(groupPayers[0]).name
    }
    return `${groupPayers.length} people`
  }

  const getSplitText = () => {
    if (groupSplitMembers.length === 1) {
      return groupSplitMembers[0] === currentUser.id ? "only You" : getMemberDetails(groupSplitMembers[0]).name
    }
    let totalMembers = 0
    if (selectedGroup) totalMembers = selectedGroup.members.length + 1 + selectedFriends.length
    else totalMembers = selectedFriends.length + 1
    
    if (groupSplitMembers.length === totalMembers) return "Equally"
    
    return `${groupSplitMembers.length} people`
  }

  const togglePayer = (id: string) => {
    // Single Select Mode by default
    // If we are in "Multiple People" mode (Step 5), we handle it there.
    // Here in Step 3, we only allow selecting ONE person.
    // UNLESS we are already in multi-payer mode? No, user said "Initially it would allow me to select only one person"
    
    setGroupPayers([id])
    setStep(2) // Auto-close on single select
  }

  const toggleSplitMember = (id: string) => {
    if (groupSplitMembers.includes(id)) {
      if (groupSplitMembers.length > 1) {
        setGroupSplitMembers(groupSplitMembers.filter(m => m !== id))
      }
    } else {
      setGroupSplitMembers([...groupSplitMembers, id])
    }
  }

  const handleMultiplePeopleClick = () => {
     setStep(5)
  }

  const totalPaidEntered = Object.values(payerAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0)
  const amountLeft = (parseFloat(amount) || 0) - totalPaidEntered

  const isDetailsValid = description.trim() !== "" && amount.trim() !== ""
  const isMultiPayerValid = Math.abs(amountLeft) < 0.01

  const activeMembers = useMemo(() => {
    const members = new Set([currentUser.id])
    if (selectedGroup) {
      selectedGroup.members.forEach(m => members.add(m))
    }
    selectedFriends.forEach(f => members.add(f.id))
    return Array.from(members)
  }, [selectedGroup, selectedFriends])

  // Auto-switch back to Step 2 if search is cleared and we have participants
  useEffect(() => {
    if (step === 1 && searchQuery === "" && (selectedFriends.length > 0 || selectedGroup)) {
      setStep(2)
    }
  }, [searchQuery, step, selectedFriends, selectedGroup])

  // Unified Input Component
  const UnifiedInput = ({ isReadOnly = false, autoFocus = true }: { isReadOnly?: boolean, autoFocus?: boolean }) => (
    <div 
      className={cn(
        "flex flex-wrap gap-2 p-2 border-b items-center transition-colors min-h-[50px]",
        isReadOnly ? "cursor-pointer hover:bg-muted/50" : "bg-background"
      )}
      onClick={() => {
        if (isReadOnly) {
          // If read-only (which we shouldn't use for Step 2 anymore based on requirements), do nothing or focus?
          // User wants Step 2 to NOT go to Step 1 on click.
          // So we'll make Step 2 NOT read-only, but handle the transition on type.
          setStep(1)
          setTimeout(() => searchInputRef.current?.focus(), 50)
        } else {
          searchInputRef.current?.focus()
        }
      }}
    >
      <span className="text-lg font-medium whitespace-nowrap mr-1">With you and</span>
      
      {selectedGroup && (
        <div className="bg-primary/10 text-primary px-3 py-1 rounded-full flex items-center gap-2 text-sm font-medium">
          <Users className="h-4 w-4" />
          {selectedGroup.name}
          {!isReadOnly && <X className="h-3 w-3 cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelectedGroup(null); }} />}
        </div>
      )}
      
      {selectedFriends.map(friend => (
          <div key={friend.id} className="bg-primary/10 text-primary px-3 py-1 rounded-full flex items-center gap-2 text-sm font-medium">
            <Avatar className="h-5 w-5">
              <AvatarImage src={friend.avatar} />
              <AvatarFallback>{friend.name[0]}</AvatarFallback>
            </Avatar>
            {friend.name}
            {!isReadOnly && <X className="h-3 w-3 cursor-pointer" onClick={(e) => { e.stopPropagation(); removeFriend(friend.id); }} />}
          </div>
      ))}

      <Input 
          ref={searchInputRef}
          placeholder={(!selectedGroup && selectedFriends.length === 0) ? "" : ""} 
          className={cn(
            "border-0 focus-visible:ring-0 px-1 min-w-[50px] flex-1 h-8 text-lg p-0 shadow-none",
            isReadOnly && "hidden"
          )}
          value={searchQuery}
          onChange={(e) => {
             setSearchQuery(e.target.value)
             // If in Step 2 and user types, switch to Step 1
             if (step === 2 && e.target.value.length > 0) {
                setStep(1)
             }
          }}
          autoFocus={autoFocus}
        />
    </div>
  )

  return (
    <motion.div 
      initial={{ clipPath: "circle(0% at 100% 100%)" }}
      animate={{ clipPath: "circle(150% at 100% 100%)" }}
      exit={{ clipPath: "circle(0% at 100% 100%)" }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="fixed inset-0 z-50 bg-background overflow-y-auto"
    >
      <div className="container mx-auto px-4 py-4 min-h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              if (step === 1 || step === 2) navigate(-1)
              else if (step === 5) setStep(3)
              else setStep(2)
            }}
          >
            {step === 1 || step === 2 ? <X className="h-6 w-6" /> : <ArrowLeft className="h-6 w-6" />}
          </Button>
          <h1 className="text-xl font-bold">
            {step === 1 ? "Add Expense" : step === 2 ? "Add Expense" : step === 3 ? "Who paid?" : step === 4 ? "Split with" : "Enter amounts"}
          </h1>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col space-y-6"
            >
              <div className="space-y-2">
                <UnifiedInput isReadOnly={false} />
              </div>

              <div className="space-y-6">
                {/* Friends Section */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Friends</h3>
                  <div className="space-y-2">
                    {filteredFriends.map(friend => (
                      <div
                        key={friend.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleFriendSelect(friend)}
                      >
                        <Avatar>
                          <AvatarImage src={friend.avatar} />
                          <AvatarFallback>{friend.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{friend.name}</span>
                      </div>
                    ))}
                    {filteredFriends.length === 0 && searchQuery && (
                      <p className="text-sm text-muted-foreground pl-3">No friends found.</p>
                    )}
                  </div>
                </div>

                {/* Groups Section */}
                {filteredGroups.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Groups</h3>
                    <div className="space-y-2">
                      {filteredGroups.map(group => (
                        <div
                          key={group.id}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => handleGroupSelect(group)}
                        >
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="h-5 w-5 text-primary" />
                          </div>
                          <span className="font-medium">{group.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

           {step === 2 && (
         <div className="flex flex-col flex-1">
           {/* Persistent Input Field - Now at the top */}
           <div className="mb-6">
              <UnifiedInput isReadOnly={false} autoFocus={false} />
           </div>

           <div className="flex-1 overflow-y-auto pb-20 no-scrollbar flex flex-col justify-center">
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 w-full"
            >
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Receipt className="h-6 w-6 text-primary" />
                  </div>
                  <Input
                    placeholder="Enter a description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="flex-1 h-12 text-lg bg-transparent border-0 border-b-2 border-muted focus-visible:ring-0 focus-visible:border-primary rounded-none px-0 transition-colors"
                    autoFocus
                  />
                </div>

                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <IndianRupee className="h-6 w-6 text-primary" />
                  </div>
                  <Input 
                    type="number"
                    placeholder="0.00" 
                    className="text-lg h-12 border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary placeholder:text-muted-foreground/50"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>

              {/* Side-by-Side Buttons */}
              <div className="pt-4 flex gap-3">
                <Button 
                  variant="outline" 
                  className={cn(
                    "flex-1 h-auto py-3 px-3 border-2 flex flex-col items-start gap-1",
                    !isDetailsValid && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={() => isDetailsValid && setStep(groupPayers.length > 1 ? 5 : 3)} // Step 3: Payer Select, or 5 if multi
                  disabled={!isDetailsValid}
                >
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Paid by</span>
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-primary" />
                    <span className="font-bold text-sm truncate max-w-[100px]">{getPaidText()}</span>
                  </div>
                </Button>

                <Button 
                  variant="outline" 
                  className={cn(
                    "flex-1 h-auto py-3 px-3 border-2 flex flex-col items-start gap-1",
                    !isDetailsValid && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={() => isDetailsValid && setStep(4)} // Step 4: Split Select
                  disabled={!isDetailsValid}
                >
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Split</span>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="font-bold text-sm truncate max-w-[100px]">{getSplitText()}</span>
                  </div>
                </Button>
              </div>

              <div className="pt-8">
                <Button 
                  size="lg" 
                  className="w-full" 
                  onClick={handleSave}
                  disabled={!isDetailsValid || isSaving}
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Expense"}
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      )}

          {/* Step 3: Payer Select */}
          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col space-y-4"
            >
              <h2 className="text-lg font-semibold mb-4">Who paid?</h2>
              <div className="space-y-2">
                {activeMembers.map(memberId => {
                  const member = getMemberDetails(memberId)
                  return (
                    <div 
                      key={memberId}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                        groupPayers.includes(memberId) && groupPayers.length === 1 ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      )}
                      onClick={() => togglePayer(memberId)}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={member.avatar} />
                          <AvatarFallback>{member.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{member.name}</span>
                      </div>
                      {groupPayers.includes(memberId) && groupPayers.length === 1 && <Check className="h-5 w-5 text-primary" />}
                    </div>
                  )
                })}
              </div>
              
              <div className="mt-auto pt-4">
                 <Button variant="outline" className="w-full mb-2" onClick={handleMultiplePeopleClick}>
                    Multiple people
                 </Button>
                 <Button variant="ghost" className="w-full" onClick={() => setStep(2)}>
                    Cancel
                 </Button>
              </div>
            </motion.div>
          )}

          {/* Step 4: Split Select */}
          {step === 4 && (
            <motion.div 
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col space-y-4"
            >
              <h2 className="text-lg font-semibold mb-4">For whom?</h2>
              <div className="space-y-2">
                {activeMembers.map(memberId => {
                  const member = getMemberDetails(memberId)
                  return (
                    <div 
                      key={memberId}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                        groupSplitMembers.includes(memberId) ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      )}
                      onClick={() => toggleSplitMember(memberId)}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={member.avatar} />
                          <AvatarFallback>{member.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{member.name}</span>
                      </div>
                      {groupSplitMembers.includes(memberId) && <Check className="h-5 w-5 text-primary" />}
                    </div>
                  )
                })}
              </div>
              <Button className="w-full mt-6" onClick={() => setStep(2)}>Done</Button>
            </motion.div>
          )}

          {/* Step 5: Multi-Payer Amount Entry */}
          {step === 5 && (
            <motion.div 
              key="step5"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col space-y-4"
            >
              <h2 className="text-lg font-semibold mb-4">Enter paid amounts</h2>
              <div className="space-y-4">
                {/* We need to allow selecting payers here too if they weren't selected before? 
                    User said: "if I click on multiple people, then the field that this person paid, this person paid should appear."
                    So we should list ALL active members and allow entering amounts.
                    If amount > 0, they are a payer.
                */}
                {activeMembers.map(memberId => {
                  const member = getMemberDetails(memberId)
                  return (
                    <div key={memberId} className="flex items-center gap-3">
                       <Avatar>
                          <AvatarImage src={member.avatar} />
                          <AvatarFallback>{member.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                           <p className="text-sm font-medium">{member.name}</p>
                        </div>
                        <div className="relative w-32">
                           <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">₹</span>
                           <Input 
                              type="number" 
                              className="pl-7" 
                              placeholder="0"
                              value={payerAmounts[memberId] || ""}
                              onChange={(e) => {
                                 const val = e.target.value
                                 setPayerAmounts(prev => ({...prev, [memberId]: val}))
                                 // Update groupPayers list based on amounts
                                 if (parseFloat(val) > 0) {
                                    if (!groupPayers.includes(memberId)) setGroupPayers(prev => [...prev, memberId])
                                 } else {
                                    // Don't remove immediately to avoid UI jumps, just handle in logic
                                 }
                              }}
                           />
                        </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-auto pt-4 sticky bottom-0 bg-background pb-4 border-t">
                 <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-medium">Total: ₹{amount}</span>
                    <span className={cn("text-sm font-bold", Math.abs(amountLeft) < 0.01 ? "text-green-600" : "text-red-600")}>
                       {Math.abs(amountLeft) < 0.01 ? "Perfect!" : `₹${amountLeft.toFixed(2)} left`}
                    </span>
                 </div>
                 <Button className="w-full" onClick={() => {
                    // Update groupPayers to only those with > 0 amount
                    const activePayers = Object.keys(payerAmounts).filter(pid => parseFloat(payerAmounts[pid]) > 0)
                    setGroupPayers(activePayers.length > 0 ? activePayers : ["currentUser"])
                    setStep(2)
                 }} disabled={!isMultiPayerValid}>
                    Done
                 </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
