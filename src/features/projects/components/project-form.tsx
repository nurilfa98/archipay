// Form project (khusus OWNER) untuk dua halaman:
// - /projects/new        : tambah project, lalu kembali ke daftar (project baru
//                          tampil paling kiri atas).
// - /projects/[id]/edit  : ubah project (`project` diisi), lalu kembali ke
//                          detail project.
//
// Kenapa memakai onSubmit, bukan <form action>? Dengan `action`, React
// mengosongkan form setelah Server Action selesai, termasuk saat validasi
// GAGAL. Dengan onSubmit + startTransition, isian tetap ada saat ada error.
// Polanya sama dengan features/users/components/user-create-form.tsx.

"use client";

import { LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/types/action-result";
import { createProject, updateProject } from "../actions";
import { ProjectFields, type EditableProject } from "./project-dialogs";

export function ProjectForm({ project }: { project?: EditableProject }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<Extract<ActionResult, { success: false }> | null>(null);
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];
  const backHref = project ? `/projects/${project.id}` : "/projects";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = project ? await updateProject(project.id, formData) : await createProject(formData);
      if (!result.success) {
        setError(result);
        if (!result.fieldErrors) notify.error(result.message);
        return;
      }
      if (project) {
        notify.success("Perubahan nama dan klien ikut tampil di uang muka yang sudah ada.", {
          title: "Project diperbarui",
        });
      } else {
        notify.success("Project baru langsung bisa dipakai untuk mengajukan uang muka.", {
          title: "Project ditambahkan",
        });
      }
      router.push(backHref);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md">
      <FieldGroup>
        <ProjectFields project={project} fieldError={fieldError} />
        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href={backHref} />}>
            Batal
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
