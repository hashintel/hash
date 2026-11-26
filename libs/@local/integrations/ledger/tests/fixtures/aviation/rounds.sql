-- The capture files of two runs of `definition/examples/aviation.yaml` in a row, starting from an
-- empty web:
--
-- 1. inserts three airfields and three aircraft, each with its link to its home base
-- 2. renames an airfield and updates the mass of an aircraft, deletes an aircraft and the airfield
--    it is based at, and inserts an airfield and an aircraft based there
--
-- Written to Parquet by the `generate` example of the ledger crate.

COPY (
    SELECT * FROM (
        VALUES
        ('insert', 'ESSA', 'Arlanda'),
        ('insert', 'ESSB', 'Bromma'),
        ('insert', 'ESGG', 'Landvetter')
    ) AS t (_change, "ICAO", "FIELD_NAME")
) TO 'round-1-airfields.parquet' (FORMAT parquet);

COPY (
    SELECT * FROM (
        VALUES
        ('insert', 'SE-AAA', 'DC-3', '1946-04-02', '8030', 'KG', 'ESSA'),
        ('insert', 'N100', 'L-1049', '1951-10-13', '69000', 'LB', 'ESSB'),
        ('insert', 'G-OLD', 'Ju 52', '1932-10-13', '6500', 'KG', 'ESGG')
    ) AS t (_change, "TAIL", "MODEL", "FIRST_FLIGHT", "EMPTY_MASS", "MASS_UNIT", "HOME_BASE")
) TO 'round-1-aircraft.parquet' (FORMAT parquet);

COPY (
    SELECT * FROM (
        VALUES
        ('update', 'ESSB', 'Stockholm Bromma'),
        ('delete', 'ESGG', 'Landvetter'),
        ('insert', 'ESOW', 'Vasteras')
    ) AS t (_change, "ICAO", "FIELD_NAME")
) TO 'round-2-airfields.parquet' (FORMAT parquet);

COPY (
    SELECT * FROM (
        VALUES
        ('update', 'N100', 'L-1049', '1951-10-13', '70000', 'LB', 'ESSB'),
        ('delete', 'G-OLD', 'Ju 52', '1932-10-13', '6500', 'KG', 'ESGG'),
        ('insert', 'SE-BBB', 'Saab 340', '1983-01-25', '8140', 'KG', 'ESOW')
    ) AS t (_change, "TAIL", "MODEL", "FIRST_FLIGHT", "EMPTY_MASS", "MASS_UNIT", "HOME_BASE")
) TO 'round-2-aircraft.parquet' (FORMAT parquet);
