'use client';

import { useState } from 'react';
import { copyTextToClipboard, getWhatsAppShareUrl, isValidPhoneNumber } from '../../lib/whatsapp';

export interface IssuedMemberCard { token: string; name: string; code: string; phone: string; brand: string; expires_at: string | null; logo_url: string | null; background_url: string | null }

export function MemberCardShareModal({ card, onClose }: { card: IssuedMemberCard; onClose: () => void }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/member-card/${card.token}`;
  const message = `Halo ${card.name}, kartu member digital ${card.brand} Anda sudah siap. Lihat kartu di ${url}`;
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label="Kartu member digital">
    <div className="w-full max-w-lg rounded-2xl bg-white p-5 text-slate-900 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Kartu Member Digital</h2><p className="text-sm text-slate-500">{card.name} · {card.expires_at ? `Berlaku hingga ${new Date(card.expires_at).toLocaleDateString('id-ID')}` : 'Berlaku seumur hidup'}</p></div><button type="button" onClick={onClose} aria-label="Tutup">✕</button></div>
      <div className="mt-4 overflow-hidden rounded-2xl bg-slate-900 p-6 text-white" style={card.background_url?.startsWith('https://') ? { backgroundImage: `linear-gradient(90deg, rgba(15,23,42,.9), rgba(15,23,42,.55)), url(${JSON.stringify(card.background_url)})`, backgroundSize: 'cover' } : undefined}>
        {card.logo_url?.startsWith('https://') && <img src={card.logo_url} alt="Logo barber" className="mb-6 h-10 max-w-32 object-contain" />}
        <p className="text-xs font-bold uppercase tracking-widest text-amber-300">{card.brand}</p><p className="mt-9 text-xl font-bold">{card.name}</p><p className="font-mono text-xs">{card.code}</p><p className="mt-6 text-xs">{card.expires_at ? `Berlaku hingga ${new Date(card.expires_at).toLocaleDateString('id-ID')}` : 'Berlaku seumur hidup'}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Buka kartu</a>
        <button type="button" onClick={async () => setCopied(await copyTextToClipboard(url))} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">{copied ? 'Tautan tersalin' : 'Salin tautan'}</button>
        {isValidPhoneNumber(card.phone) && <a href={getWhatsAppShareUrl(card.phone, message)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Kirim via WhatsApp</a>}
      </div>
      {!isValidPhoneNumber(card.phone) && <p className="mt-3 text-sm text-amber-700">Nomor WhatsApp belum valid. Salin tautan kartu untuk dibagikan secara manual.</p>}
    </div>
  </div>;
}
