-- V016 source purge retained an empty draft identity, which prevented an
-- identical workbook from being staged again. These rows have no source,
-- review plan, receipt or committed operation links and are safe to remove.
DELETE FROM import_batches
WHERE status = 'DRAFT'
  AND source IS NULL;
