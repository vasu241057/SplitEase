-- Change default to hex to avoid URL unsafe characters (+, /)
ALTER TABLE public.profiles 
ALTER COLUMN invite_code 
SET DEFAULT encode(gen_random_bytes(6), 'hex');

-- Regenerate codes for existing users to ensure they are hex
UPDATE public.profiles 
SET invite_code = encode(gen_random_bytes(6), 'hex');
