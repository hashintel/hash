-- Trigger to normalize shortnames to lowercase and trimmed on insert/update
CREATE FUNCTION normalize_web_shortname()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.shortname IS NOT NULL THEN
        NEW.shortname := lower(trim(NEW.shortname));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER web_normalize_shortname_trigger
BEFORE INSERT OR UPDATE OF shortname ON web
FOR EACH ROW EXECUTE FUNCTION normalize_web_shortname();

-- Normalize existing shortnames
UPDATE web SET shortname = lower(trim(shortname)) WHERE shortname IS NOT NULL AND shortname <> lower(trim(shortname));
