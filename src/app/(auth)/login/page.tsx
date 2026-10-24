// Halaman /login. Folder (auth) adalah route group: tanda kurung membuat nama
// folder tidak masuk ke URL, tapi halaman ini memakai (auth)/layout.tsx.
//
// page.tsx sengaja dibuat tipis: hanya menyusun komponen dari features/auth.
//
// Referensi: node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md
// (bagian "Route groups")

import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Masuk",
};

export default function LoginPage() {
  return (
    <>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Masuk ke akun Anda</CardTitle>
          <CardDescription>Gunakan email dan password yang diberikan admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
      <p className="px-6 text-center text-xs text-muted-foreground">
        Lupa password atau belum punya akun? Hubungi Owner atau tim Finance.
      </p>
    </>
  );
}
