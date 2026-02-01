-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Friends Table (Users)
create table friends (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text,
  avatar text,
  balance numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Groups Table
create table groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text check (type in ('trip', 'home', 'couple', 'other')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Group Members (Join Table)
create table group_members (
  group_id uuid references groups(id) on delete cascade,
  friend_id uuid references friends(id) on delete cascade,
  primary key (group_id, friend_id)
);

-- Expenses Table
create table expenses (
  id uuid primary key default uuid_generate_v4(),
  description text not null,
  amount numeric not null,
  date timestamp with time zone default timezone('utc'::text, now()) not null,
  payer_id uuid references friends(id), -- Nullable if payer is "currentUser" (handled by app logic or separate user table)
  group_id uuid references groups(id) on delete set null,
  deleted boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Expense Splits
create table expense_splits (
  id uuid primary key default uuid_generate_v4(),
  expense_id uuid references expenses(id) on delete cascade,
  friend_id uuid references friends(id), -- Nullable if split is for "currentUser"
  amount numeric not null,
  paid_amount numeric default 0,
  paid boolean default false
);

-- Transactions (Settle Up)
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  friend_id uuid references friends(id),
  amount numeric not null,
  type text check (type in ('paid', 'received')),
  date timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies (Basic - Allow Service Role full access, Anon read-only if needed, but we are using Service Role in Worker for now)
alter table friends enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table transactions enable row level security;

-- For now, allow all access to service_role (default)
-- If we want to allow public read for demo:
create policy "Public read access" on friends for select using (true);
create policy "Public read access" on groups for select using (true);
create policy "Public read access" on expenses for select using (true);
