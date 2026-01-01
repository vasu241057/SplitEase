export type User = {
  id: string
  name: string
  email: string
  avatar?: string
}

export type Friend = User & {
  balance: number // +ve means they owe you, -ve means you owe them
  linked_user_id?: string
  isGhost?: boolean
  group_breakdown?: {
    groupId: string
    name: string
    amount: number
  }[]
}

export type GroupMember = {
  id: string; // friend_id
  name: string;
  avatar: string; // now mandatory in return (can be empty string)
  userId: string | null; // linked_user_id
  isGhost?: boolean;
}

export type Group = {
  id: string
  name: string
  members: GroupMember[] 
  type: "trip" | "home" | "couple" | "other"
  createdBy?: string // User ID of the group creator (admin)
  simplifyDebtsEnabled?: boolean | null // Audit only for Step 1
  currentUserBalance?: number
  user_balances?: Record<string, number>
}

export type SplitType = "equal" | "unequal" | "shares" | "percentage"

export type Split = {
  userId: string
  amount: number
  paidAmount: number // How much they actually paid
  paid: boolean
}

export type Expense = {
  id: string
  description: string
  amount: number
  date: string
  payerId: string
  groupId?: string
  splits: Split[]
  category?: string
  notes?: string
  deleted?: boolean
  splitMode?: "equally" | "unequally" | "percentage"
}

export type Transaction = {
  id: string
  fromId: string
  toId: string
  amount: number
  date: string
  description?: string
  groupId?: string
  deleted?: boolean
}
