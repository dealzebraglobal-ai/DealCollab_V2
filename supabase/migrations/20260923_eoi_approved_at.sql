-- Adds a real, stored approval timestamp for EOIs. Previously the "disclosed on" time shown on
-- the deal-log identity card was fabricated at render time (new Date()) rather than reflecting
-- when the EOI was actually approved — every page reload showed a different, wrong timestamp.
ALTER TABLE public.eois ADD COLUMN IF NOT EXISTS approved_at timestamptz;
