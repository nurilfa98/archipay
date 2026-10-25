-- Draf pertanggungjawaban kini dibuat otomatis saat karyawan mengonfirmasi
-- terima dana. Uang muka yang SUDAH dikonfirmasi sebelum perubahan ini
-- dibuatkan drafnya di sini.
INSERT INTO "settlements" ("id", "advance_id")
SELECT gen_random_uuid()::varchar, "id"
FROM "advance_requests"
WHERE "status" = 'ACKNOWLEDGED'
ON CONFLICT ("advance_id") DO NOTHING;
