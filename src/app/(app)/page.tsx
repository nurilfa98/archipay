// Halaman beranda (/). Sidebar & navbar sudah disediakan oleh (app)/layout.tsx,
// jadi page cukup berisi konten halaman ini saja.

import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Beranda",
};

export default function HomePage() {
  return <PageHeader title="Selamat datang di ArchiPay" />;
}
