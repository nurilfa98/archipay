// Komponen project khusus OWNER (permission project:manage):
// - ProjectStatusButton : tombol + dialog tandai Selesai / aktifkan lagi (detail project).
// - ProjectFields       : isian form tambah/ubah project (project-form.tsx).
//
// Project tidak bisa dihapus agar uang muka lama tetap punya induk; project
// Selesai tidak muncul lagi untuk uang muka baru.

"use client";

import { CheckCircle2Icon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import { Field, FieldDescription, FieldError, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { setProjectStatus } from "@/features/projects/actions";
import { MAX_CONTRACT_DIGITS, PROJECT_ICONS, type ProjectIconKey, type ProjectStatus } from "@/features/projects/constants";
import { projectAccentStyle } from "./project-accent";
import { ProjectIcon } from "./project-icon";

export type EditableProject = {
  id: string;
  name: string;
  client: string | null;
  contractValue: number | null;
  icon: ProjectIconKey;
};

export function ProjectStatusButton({ project }: { project: { id: string; name: string; status: ProjectStatus } }) {
  const active = project.status === "ACTIVE";

  return (
    <ActionDialog
      label={active ? "Tandai selesai" : "Aktifkan lagi"}
      icon={active ? <CheckCircle2Icon /> : <RotateCcwIcon />}
      showLabel
      variant="brand-outline"
      title={active ? `Tandai "${project.name}" selesai?` : `Aktifkan lagi "${project.name}"?`}
      description={
        active
          ? "Project tidak bisa dipakai lagi untuk uang muka baru. Uang muka yang sudah berjalan tetap berjalan, dan laporan project tetap bisa dibuka."
          : "Project bisa dipakai lagi untuk uang muka baru."
      }
      confirmLabel={active ? "Tandai selesai" : "Aktifkan"}
      successMessage={active ? "Project ditandai selesai." : "Project diaktifkan."}
      onConfirm={() => setProjectStatus(project.id, active ? "COMPLETED" : "ACTIVE")}
    />
  );
}

// Isian form tambah/ubah project. Dipakai halaman /projects/new dan
// /projects/[id]/edit (project-form.tsx). State nilai kontrak ada di sini agar angka
// tampil dengan pemisah ribuan; server membuang semua karakter selain angka.
export function ProjectFields({
  project,
  fieldError,
}: {
  project?: EditableProject;
  fieldError: (name: string) => string | undefined;
}) {
  const [contractDigits, setContractDigits] = useState(project?.contractValue ? String(project.contractValue) : "");

  return (
    <>
      <Field data-invalid={!!fieldError("name")}>
        <FieldLabel htmlFor="name">Nama project</FieldLabel>
        <Input
          id="name"
          name="name"
          defaultValue={project?.name}
          maxLength={120}
          autoComplete="off"
          placeholder="Contoh: Renovasi Gedung A"
          aria-invalid={!!fieldError("name")}
          required
        />
        <FieldError>{fieldError("name")}</FieldError>
      </Field>

      <Field data-invalid={!!fieldError("client")}>
        <FieldLabel htmlFor="client">Klien (opsional)</FieldLabel>
        <Input
          id="client"
          name="client"
          defaultValue={project?.client ?? ""}
          maxLength={120}
          autoComplete="off"
          placeholder="Contoh: PT Realitech Solution"
          aria-invalid={!!fieldError("client")}
        />
        <FieldError>{fieldError("client")}</FieldError>
      </Field>

      <Field data-invalid={!!fieldError("contractValue")}>
        <FieldLabel htmlFor="contractValue">Nilai kontrak (opsional)</FieldLabel>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
            Rp
          </span>
          <Input
            id="contractValue"
            name="contractValue"
            inputMode="numeric"
            autoComplete="off"
            placeholder="1.500.000.000"
            className="pl-9 tabular-nums"
            value={contractDigits ? Number(contractDigits).toLocaleString("id-ID") : ""}
            onChange={(event) => setContractDigits(event.target.value.replace(/\D/g, "").slice(0, MAX_CONTRACT_DIGITS))}
            aria-invalid={!!fieldError("contractValue")}
          />
        </div>
        <FieldDescription>Hanya terlihat oleh Owner. Dipakai untuk menghitung keuntungan project.</FieldDescription>
        <FieldError>{fieldError("contractValue")}</FieldError>
      </Field>

      <FieldSet data-invalid={!!fieldError("icon")}>
        <FieldLegend variant="label">Ikon</FieldLegend>
        <FieldDescription>Warna kartu project mengikuti ikon yang dipilih.</FieldDescription>
        <div className="grid grid-cols-6 gap-2">
          {PROJECT_ICONS.map((key) => (
            <label
              key={key}
              className="project-accent cursor-pointer"
              style={projectAccentStyle(key)}
              title={key}
            >
              <input
                type="radio"
                name="icon"
                value={key}
                defaultChecked={(project?.icon ?? PROJECT_ICONS[0]) === key}
                className="peer sr-only"
              />
              <span className="flex aspect-square w-full items-center justify-center rounded-md border border-(--project-border) text-(--project-strong) transition-colors hover:bg-(--project-soft) peer-checked:border-(--project-strong) peer-checked:bg-(--project-strong) peer-checked:text-(--project-on) peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                <ProjectIcon name={key} className="size-5" />
              </span>
              <span className="sr-only">{key}</span>
            </label>
          ))}
        </div>
        <FieldError>{fieldError("icon")}</FieldError>
      </FieldSet>
    </>
  );
}
