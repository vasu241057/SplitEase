export type User = {
  id: string
  name: string
  email: string
  avatar?: string
}

export type Friend = User & {
  balance: number // +ve means they owe you, -ve means you owe them
  linked_user_id?: string
}

export type Group = {
  id: string
  name: string
  members: string[] // User IDs
  type: "trip" | "home" | "couple" | "other"
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
}

export type Transaction = {
  id: string
  fromId: string
  toId: string
  amount: number
  date: string
  description?: string
  deleted?: boolean
}
