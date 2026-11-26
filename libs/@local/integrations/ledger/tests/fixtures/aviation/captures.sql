-- The capture files of one run of `definition/examples/aviation.yaml`: an insert, an update and a
-- delete of an aircraft, and an insert and an update of an airfield.
--
-- cargo run --package hash-integrations-ledger --example generate -- libs/@local/integrations/ledger/tests/fixtures/aviation/captures.sql

COPY (
  SELECT * FROM (VALUES
    ('insert', 'SE-XXX', 'DC-3', '1946-04-02', '8030', 'KG', 'ESSA'),
    ('update', 'N100', 'L-1049', '1951-10-13', '69000', 'LB', 'ESSB'),
    ('delete', 'G-OLD', 'Ju 52', '1932-10-13', '6500', 'KG', 'ESSA')
  ) AS t(_change, TAIL, MODEL, FIRST_FLIGHT, EMPTY_MASS, MASS_UNIT, HOME_BASE)
) TO 'aircraft.parquet' (FORMAT parquet);

COPY (
  SELECT * FROM (VALUES
    ('insert', 'ESSA', 'Arlanda'),
    ('update', 'ESSB', 'Bromma')
  ) AS t(_change, ICAO, FIELD_NAME)
) TO 'airfields.parquet' (FORMAT parquet);
