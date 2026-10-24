// Kerangka sidebar: logo di atas, menu di tengah.
//
// Komponen ini TIDAK mengambil data sendiri. Isi menu diterima lewat prop
// `nav` (pola "slot"/komposisi), sehingga bagian yang butuh data user bisa
// dibungkus <Suspense> oleh layout, sementara kerangka sidebar tampil instan.
//
// Perilaku responsif sudah ditangani komponen shadcn:
// - Desktop (≥ 768px): sidebar di kiri, bisa diciutkan jadi ikon (Ctrl/Cmd + B)
// - HP (< 768px)     : sidebar tersembunyi, muncul sebagai drawer (Sheet)
//                      saat tombol menu di navbar ditekan
//
// Referensi: https://ui.shadcn.com/docs/components/sidebar

import type { ReactNode } from "react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarRail } from "@/components/ui/sidebar";
import { Brand } from "./brand";

export function AppSidebar({ nav }: { nav: ReactNode }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center">
        <Brand className="px-1" />
      </SidebarHeader>
      <SidebarContent>{nav}</SidebarContent>
      {/* Garis tipis di tepi sidebar; bisa diklik untuk menciutkan/melebarkan */}
      <SidebarRail />
    </Sidebar>
  );
}
