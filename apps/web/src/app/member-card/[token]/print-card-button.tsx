'use client';

export function PrintCardButton(): React.JSX.Element {
  return <button type="button" onClick={() => window.print()} className="rounded-xl bg-amber-500 px-5 py-2.5 font-bold text-slate-950">Cetak / Simpan PDF</button>;
}
