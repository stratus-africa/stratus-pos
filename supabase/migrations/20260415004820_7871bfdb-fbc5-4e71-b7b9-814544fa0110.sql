-- The ALL policy already covers DELETE for super admins, but we need to also allow delete on package_features
-- Add explicit delete for package_features by super admins (already covered by ALL policy)
-- No additional migration needed - the ALL policy covers all operations
SELECT 1;