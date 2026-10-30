// Tombol "kembali ke daftar" yang menjaga project yang sedang dibuka.
//
// - BackToList          : link biasa.
// - BackToProjectList   : untuk halaman yang membaca ?project= dari URL
//                         (form uang muka); bagian yang membaca searchParams
//                         berada di dalam <Suspense>, jadi kerangka halaman
//                         tetap statis.

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { readProjectParam } from "../schemas";

export function BackToList({ href, label }: { href: string; label: string }) {
  return (
    <div>
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={href} />}>
        <ArrowLeftIcon />
        {label}
      </Button>
    </div>
  );
}

export function BackToProjectList({
  basePath,
  label,
  searchParams,
}: {
  basePath: string;
  label: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<BackToList href={basePath} label={label} />}>
      {searchParams.then((params) => {
        const project = readProjectParam(params);
        return <BackToList href={project ? `${basePath}?project=${encodeURIComponent(project)}` : basePath} label={label} />;
      })}
    </Suspense>
  );
}
