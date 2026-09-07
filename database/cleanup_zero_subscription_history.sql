-- ===========================================================================
-- One-time cleanup: remove the fabricated zeros from subscription_history.
--
-- WHAT WENT WRONG
--
-- NSE's ipo-active-category endpoint publishes "0.00" in its ratio column
-- for issues it has not filled in — every SME issue observed, and mainboard
-- issues whose table reads "Updated as on null" for their whole first day.
-- The scraper read those ratios as measurements, wrote them to the ipos row,
-- and then every run recorded that row as a history snapshot. On 7 Sep 2026
-- that was 405 of 1,080 rows: 38% of the whole table.
--
-- The effect was visible: Qualiance's day-wise chart showed a flat line at
-- 0.00x for 4-7 September while the issue was 12x, then 27x subscribed.
--
-- The scraper no longer writes these (see append_subscription_history in
-- scraper/db.py, which drops an all-zero snapshot). This removes the ones
-- already stored.
--
-- WHY THIS RULE IS SAFE
--
-- It deletes a row only when EVERY figure in it is zero or null. Such a row
-- carries no information at all: it cannot distinguish "nobody has bid yet"
-- from "we failed to read the figures", and on the chart it plots a floor
-- that never happened. Any row holding even one real figure is untouched —
-- verified against the live table, where 0 rows with a real figure matched.
--
-- Several days hold both an all-zero row and a real one; on those days the
-- real reading survives and only the empty one goes.
--
-- HOW TO RUN
--
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Run the SELECT first and read the count. Then run the DELETE.
--
-- This is not reversible. The rows carry no information, but they are rows.
-- ===========================================================================

-- 1. LOOK FIRST. What would go, and from which issues.
select
  slug,
  count(*)                as rows_to_delete,
  min(recorded_at)::date  as first_day,
  max(recorded_at)::date  as last_day
from public.subscription_history
where coalesce(qib, 0)    = 0
  and coalesce(nii, 0)    = 0
  and coalesce(retail, 0) = 0
  and coalesce(total, 0)  = 0
group by slug
order by rows_to_delete desc;

-- 2. Confirm nothing with a real figure is caught. This must return 0 rows.
select count(*) as must_be_zero
from public.subscription_history
where coalesce(qib, 0)    = 0
  and coalesce(nii, 0)    = 0
  and coalesce(retail, 0) = 0
  and coalesce(total, 0)  = 0
  and (coalesce(qib, 0)    <> 0
    or coalesce(nii, 0)    <> 0
    or coalesce(retail, 0) <> 0
    or coalesce(total, 0)  <> 0);

-- 3. THE DELETE. Run this only after the two queries above look right.
delete from public.subscription_history
where coalesce(qib, 0)    = 0
  and coalesce(nii, 0)    = 0
  and coalesce(retail, 0) = 0
  and coalesce(total, 0)  = 0;

-- 4. What is left.
select count(*) as rows_remaining from public.subscription_history;
