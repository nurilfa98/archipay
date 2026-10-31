// Aturan "siapa boleh mengelola akun siapa" di halaman Pengguna.
// Urutannya: superadmin → Owner → karyawan (Finance & Karyawan).
//
// - Pemegang user:manage-owner (superadmin) mengelola semua akun, termasuk Owner.
// - Pemegang user:manage saja (Owner) hanya mengelola akun tanpa role Owner,
//   dan tidak bisa memberi role Owner.
// - Akun superadmin tidak bisa dikelola siapa pun lewat aplikasi.
//
// Dipakai halaman (menampilkan form atau tampilan baca saja) dan Server Action
// (pengaman sebenarnya). File ini tidak memakai `server-only` karena hanya
// berisi aturan, tanpa akses database.

import { can } from "@/lib/auth/permissions";
import { ASSIGNABLE_ROLES, type AssignableRole, type Role } from "@/lib/auth/roles";

type Actor = { roles: readonly Role[] };

// Role yang boleh diberikan/dicabut oleh actor.
export function assignableRolesFor(actor: Actor): AssignableRole[] {
  if (!can(actor, "user:manage")) return [];
  return can(actor, "user:manage-owner")
    ? [...ASSIGNABLE_ROLES]
    : ASSIGNABLE_ROLES.filter((role) => role !== "OWNER");
}

// Boleh mengedit data, role, status, dan me-reset password akun target?
export function canManageUser(actor: Actor, target: { roles: readonly Role[] }) {
  if (!can(actor, "user:manage") || target.roles.includes("SUPERADMIN")) return false;
  return can(actor, "user:manage-owner") || !target.roles.includes("OWNER");
}
