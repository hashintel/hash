-- Make shortname lookups case-insensitive
-- This fixes a critical bug where @Timd and @timd could be two different users

-- Drop the existing case-sensitive unique index
DROP INDEX IF EXISTS idx_web_shortname;

-- Create a case-insensitive unique index using LOWER()
-- This ensures that 'Timd', 'timd', and 'TIMD' all conflict with each other
CREATE UNIQUE INDEX idx_web_shortname ON web (LOWER(shortname)) WHERE shortname IS NOT NULL;
