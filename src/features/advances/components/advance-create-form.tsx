// Form uang muka, dipakai untuk tiga mode:
// - "direct"  (OWNER, push)    : pilih karyawan; dana langsung tercatat cair dan
//                                karyawan menerima WhatsApp untuk konfirmasi.
// - "propose" (FINANCE, push)  : pilih karyawan; menjadi usulan yang menunggu
//                                persetujuan OWNER.
// - "request" (karyawan, pull) : TANPA pilih karyawan, karena penerimanya
//                                selalu diri sendiri; menunggu persetujuan OWNER.
//
// Polanya sama dengan features/users/components/user-create-form.tsx
// (onSubmit + startTransition agar isian tidak hilang saat validasi gagal).
// Berhasil → Server Action me-redirect ke halaman detail. Error umum (bukan
// per isian) tampil sebagai toast.
//
// Referensi:
// - https://ui.shadcn.com/docs/components/combobox
// - https://ui.shadcn.com/docs/components/radio-group

"use client";

import { CircleAlertIcon, InfoIcon, LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { notify } from "@/lib/notify";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { createAdvance } from "@/features/advances/actions";
import {
  DISBURSEMENT_METHOD_LABELS,
  DISBURSEMENT_METHODS,
  type DisbursementMethod,
} from "@/features/advances/constants";
import type { RecipientOption } from "@/features/advances/queries";
import { formatRupiah } from "@/lib/format";

type Mode = "direct" | "propose" | "request";

type AdvanceCreateFormProps = {
  settlementDueDays: number;
  returnDueDays: number;
} & (
  | { mode: "direct" | "propose"; recipients: RecipientOption[] }
  | { mode: "request"; self: RecipientOption }
);

export function AdvanceCreateForm(props: AdvanceCreateFormProps) {
  const { mode, settlementDueDays, returnDueDays } = props;
  const [state, formAction, pending] = useActionState(createAdvance, undefined);
  const [selected, setSelected] = useState<RecipientOption | null>(null);
  const [amountDigits, setAmountDigits] = useState("");
  const [method, setMethod] = useState<DisbursementMethod>("CASH");

  const recipient = props.mode === "request" ? props.self : selected;
  const amount = Number(amountDigits || 0);

  const error = state && !state.success ? state : undefined;
  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  useEffect(() => {
    if (state && !state.success && !state.fieldErrors) notify.error(state.message);
  }, [state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  if (props.mode !== "request" && props.recipients.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada karyawan aktif lain. Tambahkan dulu di menu{" "}
        <Link href="/users" className="underline">
          Pengguna
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <input type="hidden" name="kind" value={mode === "request" ? "request" : "push"} />
      <FieldGroup>
        {props.mode !== "request" && (
          <Field data-invalid={!!fieldError("recipientId")}>
            <FieldLabel htmlFor="recipientId">Karyawan penerima</FieldLabel>
            {/* Combobox = dropdown yang bisa diketik untuk mencari nama/email.
                `name` + itemToStringValue membuat Base UI mengirim id karyawan
                lewat input tersembunyi saat form disubmit. */}
            <Combobox
              items={props.recipients}
              value={selected}
              onValueChange={setSelected}
              name="recipientId"
              itemToStringLabel={(option) => option.fullName}
              itemToStringValue={(option) => option.id}
              filter={(option, query) => matchesRecipient(option, query)}
            >
              <ComboboxInput
                id="recipientId"
                placeholder="Cari nama atau email karyawan"
                className="w-full"
                aria-invalid={!!fieldError("recipientId")}
                showClear={!!selected}
              />
              <ComboboxContent>
                <ComboboxEmpty>Karyawan tidak ditemukan.</ComboboxEmpty>
                <ComboboxList>
                  {(option: RecipientOption) => (
                    <ComboboxItem key={option.id} value={option}>
                      <div className="flex min-w-0 flex-col">
                        <span>{option.fullName}</span>
                        <span className="truncate text-xs text-muted-foreground">{option.email}</span>
                      </div>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {selected && !selected.phoneNumber && !fieldError("recipientId") && (
              <FieldDescription>
                Karyawan ini belum punya nomor WhatsApp, sehingga tidak menerima notifikasi.
              </FieldDescription>
            )}
            <FieldError>{fieldError("recipientId")}</FieldError>
          </Field>
        )}

        <Field data-invalid={!!fieldError("amount")}>
          <FieldLabel htmlFor="amount">Nominal</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
              Rp
            </span>
            {/* Ditampilkan dengan pemisah ribuan ("500.000"); server membuang
                semua karakter selain angka sebelum validasi. */}
            <Input
              id="amount"
              name="amount"
              inputMode="numeric"
              autoComplete="off"
              placeholder="500.000"
              className="pl-9 tabular-nums"
              value={amountDigits ? Number(amountDigits).toLocaleString("id-ID") : ""}
              onChange={(event) => setAmountDigits(event.target.value.replace(/\D/g, "").slice(0, 13))}
              aria-invalid={!!fieldError("amount")}
              required
            />
          </div>
          <FieldError>{fieldError("amount")}</FieldError>
        </Field>

        <Field data-invalid={!!fieldError("purpose")}>
          <FieldLabel htmlFor="purpose">Keperluan</FieldLabel>
          <Textarea
            id="purpose"
            name="purpose"
            placeholder="Contoh: Beli material sampel & transport survei lokasi Proyek Rumah Pak Budi"
            maxLength={500}
            aria-invalid={!!fieldError("purpose")}
            required
          />
          <FieldError>{fieldError("purpose")}</FieldError>
        </Field>

        <FieldSet data-invalid={!!fieldError("disbursementMethod")}>
          <FieldLegend variant="label">
            {mode === "request" ? "Dana diterima secara" : "Metode pencairan"}
          </FieldLegend>
          <RadioGroup
            name="disbursementMethod"
            value={method}
            onValueChange={(value) => setMethod(value as DisbursementMethod)}
            className="flex gap-6"
          >
            {DISBURSEMENT_METHODS.map((option) => (
              <Field key={option} orientation="horizontal" className="w-auto">
                <RadioGroupItem value={option} id={`method-${option}`} />
                <FieldLabel htmlFor={`method-${option}`} className="font-normal">
                  {DISBURSEMENT_METHOD_LABELS[option]}
                </FieldLabel>
              </Field>
            ))}
          </RadioGroup>
          <FieldError>{fieldError("disbursementMethod")}</FieldError>
        </FieldSet>

        {method === "TRANSFER" && recipient && (
          <DestinationAccount recipient={recipient} isSelf={mode === "request"} />
        )}

        {/* Referensi transfer hanya diisi saat uang benar-benar ditransfer.
            Usulan & pengajuan mengisinya nanti, saat "Catat pencairan". */}
        {method === "TRANSFER" && mode === "direct" && (
          <Field data-invalid={!!fieldError("transferReference")}>
            <FieldLabel htmlFor="transferReference">Nomor referensi transfer (opsional)</FieldLabel>
            <Input
              id="transferReference"
              name="transferReference"
              autoComplete="off"
              maxLength={100}
              aria-invalid={!!fieldError("transferReference")}
            />
            <FieldDescription>Dari bukti transfer m-banking. Foto bukti transfer menyusul.</FieldDescription>
            <FieldError>{fieldError("transferReference")}</FieldError>
          </Field>
        )}

        <Alert>
          <InfoIcon />
          <AlertTitle>{INFO_TITLES[mode]}</AlertTitle>
          <AlertDescription>
            {INFO_TEXTS[mode]} Batas unggah nota {settlementDueDays} hari kalender sejak dana
            dicairkan; sisa dana dikembalikan paling lambat {returnDueDays} hari setelah
            pertanggungjawaban diverifikasi.
          </AlertDescription>
        </Alert>

        <Field orientation="horizontal">
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            {submitLabel(mode, amount, pending)}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/advances" />}>
            Batal
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

const INFO_TITLES: Record<Mode, string> = {
  direct: "Setelah disimpan",
  propose: "Alur persetujuan",
  request: "Alur pengajuan",
};

const INFO_TEXTS: Record<Mode, string> = {
  direct:
    "Dana tercatat sudah diserahkan sekarang. Karyawan menerima WhatsApp untuk mengonfirmasi penerimaan dan menyetujui ketentuan potong gaji.",
  propose:
    "Usulan dikirim ke Owner. Setelah disetujui, serahkan dana lalu tekan “Catat pencairan” di halaman detail.",
  request:
    "Pengajuan dikirim ke Owner untuk disetujui. Setelah dana diserahkan, Anda menerima WhatsApp untuk mengonfirmasi penerimaan.",
};

// Pencarian di combobox: cocok bila nama ATAU email mengandung kata yang diketik.
function matchesRecipient(option: RecipientOption, query: string) {
  const keyword = query.trim().toLowerCase();
  return (
    !keyword ||
    option.fullName.toLowerCase().includes(keyword) ||
    option.email.toLowerCase().includes(keyword)
  );
}

// Nominal ikut tampil di tombol sebagai konfirmasi terakhir sebelum disimpan.
function submitLabel(mode: Mode, amount: number, pending: boolean) {
  if (pending) return "Menyimpan...";
  const nominal = amount > 0 ? ` ${formatRupiah(amount)}` : "";
  if (mode === "direct") return `Cairkan${nominal}`;
  if (mode === "propose") return `Ajukan${nominal} ke Owner`;
  return `Kirim pengajuan${nominal}`;
}

function DestinationAccount({ recipient, isSelf }: { recipient: RecipientOption; isSelf: boolean }) {
  if (!recipient.bankName || !recipient.bankAccountNumber) {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>
          {isSelf ? "Rekening Anda belum diisi" : `Rekening ${recipient.fullName} belum diisi`}
        </AlertTitle>
        <AlertDescription>
          {isSelf
            ? "Minta Owner mengisi nomor rekening Anda di menu Pengguna, atau pilih Tunai."
            : "Pastikan nomor rekening tujuan benar sebelum mentransfer. Rekening bisa diisi Owner di menu Pengguna."}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="text-muted-foreground">Rekening tujuan</p>
      <p className="font-medium">
        {recipient.bankName} · {recipient.bankAccountNumber}
      </p>
      <p className="text-muted-foreground">
        Sesuai data rekening {isSelf ? "Anda" : recipient.fullName} di menu Pengguna.
      </p>
    </div>
  );
}
