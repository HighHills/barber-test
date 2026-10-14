import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrintCardButton } from './print-card-button';

export const metadata: Metadata = { title: 'Kartu Member Digital', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Card = { name: string; code: string; brand: string; logo_url: string | null; background_url: string | null; issued_at: string; expires_at: string | null };
function imageUrl(value: string | null): string | undefined {
  try { const url = new URL(value || ''); return url.protocol === 'https:' ? url.href : undefined; } catch { return undefined; }
}

export default async function MemberCardPage({ params }: { params: Promise<{ token: string }> }): Promise<React.JSX.Element> {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) notFound();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Konfigurasi Supabase belum tersedia.');
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc('get_public_member_card', { p_token: token });
  if (error || !data) notFound();
  const card = data as Card;
  const background = imageUrl(card.background_url);
  const expired = card.expires_at && new Date(card.expires_at).getTime() < Date.now();
  return <main className="min-h-screen bg-slate-100 p-4 flex flex-col items-center justify-center text-slate-900">
    <div className="w-full max-w-xl overflow-hidden rounded-3xl bg-slate-900 p-8 sm:p-10 text-white shadow-2xl" style={background ? { backgroundImage: `linear-gradient(100deg, rgba(15,23,42,.92), rgba(15,23,42,.55)), url(${JSON.stringify(background)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
      {imageUrl(card.logo_url) && <img src={imageUrl(card.logo_url)} alt="Logo barber" className="mb-8 h-14 max-w-40 object-contain" />}
      <p className="text-sm font-bold uppercase tracking-[.2em] text-amber-300">{card.brand}</p>
      <p className="mt-12 text-xs uppercase tracking-widest text-slate-300">Kartu Member Digital</p>
      <h1 className="mt-2 text-3xl font-extrabold break-words">{card.name}</h1>
      <p className="mt-2 font-mono text-sm text-slate-200">{card.code}</p>
      <div className="mt-10 border-t border-white/30 pt-4 text-sm font-semibold">{expired ? 'Masa berlaku telah berakhir' : card.expires_at ? `Berlaku hingga ${new Date(card.expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}` : 'Berlaku seumur hidup'}</div>
    </div>
    <div className="mt-5 print:hidden"><PrintCardButton /></div>
    <p className="mt-3 text-center text-sm text-slate-600 print:hidden">Tunjukkan kartu ini saat berkunjung.</p>
  </main>;
}
