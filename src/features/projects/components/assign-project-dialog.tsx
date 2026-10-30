// Tombol + dialog "Tetapkan project" untuk uang muka lama yang belum punya
// project (dibuat sebelum fitur project ada). Hanya OWNER (project:manage).

"use client";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionDialog } from "@/features/advances/components/action-dialog";
import { assignAdvanceProject } from "@/features/projects/actions";

export function AssignProjectDialog({
  advanceId,
  projects,
}: {
  advanceId: string;
  projects: { id: string; name: string }[];
}) {
  if (projects.length === 0) {
    return <span className="text-xs text-muted-foreground">Belum ada project aktif. Tambahkan di menu Project.</span>;
  }

  const items = projects.map((project) => ({ value: project.id, label: project.name }));

  return (
    <ActionDialog
      label="Tetapkan project"
      variant="outline"
      title="Tetapkan project"
      description="Uang muka ini dibuat sebelum ada project. Setelah ditetapkan, project tidak bisa diganti lagi."
      confirmLabel="Tetapkan"
      successMessage="Project ditetapkan."
      onConfirm={(formData) => assignAdvanceProject(advanceId, String(formData.get("projectId") ?? ""))}
    >
      {(fieldError) => (
        <Field data-invalid={!!fieldError("projectId")}>
          <FieldLabel htmlFor="projectId">Project</FieldLabel>
          <Select name="projectId" items={items}>
            <SelectTrigger id="projectId" className="w-full">
              <SelectValue placeholder="Pilih project" />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>{fieldError("projectId")}</FieldError>
        </Field>
      )}
    </ActionDialog>
  );
}
