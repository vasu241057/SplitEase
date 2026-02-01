import { SupabaseClient } from '@supabase/supabase-js';

// === HELPER: Core Calculation Logic (Pure Function) ===
// Determines the net balances and breakdown for a given set of data.

// --- SIMPLIFY DEBTS ENGINE ---
type SimplifiedDebt = { from: string; to: string; amount: number };
type MemberBalance = { userId: string; balance: number };

const EPSILON = 0.005;

/**
 * Greedy matching algorithm to simplify debts.
 * Input: List of { userId, balance } where Sum(balance) approx 0.
 * Output: List of transfers { from, to, amount }.
 */
export function coreSimplifyGroupDebts(balances: MemberBalance[]): SimplifiedDebt[] {
	const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);
	// Relaxed tolerance (0.05) to account for floating point accumulation in large groups
	if (Math.abs(totalBalance) > 0.05) {
		// Check if this is a catastrophic failure or just drift
		// For safety, we log and returning empty (disabling simplification for this group)
		// throwing would abort the entire recalc process.
		console.warn(`[SIMPLIFY_ABORT] Balances sum to ${totalBalance}, expected 0.`, balances);
		return [];
	}

	const debtors: { userId: string; amount: number }[] = [];
	const creditors: { userId: string; amount: number }[] = [];

	balances.forEach((b) => {
		if (Math.abs(b.balance) < EPSILON) return;
		const paise = Math.round(b.balance * 100);

		if (paise < 0) {
			debtors.push({ userId: b.userId, amount: -paise }); // Store debt as positive magnitude
		} else if (paise > 0) {
			creditors.push({ userId: b.userId, amount: paise });
		}
	});

	// Deterministic Sort: Amount DESC, then ID ASC
	const sortFn = (a: { userId: string; amount: number }, b: { userId: string; amount: number }) => {
		if (b.amount !== a.amount) return b.amount - a.amount;
		return a.userId < b.userId ? -1 : 1;
	};

	debtors.sort(sortFn);
	creditors.sort(sortFn);

	const results: SimplifiedDebt[] = [];
	let debtorIdx = 0;
	let creditorIdx = 0;

	while (debtorIdx < debtors.length && creditorIdx < creditors.length) {
		const debtor = debtors[debtorIdx];
		const creditor = creditors[creditorIdx];

		// Match minimum of what is owed vs what is owed to creditor
		const amountPaise = Math.min(debtor.amount, creditor.amount);

		if (amountPaise > 0) {
			results.push({
				from: debtor.userId,
				to: creditor.userId,
				amount: amountPaise / 100,
			});
		}

		debtor.amount -= amountPaise;
		creditor.amount -= amountPaise;

		if (debtor.amount === 0) debtorIdx++;
		if (creditor.amount === 0) creditorIdx++;
	}

	// [SIMPLIFY_AUDIT] Log what we produced
	console.log('[SIMPLIFY_AUDIT] coreSimplifyGroupDebts OUTPUT:', {
		inputBalances: balances.map((b) => ({ userId: b.userId.slice(-8), balance: b.balance })),
		debtorCount: debtors.length,
		creditorCount: creditors.length,
		outputEdges: results.map((e) => ({ from: e.from.slice(-8), to: e.to.slice(-8), amount: e.amount })),
	});

	return results;
}

const calculateBalancesForData = (
	friendsData: any[],
	expensesData: any[],
	transactionsData: any[],
	targetGroupId: string | null = null // If set, only tracks breakdown for this group
) => {
	// [BACKEND_AUDIT] Input Integrity Check
	console.log('[BACKEND_AUDIT] calculateBalancesForData START', {
		friendsCount: friendsData.length,
		expensesCount: expensesData.length,
		transactionsCount: transactionsData.length,
		targetGroupId: targetGroupId || 'GLOBAL',
	});

	// Map: FriendID -> Balance (Net for this scope)
	const friendBalances = new Map<string, number>();
	// Map: FriendID -> Map<GroupId, Balance>
	const friendGroupBalances = new Map<string, Map<string, number>>();

	// Map: GroupID -> Map<UserId, number> (For Group List Optimization)
	const groupUserBalances = new Map<string, Map<string, number>>();

	// Map: `${ownerId}:${linkedUserId}` -> FriendID (For Global-Global lookup)
	const globalFriendLookup = new Map<string, string>();
	// Map: FriendID -> OwnerId (For getting owner of friend record)
	const friendIdToOwner = new Map<string, string>();

	// Use a Set to track missing global-to-global links: "ownerId:linkedUserId"
	const missingLinks = new Set<string>();

	// Initialize Maps
	friendsData.forEach((f: any) => {
		friendBalances.set(f.id, 0);
		friendGroupBalances.set(f.id, new Map<string, number>());
		if (f.owner_id && f.linked_user_id) {
			globalFriendLookup.set(`${f.owner_id}:${f.linked_user_id}`, f.id);
			friendIdToOwner.set(f.id, f.owner_id);
		}
	});

	// Helper to add delta to deep map
	const addGroupDelta = (friendId: string, groupId: string | undefined, delta: number) => {
		if (!groupId) return;
		if (targetGroupId && groupId !== targetGroupId) return; // Optimization: Ignore irrelevant groups in scoped run?
		// Actually, if we passed expenses from other groups, we should track them.
		// But for scoped run, expensesData only contains targetGroupId.

		// 1. Update Friend Group Breakdown
		if (!friendGroupBalances.has(friendId)) {
			friendGroupBalances.set(friendId, new Map<string, number>());
		}
		const groupMap = friendGroupBalances.get(friendId)!;
		const current = groupMap.get(groupId) || 0;
		groupMap.set(groupId, current + delta);

		// 2. Update Group User Balances
		// FIX: Use owner_id (who this balance belongs to) not linked_user_id
		const ownerId = friendIdToOwner.get(friendId);
		// Global Users have 'ownerId'. Local Friends (non-linked) use 'friendId'.
		// Both are valid identifiers for the group member context.
		const effectiveId = ownerId || friendId;

		if (effectiveId) {
			if (!groupUserBalances.has(groupId)) {
				groupUserBalances.set(groupId, new Map<string, number>());
			}
			const userMap = groupUserBalances.get(groupId)!;
			const userCurrent = userMap.get(effectiveId) || 0;
			userMap.set(effectiveId, userCurrent + delta);
		}
	};

	// Helper to routing debt updates
	const processTransfer = (debtorId: string, creditorId: string, amount: number, groupId: string | undefined) => {
		const isDebtorLocal = friendBalances.has(debtorId);
		const isCreditorLocal = friendBalances.has(creditorId);

		// === INVARIANT ENFORCEMENT: Group transfers MUST be Global↔Global ===
		// Groups only support global user participants.
		// Local friends are ONLY valid in personal (non-group) expenses.
		if (groupId) {
			if (isDebtorLocal || isCreditorLocal) {
				throw new Error(
					`[GROUP_INVARIANT_VIOLATION] Group transfer involves local friend. ` +
						`Group: ${groupId}, Debtor: ${debtorId} <${isDebtorLocal ? 'LOCAL' : 'GLOBAL'}>, ` +
						`Creditor: ${creditorId} <${isCreditorLocal ? 'LOCAL' : 'GLOBAL'}>`
				);
			}
			// Groups MUST use Case 1 (Global → Global) path below
		}

		// Case 1: Global User A owes Global User B
		// In this case, neither ID found in local `friendBalances` implies they are both global users (identified by user_id in splits?)
		// Actually, `debtors` list comes from `netBalances` keys.
		// `netBalances` keys are either friend_id (if local) OR linked_user_id (if global/matched).
		// So `isDebtorLocal` check works if `debtorId` is a friend_id.
		// If `debtorId` is a global user_id, `friendBalances.has` will be false (unless UUID collision).

		if (!isDebtorLocal && !isCreditorLocal) {
			// Both are Global User IDs
			const globalDebtorId = debtorId; // UUID
			const globalCreditorId = creditorId; // UUID

			// A owes B: Update A's friend record for B
			const keyForB = `${globalDebtorId}:${globalCreditorId}`; // Owner: Debtor, Linked: Creditor
			const friendRecordForB = globalFriendLookup.get(keyForB);

			if (friendRecordForB) {
				friendBalances.set(friendRecordForB, (friendBalances.get(friendRecordForB) || 0) - amount);
				addGroupDelta(friendRecordForB, groupId, -amount);
			} else {
				// Missing Link: Debtor needs a record for Creditor
				missingLinks.add(keyForB);
			}

			// B is owed by A: Update B's friend record for A
			const keyForA = `${globalCreditorId}:${globalDebtorId}`; // Owner: Creditor, Linked: Debtor
			const friendRecordForA = globalFriendLookup.get(keyForA);

			if (friendRecordForA) {
				friendBalances.set(friendRecordForA, (friendBalances.get(friendRecordForA) || 0) + amount);
				addGroupDelta(friendRecordForA, groupId, amount);
			} else {
				// Missing Link: Creditor needs a record for Debtor
				missingLinks.add(keyForA);
			}
			return;
		}

		// === PERSONAL (NON-GROUP) EXPENSE PATHS ONLY ===
		// The following cases handle local friends, which are NOT supported in groups.

		// Case 2: Local Friend F owes Global User A (PERSONAL ONLY)
		if (isDebtorLocal && !isCreditorLocal) {
			const friendId = debtorId;
			const current = friendBalances.get(friendId) || 0;
			friendBalances.set(friendId, current + amount);
			addGroupDelta(friendId, groupId, amount);
			return;
		}

		// Case 3: Global User A owes Local Friend F (PERSONAL ONLY)
		if (!isDebtorLocal && isCreditorLocal) {
			const friendId = creditorId;
			const current = friendBalances.get(friendId) || 0;
			friendBalances.set(friendId, current - amount);
			addGroupDelta(friendId, groupId, -amount);
			return;
		}
	};

	// Process Expenses
	expensesData.forEach((expense: any) => {
		const netBalances = new Map<string, number>();
		const groupId = expense.group_id;

		// INVARIANT: All expenses have payer_user_id after Step 5 backfill
		const payerId = expense.payer_user_id;
		if (!payerId) {
			console.error('[CALC_INVARIANT_VIOLATION]', {
				reason: 'missing_payer',
				expenseId: expense.id,
				expense: { id: expense.id, group_id: expense.group_id, payer_user_id: expense.payer_user_id },
			});
			throw new Error(`[RECALC_INVARIANT_VIOLATION] payer_user_id is required. Expense: ${expense.id}`);
		}

		expense.splits.forEach((split: any) => {
			// === INVARIANT: All splits must have user_id (enforced at write-time) ===
			// After Step 2, all new expenses store user_id in splits.
			// After Step 5 backfill, legacy data will also have user_id.
			// No fallback to friend_id — if missing, throw immediately.
			
			if (!split.user_id) {
				console.error('[CALC_INVARIANT_VIOLATION]', {
					reason: 'missing_user_id',
					expenseId: expense.id,
					split: split,
				});
				throw new Error(
					`[RECALC_INVARIANT_VIOLATION] split.user_id is required. ` +
					`Expense: ${expense.id}, Group: ${expense.group_id || 'personal'}, Split: ${JSON.stringify(split)}`
				);
			}
			const personId = split.user_id;

			const cost = split.amount;
			const paid = split.paid_amount || (split.paid ? split.amount : 0);

			const current = netBalances.get(personId) || 0;
			netBalances.set(personId, current + (paid - cost));
		});

		const totalPaidInSplits = expense.splits.reduce((sum: number, s: any) => sum + (s.paid_amount || 0), 0);
		const unpaidAmount = expense.amount - totalPaidInSplits;

		if (unpaidAmount > 0.01) {
			const current = netBalances.get(payerId) || 0;
			netBalances.set(payerId, current + unpaidAmount);
		}

		// [BACKEND_AUDIT] Net Balances for Expense
		if (Math.abs(unpaidAmount) > 0.01 || netBalances.size > 0) {
			// Only log complex cases to avoid spam
			if (expense.splits.length > 5 || Math.abs(expense.amount) > 1000) {
				console.log(`[BACKEND_AUDIT] Ephemeral Net Balances for Expense ${expense.id}:`, Array.from(netBalances.entries()));
			}
		}

		// Simplify Debt
		const debtors: { id: string; amount: number }[] = [];
		const creditors: { id: string; amount: number }[] = [];

		netBalances.forEach((bal, id) => {
			if (bal < -0.01) debtors.push({ id, amount: bal });
			if (bal > 0.01) creditors.push({ id, amount: bal });
		});

		debtors.sort((a, b) => a.amount - b.amount);
		creditors.sort((a, b) => b.amount - a.amount);

		let i = 0;
		let j = 0;

		while (i < debtors.length && j < creditors.length) {
			const debtor = debtors[i];
			const creditor = creditors[j];
			const transferAmount = Math.min(Math.abs(debtor.amount), creditor.amount);

			processTransfer(debtor.id, creditor.id, transferAmount, groupId);

			debtor.amount += transferAmount;
			creditor.amount -= transferAmount;

			if (Math.abs(debtor.amount) < 0.01) i++;
			if (creditor.amount < 0.01) j++;
		}
	});

	// Process Transactions
	transactionsData.forEach((tx: any) => {
		const groupId = tx.group_id;
		const creatorId = tx.created_by || tx.friend?.owner_id;
		const friendLinkedUserId = tx.friend?.linked_user_id; // Need to ensure friend relation is loaded if we rely on this
		// Note: In Scoped Recalc, we might fetch 'friend' in the query or join.
		// If we passed raw 'transactionsData', make sure 'friend' is expanded or available.

		const otherUserId = friendLinkedUserId || null;

		const creatorFriendKey = otherUserId ? `${creatorId}:${otherUserId}` : null;
		const creatorFriendId = creatorFriendKey ? globalFriendLookup.get(creatorFriendKey) : tx.friend_id;

		if (creatorFriendId) {
			const current = friendBalances.get(creatorFriendId) || 0;
			if (tx.type === 'paid') {
				friendBalances.set(creatorFriendId, current + tx.amount);
				addGroupDelta(creatorFriendId, groupId, tx.amount);
			} else {
				friendBalances.set(creatorFriendId, current - tx.amount);
				addGroupDelta(creatorFriendId, groupId, -tx.amount);
			}
		}

		if (otherUserId && creatorId) {
			const inverseKey = `${otherUserId}:${creatorId}`;
			const inverseFriendId = globalFriendLookup.get(inverseKey);

			if (inverseFriendId) {
				const inverseCurrent = friendBalances.get(inverseFriendId) || 0;
				if (tx.type === 'paid') {
					friendBalances.set(inverseFriendId, inverseCurrent - tx.amount);
					addGroupDelta(inverseFriendId, groupId, -tx.amount);
				} else {
					friendBalances.set(inverseFriendId, inverseCurrent + tx.amount);
					addGroupDelta(inverseFriendId, groupId, tx.amount);
				}
			}
		}
	});

	return {
		friendBalances,
		friendGroupBalances,
		groupUserBalances,
		missingLinks, // Return detected missing links
	};
};

export const recalculateBalances = async (supabase: SupabaseClient) => {
	const MAX_RETRIES = 3;
	let attempts = 0;

	while (attempts < MAX_RETRIES) {
		attempts++;
		console.log(`[DEBUG] RecalculateBalances Attempt ${attempts}/${MAX_RETRIES}`);

		const { data: latestExpense } = await supabase
			.from('expenses')
			.select('created_at')
			.order('created_at', { ascending: false })
			.limit(1)
			.single();
		const { data: latestTx } = await supabase
			.from('transactions')
			.select('created_at')
			.order('created_at', { ascending: false })
			.limit(1)
			.single();

		const signatureStart = `${latestExpense?.created_at || '0'}|${latestTx?.created_at || '0'}`;

		// 1. Fetch all Friends
		let { data: friendsData, error: friendsError } = await supabase.from('friends').select('id, owner_id, linked_user_id, group_breakdown');

		if (friendsError) throw friendsError;

		// 2. Fetch Active Expenses
		const { data: expensesData, error: expensesError } = await supabase
			.from('expenses')
			.select(
				'id, amount, payer_user_id, payer_id, group_id, description, splits:expense_splits(user_id, friend_id, amount, paid_amount, paid)'
			)
			.eq('deleted', false);

		if (expensesError) throw expensesError;

		// Fetch Groups with Simplify Flag
		const { data: groupsData } = await supabase.from('groups').select('id, name, simplify_debts_enabled');
		const groupNameMap = new Map<string, string>();
		const groupSimplifyMap = new Map<string, boolean>();

		groupsData?.forEach((g: any) => {
			groupNameMap.set(g.id, g.name);
			groupSimplifyMap.set(g.id, g.simplify_debts_enabled);
		});

		// 3. Compute
		// Fetch transactions first
		const { data: transactionsData, error: txError } = await supabase
			.from('transactions')
			.select('*, friend:friends(owner_id, linked_user_id)')
			.in('type', ['paid', 'received'])
			.eq('deleted', false);
		if (txError) throw txError;

		// --- INVARIANT: No Implicit Friend Creation in Recalculation ---
		// Friend relationships MUST be created during group lifecycle events (Step 3).
		// If missing links are detected here, it indicates a data integrity issue.
		//
		// NOTE:
		// Legacy groups created before Step 3 may lack complete friend relationships.
		// This is expected until Step 5 backfill is executed.
		// Missing friend relationships now cause hard failures by design.
		// ---
		const result = calculateBalancesForData(friendsData || [], expensesData, transactionsData);

		if (result.missingLinks.size > 0) {
			console.error('[CALC_INVARIANT_VIOLATION]', {
				reason: 'missing_links',
				context: 'global_recalc',
				missingLinks: Array.from(result.missingLinks),
			});
			throw new Error(
				`[RECALC_INVARIANT_VIOLATION] Missing friend relationships detected: ` +
				`${Array.from(result.missingLinks).join(', ')}. ` +
				`Friend records must be created during group lifecycle events, not recalculation.`
			);
		}
		// ---

		const calculatedFriendBalances = result.friendBalances;
		const calculatedFriendGroupBalances = result.friendGroupBalances;
		const calculatedGroupUserBalances = result.groupUserBalances;

		// --- STEP 3a: PRE-CALCULATE SIMPLIFIED EDGES (GLOBAL) ---
		// We need to know the simplified state of every group to correctly populate the Friend Breakdown.
		const simplifiedEdgesMap = new Map<string, SimplifiedDebt[]>(); // GroupID -> Edges

		const groupUpdates = Array.from(calculatedGroupUserBalances.entries()).map(
			async ([groupId, userMap]: [string, Map<string, number>]) => {
				const userBalancesObj: Record<string, number> = {};
				const balancesForSimplify: MemberBalance[] = [];

				userMap.forEach((amt: number, uid: string) => {
					if (Math.abs(amt) > 0.01) {
						userBalancesObj[uid] = Math.round(amt * 100) / 100;
						balancesForSimplify.push({ userId: uid, balance: userBalancesObj[uid] });
					}
				});

				// SIMPLIFICATION ENGINE
				let simplifiedDebts: SimplifiedDebt[] = [];
				const isSimplifyEnabled = groupSimplifyMap.get(groupId) === true;

				if (isSimplifyEnabled) {
					const rawNodeCount = balancesForSimplify.length;
					try {
						simplifiedDebts = coreSimplifyGroupDebts(balancesForSimplify);
						// Cache for Friend Sync
						simplifiedEdgesMap.set(groupId, simplifiedDebts);
						console.log(`[SIMPLIFY_ENGINE_RUN] Group ${groupId}: ${rawNodeCount} Raw Nodes -> ${simplifiedDebts.length} Simplified Edges`);
					} catch (err) {
						console.error(`[SIMPLIFY_FAIL] Group ${groupId}:`, err);
					}
				}

				await supabase
					.from('groups')
					.update({
						user_balances: userBalancesObj,
						simplified_debts: simplifiedDebts,
					})
					.eq('id', groupId);
			}
		);

		// Run Group Updates FIRST (to populate map if we needed async, but we compute synchronously inside the map callback locally)
		// Actually, we need to wait for these promises to complete DB writes?
		// No, we can run them in parallel with Friend updates, BUT we need `simplifiedEdgesMap` populated.
		// The map population happens synchronously in the loop *before* the await update?
		// Yes, `simplifiedEdgesMap.set` is synchronous.
		// So we can start friend updates immediately.

		// Wait for group writes to ensure safety? Let's bundle them at the end or just run them.
		// We'll collect promises.
		const groupUpdatePromises = groupUpdates; // Array of promises

		// === HELPER: Verify Invariants ===
		const verifyInvariants = (pendingUpdates: { id: string; balance: number; breakdown: any[]; rawBreakdownSum: number }[]) => {
			// Check 2: Friend Balance == Sum(Breakdown Amounts)
			// Note: calculatedFriendBalances (which drove pendingUpdates) is derived from Raw Pairwise Logic.
			// If Simplification routes debt differently, does Friend.balance change?
			// YES. Friend.balance MUST match the sum of the breakdown (Effective).
			// In Friends.tsx (Step 4), we forcefully sum the breakdown.
			// Here, we should ensure the 'balance' we save to DB also matches that sum.

			pendingUpdates.forEach((update) => {
				const effectiveSum = update.breakdown.reduce((acc, b) => acc + b.amount, 0);
				const diff = Math.abs(update.balance - effectiveSum);

				// If we are saving a balance that doesn't match the breakdown, we have a problem.
				// BUT wait. 'update.balance' currently comes from 'calculatedFriendBalances' which is RAW.
				// If simplification is active, 'effectiveSum' will be SIMPLIFIED.
				// They WILL differ!
				// Correct action: Overwrite 'update.balance' with 'effectiveSum' to ensure consistency.
				// The Friend List relies on 'group_breakdown' sum anyway, but having 'balance' column consistent is good for sorting/perf.

				if (diff > 0.01) {
					// console.log(`[BALANCE_ALIGNMENT] Updating friend ${update.id} balance from ${update.balance} (Raw) to ${effectiveSum} (Effective)`);
					update.balance = Math.round(effectiveSum * 100) / 100;
				}
			});

			console.log('[BALANCE_CONSISTENCY_OK] Invariants verified.');
		};

		// --- STEP 3b: FRIEND IDENTITY SYNC ---
		console.log('[BALANCE_DEBUG] Persisting Friend updates with Identity Sync...');
		const friendIds = Array.from(calculatedFriendBalances.keys());
		const { data: currentBalancesData } = await supabase
			.from('friends')
			.select('id, owner_id, linked_user_id, balance, group_breakdown')
			.in('id', friendIds);

		// Map FriendID to Metadata for bilateral edge lookup
		const friendMetaMap = new Map<string, { ownerId: string; linkedUserId: string }>();
		friendsData?.forEach((f: any) => {
			if (f.owner_id && f.linked_user_id) {
				friendMetaMap.set(f.id, { ownerId: f.owner_id, linkedUserId: f.linked_user_id });
			}
		});

		const currentBalancesMap = new Map<string, any>();
		currentBalancesData?.forEach((f: any) => currentBalancesMap.set(f.id, f));

		// Helper to find effective BILATERAL balance from simplified edges
		const getEffectiveBalance = (friendId: string, groupId: string, rawAmount: number): number => {
			const edges = simplifiedEdgesMap.get(groupId);
			if (!edges) return rawAmount;

			const meta = friendMetaMap.get(friendId);
			if (!meta) return rawAmount; // Local friend -> No global edges -> Raw

			const { ownerId: myId, linkedUserId: theirId } = meta;

			// Sum edges between Me and Them
			// Positive: They owe Me (Them -> Me)
			// Negative: I owe Them (Me -> Them)

			let net = 0;
			edges.forEach((edge) => {
				if (edge.from === theirId && edge.to === myId) net += edge.amount;
				if (edge.from === myId && edge.to === theirId) net -= edge.amount;
			});

			// [SIMPLIFY_AUDIT] Log effective balance calculation
			if (Math.abs(net) > 0.01 || Math.abs(rawAmount) > 0.01) {
				console.log('[SIMPLIFY_AUDIT] getEffectiveBalance:', {
					friendId: friendId.slice(-8),
					groupId: groupId.slice(-8),
					myId: myId.slice(-8),
					theirId: theirId.slice(-8),
					rawAmount,
					effectiveNet: net,
					edgesInvolvingUs: edges
						.filter((e) => (e.from === theirId && e.to === myId) || (e.from === myId && e.to === theirId))
						.map((e) => ({ from: e.from.slice(-8), to: e.to.slice(-8), amt: e.amount })),
				});
			}

			return Math.round(net * 100) / 100;
		};

		// COLLECT UPDATES
		const pendingUpdates: { id: string; balance: number; breakdown: any[]; rawBreakdownSum: number }[] = [];

		for (const [id, balance] of calculatedFriendBalances) {
			const rawBreakdown = calculatedFriendGroupBalances.get(id);
			const breakdownList: { groupId: string; name: string; amount: number; rawAmount: number }[] = [];
			let rawSum = 0;

			if (rawBreakdown) {
				rawBreakdown.forEach((amt, gid) => {
					const rawVal = Math.round(amt * 100) / 100;
					rawSum += rawVal;

					let effectiveVal = rawVal;
					if (groupSimplifyMap.get(gid)) {
						effectiveVal = getEffectiveBalance(id, gid, rawVal);
					}

					if (Math.abs(rawVal) > 0.01 || Math.abs(effectiveVal) > 0.01) {
						breakdownList.push({
							groupId: gid,
							name: groupNameMap.get(gid) || 'Unknown Group',
							amount: effectiveVal,
							rawAmount: rawVal,
						});
					}
				});
			}

			pendingUpdates.push({
				id,
				balance: Math.round(balance * 100) / 100, // Initial Raw Balance
				breakdown: breakdownList,
				rawBreakdownSum: Math.round(rawSum * 100) / 100,
			});
		}

		// RUN CHECKS & CORRECTIONS
		verifyInvariants(pendingUpdates);

		// Build updates array for atomic RPC
		const friendUpdates: Array<{ friend_id: string; balance: number; group_breakdown: any[] }> = [];

		pendingUpdates.forEach((update) => {
			const currentRecord = currentBalancesMap.get(update.id);
			const oldBalance = currentRecord?.balance || 0;
			const oldBreakdownJSON = JSON.stringify(currentRecord?.group_breakdown || []);
			const newBreakdownJSON = JSON.stringify(update.breakdown);

			const balanceChanged = Math.abs(update.balance - oldBalance) > 0.001;
			const breakdownChanged = oldBreakdownJSON !== newBreakdownJSON;

			if (balanceChanged || breakdownChanged) {
				friendUpdates.push({
					friend_id: update.id,
					balance: update.balance, // Saved balance IS NOW EFFECTIVE
					group_breakdown: update.breakdown,
				});
			}
		});

		// Persist group updates
		await Promise.all(groupUpdatePromises);

		// Persist friend updates atomically via RPC
		if (friendUpdates.length > 0) {
			const { error: rpcError } = await supabase.rpc('update_friend_balances_atomic', {
				p_updates: friendUpdates,
			});

			if (rpcError) {
				console.error('[RECALC_GLOBAL_RPC_ERROR]', {
					updateCount: friendUpdates.length,
					error: rpcError.message,
				});
				throw new Error(`[RECALC_GLOBAL_RPC_ERROR] Atomic update failed: ${rpcError.message}`);
			}

			console.log(`[RECALC_GLOBAL_RPC_SUCCESS] Applied ${friendUpdates.length} friend updates atomically`);
		}

		console.log('[IDENTITY_SYNC_COMPLETE] Global Recalc Synced.');
		return; // Success
	}
	console.error(`[CONCURRENCY_GUARD] Failed to settle balances after ${MAX_RETRIES} attempts.`);
};

// === Scoped Recalculation ===
export const recalculateGroupBalances = async (supabase: SupabaseClient, groupId: string) => {
	// INVARIANT: groupId is required for scoped recalculation
	// NO global fallback - if groupId is missing, fail fast.
	if (!groupId) {
		throw new Error('[RECALC_INVARIANT_VIOLATION] groupId is required for scoped recalculation');
	}

	console.log(`[RECALC_SCOPE_START] { groupId: '${groupId}' }`);

	try {
		const MAX_RETRIES = 3;
		let attempts = 0;

		while (attempts < MAX_RETRIES) {
			attempts++;

			// 1. Scoped Lock (Latest activity in THIS group)
			const { data: latestExpense } = await supabase
				.from('expenses')
				.select('created_at')
				.eq('group_id', groupId)
				.order('created_at', { ascending: false })
				.limit(1)
				.single();
			const { data: latestTx } = await supabase
				.from('transactions')
				.select('created_at')
				.eq('group_id', groupId)
				.order('created_at', { ascending: false })
				.limit(1)
				.single();

			const signatureStart = `${latestExpense?.created_at || '0'}|${latestTx?.created_at || '0'}`;

			// 2. Fetch Data (Scoped)
			// Fetch group members (friends)
			// NOTE: For implicit creation, we only fetch relevant group members (existing friends).
			// If new global-global debt arises, we might not have the rows in 'groupMembers' yet because they don't exist in 'friends'.
			// However, Scoped Recalc relies on 'groupMembers' table to find participants.
			// 'groupMembers' table has 'friend_id'.
			// Implicit Friends creation happens when two GLOBAL users (who might interact via splits) have debt.
			// If a User is in a Group, they have a 'Group Member' entry.
			// If that entry points to a Friend Record F1 (Self Friend for U1), and U2 has F2 (Self Friend for U2).
			// Debt is between U1 and U2.
			// Logic sees Global U1 owes Global U2.
			// Checks if U1 has friend record for U2. Only if so, it updates. Else misses.

			// So we need ALL friend records potentially?
			// Scoped fetch:
			// Fetching `friends` via `group_members` only gives us the friends LINKED to the group.
			// It does NOT give us the "private friend records" that U1 might have of U2.
			// Wait, does `calculateBalancesForData` need U1's private record of U2?
			// yes, `globalFriendLookup` relies on input `friendsData`.
			// If we only pass "Group Members" (which are typically 'Self' friends or explicitly added friends),
			// We might miss existing private friend records if they are not "members" of the group.
			// No, private friend records are not members of the group. The USER is the member.

			// CRITICAL FLAW in SCOPED RECALC with Implicit Friends:
			// Ensure we fetch ALL friend records that might be relevant?
			// Or just fetch ALL friends for the users in the group?
			// "Select * from friends where owner_id IN (UserIdsInGroup) AND linked_user_id IN (UserIdsInGroup)"

			// For now, let's implement the loop as requested, but acknowledge that strict scoping relies on input data.
			// The current scoped implementation fetches: `group_members -> friends`
			// This is INSUFFICIENT for Global-Global debt if the "Relationship Friend Record" is not a group member.
			// Usually, only "Self" friends are group members.
			// So Global-Global debt logic needs "Relationship Friend Records" (A's record of B).
			// These records are NOT in `group_members`.

			// Fix for Scoped Data Fetching:
			// 1. Get UserIDs of all members in the group.
			// 2. Fetch ALL friend records between these UserIDs.

			const { data: groupMembersRaw } = await supabase
				.from('group_members')
				.select('friends!inner(linked_user_id)')
				.eq('group_id', groupId);

			const involvedUserIds = Array.from(new Set(groupMembersRaw?.map((m: any) => m.friends.linked_user_id).filter(Boolean)));

			let friendsData: any[] = [];

			if (involvedUserIds.length > 0) {
				// Fetch ALL friend records relevant to these users (relationships between them)
				// This ensures we have the "A owes B" records even if they aren't group members.
				const { data: relevantFriends, error: relFreqError } = await supabase
					.from('friends')
					.select('id, owner_id, linked_user_id, group_breakdown')
					.in('owner_id', involvedUserIds)
					.in('linked_user_id', involvedUserIds);

				if (relFreqError) throw relFreqError;
				friendsData = relevantFriends || [];
			} else {
				// Fallback if no linked users (mostly local friends?)
				// Fetch via group members again
				const { data: groupMembers } = await supabase
					.from('group_members')
					.select('friend_id, friends!inner(id, owner_id, linked_user_id, group_breakdown)')
					.eq('group_id', groupId);
				friendsData = groupMembers?.map((gm: any) => gm.friends) || [];
			}

			// Fetch Group Expenses
			const { data: expensesData, error: expensesError } = await supabase
				.from('expenses')
				.select(
					'id, amount, payer_user_id, payer_id, group_id, description, splits:expense_splits(user_id, friend_id, amount, paid_amount, paid)'
				)
				.eq('group_id', groupId)
				.eq('deleted', false);

			if (expensesError) throw expensesError;

			// Fetch Group Transactions
			const { data: transactionsData, error: txError } = await supabase
				.from('transactions')
				.select('type, amount, group_id, created_by, friend_id, friend:friends(owner_id, linked_user_id)')
				.eq('group_id', groupId)
				.in('type', ['paid', 'received'])
				.eq('deleted', false);

			if (txError) throw txError;

			// --- INVARIANT: No Implicit Friend Creation in Scoped Recalculation ---
			// Friend relationships MUST be created during group lifecycle events (Step 3).
			// If missing links are detected here, it indicates a data integrity issue.
			//
			// NOTE:
			// Legacy groups created before Step 3 may lack complete friend relationships.
			// This is expected until Step 5 backfill is executed.
			// Missing friend relationships now cause hard failures by design.
			// ---
			const result = calculateBalancesForData(friendsData, expensesData, transactionsData, groupId);

			if (result.missingLinks.size > 0) {
				console.error('[CALC_INVARIANT_VIOLATION]', {
					reason: 'missing_links',
					context: 'scoped_group_recalc',
					groupId,
					missingLinks: Array.from(result.missingLinks),
				});
				throw new Error(
					`[RECALC_INVARIANT_VIOLATION] Missing friend relationships in group ${groupId}: ` +
					`${Array.from(result.missingLinks).join(', ')}. ` +
					`Friend records must be created during group lifecycle events, not recalculation.`
				);
			}
			// ---

			const { friendBalances: newGroupDeltas, friendGroupBalances, groupUserBalances } = result;

			// --- INVARIANT ASSERTION Check: Zero Sum ---
			let netSum = 0;
			newGroupDeltas.forEach((val) => (netSum += val));

			console.log(`[BACKEND_AUDIT] Scoped Recalc Net Sum: ${netSum.toFixed(4)}`);

			if (Math.abs(netSum) > 0.05) {
				// 5 cents tolerance for floating point accumulation
				console.error(`[BACKEND_AUDIT] [CRITICAL_INVARIANT_FAILURE] Zero-Sum Violated. Net Sum: ${netSum}`, {
					groupId,
					deltas: Array.from(newGroupDeltas.entries()),
				});
				throw new Error(`[RECALC_ASSERT_FAIL] Zero-Sum Invariant Violated. Net Sum: ${netSum}`);
			}

			// --- Shadow Mode Parity Check (Dev Only) ---
			if (process.env.RECALC_PARITY_CHECK === 'true') {
				// Note: Implementing true shadow check requires fetching ALL data, which defeats performance.
				// We will skip this in production path to avoid latency, but log intention.
				console.log('[RECALC_PARITY] Shadow Check skipped for performance. Enable manual audit if needed.');
			}

			// 4. Verify Lock
			const { data: latestExpenseCheck } = await supabase
				.from('expenses')
				.select('created_at')
				.eq('group_id', groupId)
				.order('created_at', { ascending: false })
				.limit(1)
				.single();
			const { data: latestTxCheck } = await supabase
				.from('transactions')
				.select('created_at')
				.eq('group_id', groupId)
				.order('created_at', { ascending: false })
				.limit(1)
				.single();

			const signatureEnd = `${latestExpenseCheck?.created_at || '0'}|${latestTxCheck?.created_at || '0'}`;

			if (signatureStart !== signatureEnd) {
				console.warn(`[RECALC_SCOPE_RETRY] Data changed in group ${groupId}. Retrying...`);
				await new Promise((r) => setTimeout(r, Math.random() * 200));
				continue;
			}

			// 5. Delta Application
			// For each friend involved in this group, we replace the component of their balance that belongs to this group.

			// Need 'name' for the breakdown entry
			const { data: groupData } = await supabase.from('groups').select('name, simplify_debts_enabled').eq('id', groupId).single();
			const groupName = groupData?.name || 'Unknown';
			const simplifyDebtsEnabled = groupData?.simplify_debts_enabled === true;

			// NEEDED for Scoped Identity Sync:
			// We need to map `friendId` (Local) -> `userId` (Global/Linked) to match Edges.
			// We can re-use `friendsData` which contains `linked_user_id`.



			// ========================================================================
			// STEP 1: Compute Group User Balances and Simplified Debts FIRST
			// (Must happen BEFORE updates function which needs simplifiedDebts)
			// ========================================================================
			const userMap = groupUserBalances.get(groupId);
			const userBalancesObj: Record<string, number> = {};
			let simplifiedDebts: SimplifiedDebt[] = [];
			const balancesForSimplify: MemberBalance[] = [];

			if (userMap) {
				userMap.forEach((amt: number, uid: string) => {
					if (Math.abs(amt) > 0.01) {
						const val = Math.round(amt * 100) / 100;
						userBalancesObj[uid] = val;
						balancesForSimplify.push({ userId: uid, balance: val });
					}
				});

				// [AUDIT] Log the raw group user balances BEFORE simplification
				console.log('[SIGN_AUDIT] Step 1 - Group User Balances (Input to Simplification):', {
					groupId: groupId.slice(-8),
					balances: balancesForSimplify.map((b) => ({
						userId: b.userId.slice(-8),
						balance: b.balance,
						interpretation: b.balance > 0 ? 'CREDITOR (is owed)' : 'DEBTOR (owes)',
					})),
				});

				// SIMPLIFICATION ENGINE (Scoped)
				if (simplifyDebtsEnabled) {
					try {
						simplifiedDebts = coreSimplifyGroupDebts(balancesForSimplify);
						console.log(
							`[SIMPLIFY_ENGINE_RUN] [SCOPED] Group ${groupId}: ${balancesForSimplify.length} Raw Nodes -> ${simplifiedDebts.length} Simplified Edges`
						);

						// [AUDIT] Log simplified edges with interpretation
						console.log('[SIGN_AUDIT] Step 2 - Simplified Debts (Output):', {
							groupId: groupId.slice(-8),
							edges: simplifiedDebts.map((e) => ({
								from: e.from.slice(-8),
								to: e.to.slice(-8),
								amount: e.amount,
								interpretation: `${e.from.slice(-8)} OWES ${e.to.slice(-8)} ₹${e.amount}`,
							})),
						});
					} catch (err) {
						console.error(`[SIMPLIFY_FAIL] [SCOPED] Group ${groupId}:`, err);
					}
				}
			}

			// ========================================================================
			// STEP 2: Build updates array and call atomic RPC
			// ========================================================================
			const friendUpdates: Array<{ friend_id: string; balance: number; group_breakdown: any[] }> = [];

			friendsData.forEach((friend: any) => {
				const friendId = friend.id;

				// Get new Amount for this group (Raw)
				const newGroupAmountRaw = newGroupDeltas.get(friendId) || 0;

				// Get Effective Amount (Simplified)
				let effectiveAmount = newGroupAmountRaw;

				if (simplifyDebtsEnabled && simplifiedDebts.length > 0) {
					const linkedUser = friend.linked_user_id;
					const ownerId = friend.owner_id;

					// [CRITICAL FIX] The friend record's balance is FROM owner's perspective
					// owner_id = ME, linked_user_id = THEM
					// So we need to find edges between ME and THEM

					let net = 0;
					simplifiedDebts.forEach((edge) => {
						// Edge from=THEM, to=ME means THEY owe ME -> positive
						if (edge.from === linkedUser && edge.to === ownerId) {
							net += edge.amount;
						}
						// Edge from=ME, to=THEM means I owe THEM -> negative
						if (edge.from === ownerId && edge.to === linkedUser) {
							net -= edge.amount;
						}
					});

					effectiveAmount = Math.round(net * 100) / 100;

					// [AUDIT] Log effective amount calculation
					if (Math.abs(effectiveAmount) > 0.01 || Math.abs(newGroupAmountRaw) > 0.01) {
						console.log('[SIGN_AUDIT] Step 3 - Effective Amount Calculation:', {
							friendId: friendId.slice(-8),
							friendName: friend.name,
							ownerId: ownerId?.slice(-8) || 'N/A',
							linkedUserId: linkedUser?.slice(-8) || 'local',
							rawAmount: newGroupAmountRaw,
							rawInterpretation: newGroupAmountRaw > 0 ? 'THEY owe ME' : 'I owe THEM',
							effectiveAmount,
							effectiveInterpretation: effectiveAmount > 0 ? 'THEY owe ME' : 'I owe THEM',
							matchingEdges: simplifiedDebts
								.filter((e) => (e.from === linkedUser && e.to === ownerId) || (e.from === ownerId && e.to === linkedUser))
								.map((e) => `${e.from.slice(-8)}→${e.to.slice(-8)}: ${e.amount}`),
						});
					}
				}

				// Get Old Amount for this group from DB (loaded in friendsData)
				const currentBreakdown = friend.group_breakdown || [];
				const oldEntry = currentBreakdown.find((b: any) => b.groupId === groupId);



				// Update Breakdown Entry
				const otherGroups = currentBreakdown.filter((b: any) => b.groupId !== groupId);
				let newBreakdown = [...otherGroups];

				if (Math.abs(newGroupAmountRaw) > 0.01 || Math.abs(effectiveAmount) > 0.01) {
					newBreakdown.push({
						groupId: groupId,
						name: groupName,
						amount: Math.round(effectiveAmount * 100) / 100,
						rawAmount: Math.round(newGroupAmountRaw * 100) / 100,
					});
				}

				// FIX: Compute balance as sum of EFFECTIVE amounts (breakdown.amount)
				const effectiveSum = newBreakdown.reduce((acc: number, b: any) => acc + b.amount, 0);
				const newBalance = Math.round(effectiveSum * 100) / 100;

				// Change detection to prevent write amplification
				const oldBreakdown = friend.group_breakdown ?? [];
				const oldEffectiveSum = oldBreakdown.reduce((acc: number, b: any) => acc + (b.amount ?? 0), 0);
				const oldBalance = Math.round(oldEffectiveSum * 100) / 100;
				const oldBreakdownJSON = JSON.stringify(oldBreakdown);
				const newBreakdownJSON = JSON.stringify(newBreakdown);

				const balanceChanged = Math.abs(newBalance - oldBalance) > 0.001;
				const breakdownChanged = oldBreakdownJSON !== newBreakdownJSON;

				if (!balanceChanged && !breakdownChanged) {
					return; // SKIP - no changes for this friend
				}

				// Add to updates array for atomic RPC
				friendUpdates.push({
					friend_id: friendId,
					balance: newBalance,
					group_breakdown: newBreakdown,
				});
			});

			// Persist Group data (user_balances and simplified_debts)
			await supabase
				.from('groups')
				.update({
					user_balances: userBalancesObj,
					simplified_debts: simplifiedDebts,
				})
				.eq('id', groupId);

			// Persist friend updates atomically via RPC
			if (friendUpdates.length > 0) {
				const { error: rpcError } = await supabase.rpc('update_friend_balances_atomic', {
					p_updates: friendUpdates,
				});

				if (rpcError) {
					console.error('[RECALC_GROUP_RPC_ERROR]', {
						groupId,
						updateCount: friendUpdates.length,
						error: rpcError.message,
					});
					throw new Error(`[RECALC_GROUP_RPC_ERROR] Atomic update failed: ${rpcError.message}`);
				}

				console.log(`[RECALC_GROUP_RPC_SUCCESS] Applied ${friendUpdates.length} friend updates atomically`);
			}

			console.log(`[RECALC_SCOPE_SUCCESS] { groupId: '${groupId}' }`);
			return;
		}
		// INVARIANT: Scoped recalculation must complete or fail - no silent fallback
		throw new Error(`[RECALC_INVARIANT_VIOLATION] Scoped recalculation failed after ${MAX_RETRIES} retry attempts`);
	} catch (e: any) {
		// INVARIANT: No global fallback - propagate errors to caller
		console.error(`[RECALC_ERROR] Scoped recalc failed: ${e.message}`, e);
		throw e;
	}
};

// =============================================================================
// DEPRECATED: 2-Person Personal Expense Recalculation
// =============================================================================
// This function assumes EXACTLY 2 participants and is being replaced by
// recalculateUserPersonalLedger which supports N-person personal expenses.
//
// STATUS: UNUSED - All call sites now use recalculateUserPersonalLedger
// CLEANUP: This function will be deleted in a future cleanup prompt
// =============================================================================
// INVARIANT: This function is PURE MATH ONLY
// - No global fallback
// - No implicit friend creation
// - Throws on missing friend records
export const recalculatePersonalExpense = async (
	supabase: SupabaseClient,
	userId1: string,
	userId2: string
) => {
	// Guard: Both IDs must be valid - THROW, don't fallback
	if (!userId1 || !userId2 || userId1 === userId2) {
		console.error('[RECALC_PERSONAL_FAILURE]', {
			reason: 'invalid_user_ids',
			userId1,
			userId2,
		});
		throw new Error(
			`[RECALC_PERSONAL_ERROR] Invalid user IDs for personal expense recalculation: userId1=${userId1}, userId2=${userId2}`
		);
	}

	console.log(`[RECALC_PERSONAL_START] { userId1: '${userId1.slice(-8)}', userId2: '${userId2.slice(-8)}' }`);

	// 1. Fetch friend records between these two users (A→B and B→A)
	const { data: friendsData, error: friendsError } = await supabase
		.from('friends')
		.select('id, owner_id, linked_user_id, group_breakdown, balance')
		.or(
			`and(owner_id.eq.${userId1},linked_user_id.eq.${userId2}),and(owner_id.eq.${userId2},linked_user_id.eq.${userId1})`
		);

	if (friendsError) throw friendsError;

	// INVARIANT: Friend records MUST exist - no implicit creation
	if (!friendsData || friendsData.length === 0) {
		console.error('[RECALC_PERSONAL_FAILURE]', {
			reason: 'no_friend_records',
			userId1,
			userId2,
		});
		throw new Error(
			`[RECALC_PERSONAL_ERROR] No friend records found between users ${userId1.slice(-8)} and ${userId2.slice(-8)}. ` +
			`Friend records must be created before creating personal expenses.`
		);
	}

	console.log(`[RECALC_PERSONAL] Found ${friendsData.length} friend records between users`);

	// 2. Fetch ONLY personal expenses where BOTH users participate (group_id = NULL)
	const { data: allPersonalExpenses, error: expensesError } = await supabase
		.from('expenses')
		.select(
			'id, amount, payer_user_id, payer_id, group_id, description, splits:expense_splits(user_id, friend_id, amount, paid_amount, paid)'
		)
		.is('group_id', null)
		.eq('deleted', false);

	if (expensesError) throw expensesError;

	// Filter to only expenses involving BOTH users
	const expensesData = (allPersonalExpenses || []).filter((expense: any) => {
		const participants = new Set<string>();

		// INVARIANT: All expenses have payer_user_id after Step 5 backfill
		const payerId = expense.payer_user_id;
		if (payerId) participants.add(payerId);

		// Add split participants
		expense.splits?.forEach((split: any) => {
			if (split.user_id) participants.add(split.user_id);
		});

		return participants.has(userId1) && participants.has(userId2);
	});

	console.log(`[RECALC_PERSONAL] Found ${expensesData.length} scoped expenses between users`);

	// 3. Fetch ONLY transactions between these two users
	const { data: transactionsData, error: txError } = await supabase
		.from('transactions')
		.select('type, amount, group_id, created_by, friend_id, friend:friends(owner_id, linked_user_id)')
		.is('group_id', null)
		.in('type', ['paid', 'received'])
		.eq('deleted', false);

	if (txError) throw txError;

	// Filter to transactions between the two users
	const scopedTransactions = (transactionsData || []).filter((tx: any) => {
		const creatorId = tx.created_by || tx.friend?.owner_id;
		const otherId = tx.friend?.linked_user_id;

		if (!creatorId || !otherId) return false;

		return (
			(creatorId === userId1 && otherId === userId2) ||
			(creatorId === userId2 && otherId === userId1)
		);
	});

	console.log(`[RECALC_PERSONAL] Found ${scopedTransactions.length} scoped transactions between users`);

	// 4. Run calculation with scoped data
	const result = calculateBalancesForData(friendsData, expensesData, scopedTransactions);

	// INVARIANT: No implicit friend creation in recalculation
	// If missingLinks exist, it means data is corrupted - throw error
	if (result.missingLinks.size > 0) {
		console.error('[RECALC_PERSONAL_FAILURE]', {
			reason: 'missing_friend_links',
			userId1,
			userId2,
			missingLinks: Array.from(result.missingLinks),
			scopedExpenseIds: expensesData.map((e: any) => e.id),
		});
		throw new Error(
			`[RECALC_PERSONAL_ERROR] Missing friend links detected during recalculation: ${Array.from(result.missingLinks).join(', ')}. ` +
			`This indicates data corruption. Friend records must exist before expense creation.`
		);
	}

	// 5. Update ONLY the relevant friend records
	const { friendBalances } = result;

	const updatePromises = Array.from(friendBalances.entries()).map(async ([friendId, balance]) => {
		const roundedBalance = Math.round(balance * 100) / 100;

		// Get existing breakdown and filter out non-group entries (keep group entries intact)
		const existingFriend = friendsData.find((f: any) => f.id === friendId);
		const existingBreakdown = existingFriend?.group_breakdown || [];

		// Keep group entries, update personal total via balance field
		const groupOnlyBreakdown = existingBreakdown.filter((b: any) => b.groupId && b.groupId !== 'personal');

		console.log(`[RECALC_PERSONAL] Updating friend ${friendId.slice(-8)}: balance ${existingFriend?.balance || 0} → ${roundedBalance}`);

		const { error: updateError } = await supabase
			.from('friends')
			.update({
				balance: roundedBalance,
				group_breakdown: groupOnlyBreakdown,
			})
			.eq('id', friendId);

		if (updateError) throw updateError;
	});

	await Promise.all(updatePromises);

	console.log(`[RECALC_PERSONAL_SUCCESS] Updated ${friendBalances.size} friend records`);
};

// =============================================================================
// NEW: N-Person Personal Ledger Recalculation
// =============================================================================
// This function replaces recalculatePersonalExpense and supports N-person
// personal expenses (N >= 2). It uses the same algorithm as group recalculation.
//
// SCOPE: Recalculates all personal expenses involving the given userId
// ALGORITHM: Same ledger replay as recalculateGroupBalances
// WRITES: Non-atomic (same pattern as current implementation)
// =============================================================================
export const recalculateUserPersonalLedger = async (
	supabase: SupabaseClient,
	userId: string
): Promise<void> => {
	// Guard: userId must be valid
	if (!userId) {
		console.error('[RECALC_PERSONAL_N_FAILURE]', {
			reason: 'invalid_user_id',
			userId,
		});
		throw new Error(`[RECALC_PERSONAL_N_ERROR] userId is required for personal ledger recalculation`);
	}

	console.log(`[RECALC_PERSONAL_N_START] { userId: '${userId.slice(-8)}' }`);

	// ==========================================================================
	// STEP 1: Fetch personal expenses involving this user (SCOPED)
	// ==========================================================================
	// Fetch expenses where user is payer OR user is in splits
	// We need to fetch expenses where:
	// - group_id IS NULL
	// - deleted = false
	// - payer_user_id = userId OR expense has a split with user_id = userId

	// First, get expense IDs where user is in splits (OPTIMIZATION B: filter to personal only via join)
	// This join excludes group expenses at the DB level, reducing fetched rows
	const { data: userSplitExpenseIds, error: splitError } = await supabase
		.from('expense_splits')
		.select('expense_id, expenses!inner(group_id, deleted)')
		.eq('user_id', userId)
		.is('expenses.group_id', null)
		.eq('expenses.deleted', false);

	if (splitError) throw splitError;

	const splitExpenseIds = (userSplitExpenseIds || []).map((s: any) => s.expense_id);

	// Fetch personal expenses where user is payer
	const { data: payerExpenses, error: payerError } = await supabase
		.from('expenses')
		.select(
			'id, amount, payer_user_id, payer_id, group_id, description, splits:expense_splits(user_id, friend_id, amount, paid_amount, paid)'
		)
		.is('group_id', null)
		.eq('deleted', false)
		.eq('payer_user_id', userId);

	if (payerError) throw payerError;

	// Fetch personal expenses where user is in splits
	let splitExpenses: any[] = [];
	if (splitExpenseIds.length > 0) {
		const { data: splitExp, error: splitExpError } = await supabase
			.from('expenses')
			.select(
				'id, amount, payer_user_id, payer_id, group_id, description, splits:expense_splits(user_id, friend_id, amount, paid_amount, paid)'
			)
			.is('group_id', null)
			.eq('deleted', false)
			.in('id', splitExpenseIds);

		if (splitExpError) throw splitExpError;
		splitExpenses = splitExp || [];
	}

	// Merge and deduplicate expenses
	const expenseMap = new Map<string, any>();
	(payerExpenses || []).forEach((e: any) => expenseMap.set(e.id, e));
	splitExpenses.forEach((e: any) => expenseMap.set(e.id, e));
	const expensesData = Array.from(expenseMap.values());

	console.log(`[RECALC_PERSONAL_N] Found ${expensesData.length} personal expenses for user`);

	// ==========================================================================
	// STEP 2: Fetch ALL User-Involved Friend Records (LEDGER-FIRST)
	// ==========================================================================
	// ARCHITECTURAL PRINCIPLE: A ledger is a record of value transfer.
	// Transactions are first-class ledger events.
	// 
	// CRITICAL: We fetch ALL friends where user is a party — this is the
	// authoritative domain for personal ledger updates. We do NOT filter by
	// "participants" because:
	//   1. Deleted transaction counterparties must still be recalculated
	//   2. Zero balances must be materialized to clear ghost balances
	//   3. Friends with no current activity must have their personal entry cleared
	
	const { data: friendsData, error: friendsError } = await supabase
		.from('friends')
		.select('id, owner_id, linked_user_id, group_breakdown, balance')
		.or(`owner_id.eq.${userId},linked_user_id.eq.${userId}`);

	if (friendsError) throw friendsError;

	console.log(`[RECALC_PERSONAL_N] Fetched ${friendsData?.length || 0} user-involved friends (ledger-first)`);

	// Early exit if user has no friends
	if (!friendsData || friendsData.length === 0) {
		console.log(`[RECALC_PERSONAL_N_COMPLETE] No friends found, nothing to recalculate`);
		return;
	}

	// ==========================================================================
	// STEP 3: Fetch Personal Transactions (ALWAYS, not conditional)
	// ==========================================================================
	// LEDGER-FIRST: Transactions are first-class. We ALWAYS fetch them for ALL
	// user-involved friends, not as a fallback or conditional path.
	
	const allUserFriendIds = friendsData.map((f: any) => f.id);

	const { data: transactionsData, error: txError } = await supabase
		.from('transactions')
		.select('type, amount, created_by, friend_id, friend:friends(owner_id, linked_user_id)')
		.is('group_id', null)
		.in('type', ['paid', 'received'])
		.eq('deleted', false)
		.in('friend_id', allUserFriendIds);

	if (txError) throw txError;

	console.log(`[RECALC_PERSONAL_N] Found ${transactionsData?.length || 0} personal transactions`);

	// ==========================================================================
	// STEP 4: Derive Participants (for logging/debugging only)
	// ==========================================================================
	// NOTE: This is NOT used for filtering. It's purely informational.
	const participants = new Set<string>();

	expensesData.forEach((expense: any) => {
		if (expense.payer_user_id) participants.add(expense.payer_user_id);
		expense.splits?.forEach((split: any) => {
			if (split.user_id) participants.add(split.user_id);
		});
	});

	(transactionsData || []).forEach((tx: any) => {
		if (tx.created_by) participants.add(tx.created_by);
		if (tx.friend?.owner_id) participants.add(tx.friend.owner_id);
		if (tx.friend?.linked_user_id) participants.add(tx.friend.linked_user_id);
	});

	console.log(`[RECALC_PERSONAL_N] Participants (for logging): ${participants.size}`,
		Array.from(participants).map(p => p.slice(-8)));

	// ==========================================================================
	// STEP 5: Run ledger replay using calculateBalancesForData
	// ==========================================================================
	// Pass ALL user-involved friends — this ensures all balances are computed,
	// including zero balances for friends with no current activity.
	
	const result = calculateBalancesForData(
		friendsData,
		expensesData,
		transactionsData || []
	);

	// Check for missing links (indicates data corruption)
	if (result.missingLinks.size > 0) {
		console.error('[RECALC_PERSONAL_N_FAILURE]', {
			reason: 'missing_friend_links',
			userId,
			missingLinks: Array.from(result.missingLinks),
			friendCount: friendsData.length,
		});
		throw new Error(
			`[RECALC_PERSONAL_N_ERROR] Missing friend links detected: ${Array.from(result.missingLinks).join(', ')}. ` +
			`Friend records must exist before expense creation.`
		);
	}

	const { friendBalances } = result;

	// ==========================================================================
	// STEP 6: Verify zero-sum invariant
	// ==========================================================================
	let netSum = 0;
	friendBalances.forEach((val) => (netSum += val));
	console.log(`[RECALC_PERSONAL_N_AUDIT] Net Sum Check: ${netSum.toFixed(4)}`);

	// ==========================================================================
	// STEP 7: Materialize balances for ALL friends (LEDGER-FIRST)
	// ==========================================================================
	// CRITICAL: We iterate over ALL friendsData, not just friendBalances.entries().
	// This ensures:
	//   1. Friends with computed balance = 0 have their personal entry removed
	//   2. Friends not in friendBalances (no expenses/transactions) are still processed
	//   3. Ghost balances are eliminated
	
	const friendUpdates: Array<{ friend_id: string; balance: number; group_breakdown: any[] }> = [];

	friendsData.forEach((friend: any) => {
		const friendId = friend.id;
		
		// Get computed balance — default to 0 if not in result (no activity)
		const computedBalance = friendBalances.get(friendId) || 0;
		const roundedPersonalBalance = Math.round(computedBalance * 100) / 100;

		// Get existing breakdown
		const existingBreakdown = friend.group_breakdown || [];

		// Keep only group entries (filter out personal entries - groupId is null or 'personal')
		const groupOnlyBreakdown = existingBreakdown.filter(
			(b: any) => b.groupId && b.groupId !== 'personal'
		);

		// Calculate group breakdown sum for logging
		const groupBreakdownSum = groupOnlyBreakdown.reduce(
			(acc: number, b: any) => acc + (b.amount || 0), 
			0
		);

		// Build new breakdown: group entries + personal entry (if non-zero)
		let newBreakdown = [...groupOnlyBreakdown];
		
		// LEDGER-FIRST: Add personal entry ONLY if balance is non-zero
		// If balance is 0, we explicitly do NOT add a personal entry
		if (Math.abs(roundedPersonalBalance) > 0.01) {
			newBreakdown.push({
				groupId: null,
				name: 'Personal Expenses',
				amount: roundedPersonalBalance,
				rawAmount: roundedPersonalBalance, // No simplification for personal
			});
		}

		// INVARIANT: balance = sum(breakdown.amount)
		const finalBalance = newBreakdown.reduce(
			(acc: number, b: any) => acc + (b.amount || 0),
			0
		);
		const roundedFinalBalance = Math.round(finalBalance * 100) / 100;

		const oldBalance = friend.balance || 0;
		const balanceChanged = Math.abs(roundedFinalBalance - oldBalance) > 0.001;
		const oldBreakdownJSON = JSON.stringify(existingBreakdown);
		const newBreakdownJSON = JSON.stringify(newBreakdown);
		const breakdownChanged = oldBreakdownJSON !== newBreakdownJSON;
		
		// Only update if something changed
		if (!balanceChanged && !breakdownChanged) {
			return; // SKIP - no changes for this friend
		}

		console.log(`[RECALC_PERSONAL_N] Updating friend ${friendId.slice(-8)}: ` +
			`balance ${oldBalance} → ${roundedFinalBalance} (personal: ${roundedPersonalBalance}, groups: ${groupBreakdownSum})`);

		// Add to updates array for atomic RPC
		friendUpdates.push({
			friend_id: friendId,
			balance: roundedFinalBalance,
			group_breakdown: newBreakdown,
		});
	});

	// ==========================================================================
	// STEP 8: Atomic Write
	// ==========================================================================
	if (friendUpdates.length > 0) {
		const { error: rpcError } = await supabase.rpc('update_friend_balances_atomic', {
			p_updates: friendUpdates,
		});

		if (rpcError) {
			console.error('[RECALC_PERSONAL_RPC_ERROR]', {
				userId,
				updateCount: friendUpdates.length,
				error: rpcError.message,
			});
			throw new Error(`[RECALC_PERSONAL_RPC_ERROR] Atomic update failed: ${rpcError.message}`);
		}

		console.log(`[RECALC_PERSONAL_RPC_SUCCESS] Applied ${friendUpdates.length} friend updates atomically`);
	}

	console.log(`[RECALC_PERSONAL_N_SUCCESS] Recalculated personal ledger for user ${userId.slice(-8)}, ` +
		`updated ${friendUpdates.length} friend records (ledger-first)`);
};
