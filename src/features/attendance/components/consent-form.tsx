// Persetujuan pengolahan data wajah & lokasi (UU PDP 27/2022) sebelum
// mendaftarkan foto acuan. Teks yang ditampilkan sama persis dengan yang
// disimpan server (consentStatement di constants.ts).

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { notify } from "@/lib/notify";
import { giveAttendanceConsent } from "../face-actions";

export function ConsentForm({ statement }: { statement: string }) {
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await giveAttendanceConsent();
      if (!result.success) notify.error(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <blockquote className="rounded-lg border bg-muted/50 p-4 text-sm leading-relaxed">{statement}</blockquote>
      <Field orientation="horizontal">
        <Checkbox id="consent" checked={agreed} onCheckedChange={(checked) => setAgreed(checked)} />
        <FieldLabel htmlFor="consent" className="font-normal">
          Saya sudah membaca dan menyetujui pernyataan di atas.
        </FieldLabel>
      </Field>
      <div>
        <Button onClick={submit} disabled={!agreed || pending}>
          {pending && <LoaderCircleIcon className="animate-spin" />}
          Setuju & lanjutkan
        </Button>
      </div>
    </div>
  );
}
