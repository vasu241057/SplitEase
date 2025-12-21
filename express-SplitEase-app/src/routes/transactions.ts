import express from 'express';
import { createSupabaseClient } from '../supabase';
import { recalculateBalances } from '../utils/recalculate';

import { authMiddleware } from '../middleware/auth';

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const supabase = createSupabaseClient();
  const userId = (req as any).user.id;

  // Get transactions where user is involved:
  // 1. User created the transaction (created_by)
  // 2. User owns the friend record (friend.owner_id)
  // 3. User is the linked user (friend.linked_user_id)
  // 4. Transaction is in a group user is a member of
  
  const { data, error } = await supabase
    .from('transactions')
    .select('*, friend:friends(owner_id, linked_user_id)');
  
  if (error) return res.status(500).json({ error: error.message });

  // Get user's group memberships for group transaction filtering
  const { data: userGroups } = await supabase
    .from('group_members')
    .select('group_id, friends!inner(linked_user_id)')
    .eq('friends.linked_user_id', userId);
  
  const userGroupIds = new Set((userGroups || []).map((g: any) => g.group_id));

  // Filter transactions to only those user should see
  const filteredData = (data || []).filter((t: any) => {
    // 1. User created it
    if (t.created_by === userId) return true;
    // 2. User owns the friend record
    if (t.friend?.owner_id === userId) return true;
    // 3. User is the linked user
    if (t.friend?.linked_user_id === userId) return true;
    // 4. Transaction is in a group user belongs to
    if (t.group_id && userGroupIds.has(t.group_id)) return true;
    
    return false;
  });
  
  const formatted = filteredData.map((t: any) => {
    // Determine fromId and toId based on created_by (who initiated the transaction)
    let fromId = '';
    let toId = '';
    
    // The person who created the transaction is one party
    const creatorId = t.created_by;
    // The other party is the friend (either their linked_user_id or friend_id)
    const otherPartyId = t.friend?.linked_user_id || t.friend_id;
    
    // Check if deleted
    const isDeleted = t.deleted || false;
    
    if (t.type === 'paid') {
       // "Creator paid Friend": From Creator -> To Friend
       fromId = creatorId || t.friend?.owner_id; // Fallback for old data
       toId = otherPartyId;
    } else {
       // "Friend paid Creator": From Friend -> To Creator
       fromId = otherPartyId;
       toId = creatorId || t.friend?.owner_id; // Fallback for old data
    }

    return {
       ...t,
       friendId: t.friend_id,
       groupId: t.group_id,
       fromId,
       toId,
       deleted: isDeleted,
       description: "Settle Up"
    };
  });

  res.json(formatted);
});

// GET Single Transaction
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const supabase = createSupabaseClient();

  const { data: t, error } = await supabase
    .from('transactions')
    .select('*, friend:friends(owner_id, linked_user_id)')
    .eq('id', id)
    .single();

  if (error || !t) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  // Determine fromId and toId (logic from list)
  let fromId = '';
  let toId = '';
  
  const ownerId = t.friend?.owner_id;
  const linkedId = t.friend?.linked_user_id;
  
  if (t.type === 'paid') {
      fromId = ownerId;
      toId = linkedId || t.friend_id;
  } else {
      fromId = linkedId || t.friend_id;
      toId = ownerId;
  }

  const formatted = {
      ...t,
      friendId: t.friend_id,
      groupId: t.group_id,
      fromId,
      toId,
      deleted: t.deleted || false,
      description: "Settle Up"
  };

  res.json(formatted);
});

// Helper to notify participants
const notifyTransactionParticipants = async (
  req: any,
  transactionId: string,
  action: string,
  overrideBody?: string
) => {
  const envKey = process.env as any;
  const env = {
      SUPABASE_URL: envKey.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: envKey.SUPABASE_SERVICE_ROLE_KEY,
      VAPID_PUBLIC_KEY: envKey.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: envKey.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: envKey.VAPID_SUBJECT
  };

  if (!env.VAPID_PUBLIC_KEY) return;

  try {
    const supabase = createSupabaseClient();
    const { data: transaction } = await supabase
      .from('transactions')
      .select('*, friend:friends(*)')
      .eq('id', transactionId)
      .single();

    if (!transaction) return;

    let recipientIds: string[] = [];

    // Participants: Owner (payer/payee) and Linked User (Friend)
    // We already have from_id and to_id logic in the router, but let's re-derive for robustness or just grab involved parties.
    // Actually, just grab linked_user_id and owner_id from the friend relation.
    
    // friend.owner_id is one party
    // friend.linked_user_id is the other (if it creates a valid user)
    
    if (transaction.friend?.owner_id) recipientIds.push(transaction.friend.owner_id);
    if (transaction.friend?.linked_user_id) recipientIds.push(transaction.friend.linked_user_id);
    
    // Filter sender
    const currentUserId = req.user.id;
    recipientIds = recipientIds.filter(id => id !== currentUserId);
    recipientIds = [...new Set(recipientIds)];

    if (recipientIds.length === 0) return;

    // Get Sender Name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', currentUserId)
      .single();
    
    const senderName = profile?.full_name || 'Someone';
    
    // Get group context if this is a group transaction
    let context = '';
    if (transaction.group_id) {
      const { data: group } = await supabase
        .from('groups')
        .select('name')
        .eq('id', transaction.group_id)
        .single();
      context = group?.name || '';
    }
    
    // Redesigned notification templates
    let title = '';
    let body = overrideBody;
    
    if (action.includes('recorded') || action.includes('created') || action.includes('settled')) {
      title = `₹${transaction.amount} settled 💰`;
      body = body || (context 
        ? `${senderName} paid in ${context}`
        : `${senderName} paid you`);
    } else if (action.includes('deleted')) {
      title = `Payment deleted`;
      body = body || `${senderName} removed a ₹${transaction.amount} payment`;
    } else if (action.includes('restored')) {
      title = `Payment restored`;
      body = body || `${senderName} restored a ₹${transaction.amount} payment`;
    } else {
      // Fallback
      title = `Payment activity`;
      body = body || `${senderName} • ₹${transaction.amount}`;
    }
    
    // Fix: Deep link must match Frontend Route /payments/:id
    const url = `/payments/${transactionId}`;

    console.log(`[Transactions] Notifying participants. Sender: ${senderName}, Action: ${action}`);
    console.log(`[Transactions] Recipients: ${JSON.stringify(recipientIds)}`);
    console.log(`[Transactions] Payload: Title="${title}", Body="${body}", URL="${url}"`);

    const { sendPushNotification } = await import('../utils/push');
    await sendPushNotification(env, recipientIds, title, body, url);

  } catch (error) {
    console.error('Failed to send transaction notification:', error);
  }
};

router.post('/settle-up', async (req, res) => {
  const { friendId, amount, type, groupId } = req.body;
  const supabase = createSupabaseClient();
  const userId = (req as any).user?.id;

  // ═══════════════════════════════════════════════════════════════════════════
  // [FRIEND_BALANCE_DIAG] SETTLE-UP TRIGGER
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('╔═══════════════════════════════════════════════════════════════════');
  console.log('║ [FRIEND_BALANCE_DIAG] SETTLE-UP INITIATED');
  console.log('╠═══════════════════════════════════════════════════════════════════');
  console.log('║ Trigger Type:', groupId ? 'GROUP SETTLE-UP' : 'NON-GROUP (PERSONAL) SETTLE-UP');
  console.log('║ User ID (who triggered):', userId);
  console.log('║ Friend ID (target):', friendId);
  console.log('║ Amount:', amount);
  console.log('║ Type:', type, type === 'paid' ? '(User paid Friend)' : '(Friend paid User)');
  console.log('║ Group ID:', groupId || 'NULL (non-group)');
  console.log('╠───────────────────────────────────────────────────────────────────');

  // Fetch friend balance BEFORE transaction
  const { data: friendBefore } = await supabase
    .from('friends')
    .select('id, name, balance, owner_id, linked_user_id')
    .eq('id', friendId)
    .single();
  
  console.log('║ [BEFORE] Friend Record:', friendBefore ? {
    id: friendBefore.id,
    name: friendBefore.name,
    balance: friendBefore.balance,
    owner_id: friendBefore.owner_id,
    linked_user_id: friendBefore.linked_user_id
  } : 'NOT FOUND');

  const { data, error } = await supabase
    .from('transactions')
    .insert([{
      friend_id: friendId,
      amount,
      type, // 'paid' or 'received'
      group_id: groupId || null,
      deleted: false,
      date: new Date().toISOString(),
      created_by: userId // Store who created the transaction for correct fromId/toId derivation
    }])
    .select('*, friend:friends(linked_user_id)')
    .single();

  if (error) {
    console.log('║ [ERROR] Transaction insert failed:', error.message);
    console.log('╚═══════════════════════════════════════════════════════════════════');
    return res.status(500).json({ error: error.message });
  }

  console.log('║ Transaction Created:', { id: data.id, friend_id: data.friend_id, created_by: data.created_by });
  console.log('╠───────────────────────────────────────────────────────────────────');
  console.log('║ [CALLING] recalculateBalances()...');

  await recalculateBalances(supabase);

  // Fetch friend balance AFTER recalculation
  const { data: friendAfter } = await supabase
    .from('friends')
    .select('id, name, balance, owner_id, linked_user_id')
    .eq('id', friendId)
    .single();
  
  console.log('║ [AFTER] Friend Record:', friendAfter ? {
    id: friendAfter.id,
    name: friendAfter.name,
    balance: friendAfter.balance,
    owner_id: friendAfter.owner_id,
    linked_user_id: friendAfter.linked_user_id
  } : 'NOT FOUND');

  const balanceDelta = (friendAfter?.balance || 0) - (friendBefore?.balance || 0);
  console.log('║ Balance Delta:', balanceDelta);
  console.log('║ Expected Delta:', type === 'paid' ? `+${amount}` : `-${amount}`);
  console.log('║ Delta Match?', Math.abs(balanceDelta - (type === 'paid' ? amount : -amount)) < 0.01 ? '✓ YES' : '⚠️ NO - INVESTIGATE!');
  console.log('╚═══════════════════════════════════════════════════════════════════');

  // Format return - use userId (created_by) not owner_id
  let fromId = '';
  let toId = '';
  const linkedId = data.friend.linked_user_id;
  const otherPartyId = linkedId || data.friend_id;
  
  if (type === 'paid') {
     // Creator paid the friend
     fromId = userId;
     toId = otherPartyId;
  } else {
     // Friend paid the creator
     fromId = otherPartyId;
     toId = userId;
  }

  const formatted = {
    ...data,
    friendId: data.friend_id,
    groupId: data.group_id,
    fromId,
    toId,
    description: "Settle Up",
    deleted: false
  };

  // System Comment
  await supabase.from('comments').insert({
    entity_type: 'payment',
    entity_id: data.id,
    user_id: (req as any).user.id,
    content: 'settled up',
    is_system: true
  });

  // Notify
  await notifyTransactionParticipants(req, data.id, 'settled up');

  res.status(201).json(formatted);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('transactions')
    .update({ deleted: true })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  await recalculateBalances(supabase);

  // System Comment
  await supabase.from('comments').insert({
    entity_type: 'payment',
    entity_id: id,
    user_id: (req as any).user.id,
    content: 'deleted this payment',
    is_system: true
  });

  // Notify
  await notifyTransactionParticipants(req, id, 'deleted a payment');

  res.json({ message: "Transaction deleted successfully" });
});

router.post('/:id/restore', async (req, res) => {
  const { id } = req.params;
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('transactions')
    .update({ deleted: false })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  await recalculateBalances(supabase);

  const { data } = await supabase.from('transactions').select('*, friend:friends(owner_id, linked_user_id)').eq('id', id).single();
  
  // Format return
  let fromId = '';
  let toId = '';
  const ownerId = data?.friend?.owner_id;
  const linkedId = data?.friend?.linked_user_id;
  
  if (data.type === 'paid') {
     fromId = ownerId;
     toId = linkedId || data.friend_id;
  } else {
     fromId = linkedId || data.friend_id;
     toId = ownerId;
  }

  const formatted = {
    ...data,
    friendId: data.friend_id,
    groupId: data.group_id,
    fromId,
    toId,
    description: "Settle Up"
  };

  // System Comment
  await supabase.from('comments').insert({
    entity_type: 'payment',
    entity_id: id,
    user_id: (req as any).user.id,
    content: 'restored this payment',
    is_system: true
  });

  // Notify
  await notifyTransactionParticipants(req, id, 'restored a payment');

  res.json(formatted);
});

export default router;
