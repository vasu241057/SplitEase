-- Add owner_id to friends table to link friends to a specific user
ALTER TABLE public.friends 
ADD COLUMN owner_id uuid REFERENCES auth.users(id);
