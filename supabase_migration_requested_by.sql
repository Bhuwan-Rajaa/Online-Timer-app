-- Migration: Add requested_by column to Friendships table
-- This column tracks WHO initiated the friend request, so recipients can
-- see incoming requests and senders can see outgoing ones separately.

ALTER TABLE public."Friendships"
  ADD COLUMN requested_by uuid REFERENCES public."Profiles"(id) ON DELETE CASCADE;

-- Backfill existing rows: for any pending requests, we can't know who sent it,
-- so set requested_by = user_id_1 as a safe default.
-- Already-ACCEPTED rows don't matter for the pending request flow.
UPDATE public."Friendships"
  SET requested_by = user_id_1
  WHERE requested_by IS NULL;

-- Make it NOT NULL going forward
ALTER TABLE public."Friendships"
  ALTER COLUMN requested_by SET NOT NULL;
