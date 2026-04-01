-- Normalize existing shortnames to lowercase
UPDATE web SET shortname = LOWER(TRIM(shortname)) WHERE shortname IS NOT NULL AND shortname <> LOWER(TRIM(shortname));

-- Drop the existing case-sensitive unique index
DROP INDEX IF EXISTS idx_web_shortname;

-- Case-insensitive unique index for shortnames
CREATE UNIQUE INDEX idx_web_shortname ON web (LOWER(shortname)) WHERE shortname IS NOT NULL;

-- Trigger to normalize shortnames to lowercase on insert/update
CREATE FUNCTION normalize_web_shortname()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.shortname IS NOT NULL THEN
        NEW.shortname := LOWER(TRIM(NEW.shortname));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER web_normalize_shortname_trigger
BEFORE INSERT OR UPDATE OF shortname ON web
FOR EACH ROW EXECUTE FUNCTION normalize_web_shortname();
