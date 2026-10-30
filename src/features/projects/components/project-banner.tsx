// Pita "Anda sedang di project X" di atas daftar uang muka / pertanggungjawaban
// dan form uang muka, supaya pengguna selalu tahu sedang berada di project
// mana. Tombol "Ganti project" kembali ke halaman Project.

import Link from "next/link";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import type { ProjectInfo } from "../queries";
import { projectAccentStyle } from "./project-accent";
import { ProjectIcon } from "./project-icon";

// project null = uang muka lama yang belum punya project.
export function ProjectBanner({ project }: { project: ProjectInfo | null }) {
  return (
    <div
      style={projectAccentStyle(project?.id ?? null)}
      className="project-accent flex flex-col gap-3 rounded-lg border border-(--project-border) bg-(--project-soft) p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-(--project-strong) text-(--project-on)">
          <ProjectIcon name={project?.icon ?? "building"} className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Anda sedang di project</p>
          <p className="truncate font-semibold">{project?.name ?? "Tanpa project"}</p>
          {project?.client && <p className="truncate text-xs text-muted-foreground">{project.client}</p>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        {project?.status === "COMPLETED" && <ToneBadge tone="pending">Project selesai</ToneBadge>}
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/projects" />}>
          Ganti project
        </Button>
      </div>
    </div>
  );
}
