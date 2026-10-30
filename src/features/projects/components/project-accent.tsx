// Pembantu tampilan: gaya inline yang mengisi warna otomatis sebuah project
// (kelas .project-accent di globals.css membaca --project-hue). Project dengan
// id null ("Tanpa project") dibuat abu-abu.

import type { CSSProperties } from "react";
import { projectHue } from "../color";

export function projectAccentStyle(projectId: string | null): CSSProperties {
  const vars: Record<string, number> = projectId
    ? { "--project-hue": projectHue(projectId) }
    : { "--project-hue": 260, "--project-chroma": 0 };
  return vars as CSSProperties;
}
