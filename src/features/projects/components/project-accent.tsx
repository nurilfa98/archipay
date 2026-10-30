// Pembantu tampilan: gaya inline yang mengisi warna sebuah project berdasarkan
// ikonnya (kelas .project-accent di globals.css membaca --project-hue).
// icon null ("Tanpa project") dibuat abu-abu.

import type { CSSProperties } from "react";
import { projectHue } from "../color";

export function projectAccentStyle(icon: string | null): CSSProperties {
  const vars: Record<string, number> = icon
    ? { "--project-hue": projectHue(icon) }
    : { "--project-hue": 260, "--project-chroma": 0 };
  return vars as CSSProperties;
}
