// Bentuk return standar untuk semua Server Action, supaya form di client
// selalu menangani sukses/gagal dengan cara yang sama.
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; message: string; fieldErrors?: Record<string, string[]> };
