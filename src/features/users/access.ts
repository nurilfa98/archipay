// Aturan "siapa boleh mengelola akun siapa" di halaman Pengguna.
// Urutannya: superadmin → Owner → karyawan (Finance, Admin HR & Karyawan).
//
// - Pemegang user:manage-owner (superadmin) mengelola semua akun, termasuk Owner.
// - Pemegang user:manage saja (Owner) hanya mengelola akun tanpa role Owner,
//   dan tidak bisa memberi role Owner.
// - Pemegang user:manage-employee saja (Admin HR) hanya mengelola akun yang
//   role-nya Karyawan SAJA, hanya bisa memberi role Karyawan, dan tidak bisa
//   mengubah rekening bank. Ini menutup celah: Admin HR mengganti email akun
//   Finance lalu me-reset password-nya (ambil alih akun pemegang uang), atau
//   mengganti rekening tujuan transfer uang muka.
// - Akun superadmin tidak bisa dikelola siapa pun lewat aplikasi.
//
// Dipakai halaman (menampilkan form atau tampilan baca saja) dan Server Action
// (pengaman sebenarnya). File ini tidak memakai `server-only` karena hanya
// berisi aturan, tanpa akses database.

import { can } from "@/lib/auth/permissions";
import { ASSIGNABLE_ROLES, type AssignableRole, type Role } from "@/lib/auth/roles";

type Actor = { roles: readonly Role[] };

// Boleh membuka menu Pengguna (menambah/mengelola sebagian akun)?
export function canManageUsers(actor: Actor) {
  return can(actor, "user:manage") || can(actor, "user:manage-employee");
}

// Role yang boleh diberikan/dicabut oleh actor.
export function assignableRolesFor(actor: Actor): AssignableRole[] {
  if (can(actor, "user:manage")) {
    return can(actor, "user:manage-owner")
      ? [...ASSIGNABLE_ROLES]
      : ASSIGNABLE_ROLES.filter((role) => role !== "OWNER");
  }
  return can(actor, "user:manage-employee") ? ["EMPLOYEE"] : [];
}

// Boleh mengedit data, role, status, dan me-reset password akun target?
export function canManageUser(actor: Actor, target: { roles: readonly Role[] }) {
  if (target.roles.includes("SUPERADMIN")) return false;
  if (can(actor, "user:manage")) return can(actor, "user:manage-owner") || !target.roles.includes("OWNER");
  return can(actor, "user:manage-employee") && target.roles.length > 0 && target.roles.every((role) => role === "EMPLOYEE");
}

// Boleh mengubah rekening bank akun lain? (Admin HR tidak.)
export function canEditBankAccount(actor: Actor) {
  return can(actor, "user:manage");
}

// Boleh mengubah EMAIL akun lain? Hanya Owner (akun staf) dan Superadmin (akun
// Owner): email adalah identitas login sekaligus tujuan password sementara,
// jadi pemilik akun tidak bisa mengubahnya sendiri (menu Profil baca saja) dan
// Admin HR juga tidak. Tanpa ini, orang yang menguasai sesi akun bisa mengganti
// email ke miliknya lalu "reset password" mengirim password ke penyerang.
export function canEditEmail(actor: Actor) {
  return can(actor, "user:manage");
}
