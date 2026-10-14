'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePos } from '../../context/pos-context';
import { getWhatsAppShareUrl, isValidPhoneNumber } from '../../lib/whatsapp';

type ContactStatus = 'NOT_CONTACTED' | 'WAITING_REPLY' | 'CUSTOMER_AGREED';
type Impact = {
  leave_id: string;
  appointment_id: string;
  appointment_number: string;
  outlet_id: string;
  outlet_name: string;
  barber_id: string;
  barber_name: string;
  leave_status: 'PENDING' | 'APPROVED';
  appointment_status: 'PENDING' | 'CONFIRMED';
  start_at: string;
  end_at: string;
  customer_name: string;
  customer_phone: string;
  service_name: string;
  contact_status: ContactStatus;
};
type Barber = { id: string; full_name: string; position: string; employee_outlets: { outlet_id: string; is_active: boolean }[] };

const statusLabels: Record<ContactStatus, string> = {
  NOT_CONTACTED: 'Belum dihubungi',
  WAITING_REPLY: 'Menunggu balasan',
  CUSTOMER_AGREED: 'Pelanggan setuju',
};

export function LeaveBookingImpacts({ outletId, refreshKey }: { outletId?: string; refreshKey?: string }): React.JSX.Element | null {
  const { supabase } = usePos();
  const [impacts, setImpacts] = useState<Impact[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { barberId: string; startAt: string }>>({});

  const refresh = useCallback(async () => {
    const [{ data, error: loadError }, { data: employeeData, error: employeeError }] = await Promise.all([
      supabase.rpc('list_leave_booking_impacts', { p_outlet_id: outletId || null }),
      supabase.from('employees').select('id, full_name, position, employee_outlets(outlet_id, is_active)').eq('is_active', true),
    ]);
    if (loadError) {
      setError('Gagal memuat booking terdampak. Pastikan migrasi Supabase sudah diterapkan.');
      return;
    }
    setError(employeeError ? 'Daftar kapster pengganti belum dapat dimuat.' : '');
    setImpacts((data || []) as Impact[]);
    setBarbers((employeeData || []) as Barber[]);
  }, [supabase, outletId, refreshKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  const saveStatus = async (impact: Impact, status: ContactStatus) => {
    setBusyId(impact.appointment_id);
    const { error: saveError } = await supabase.rpc('set_leave_booking_contact_status', {
      p_leave_id: impact.leave_id,
      p_appointment_id: impact.appointment_id,
      p_status: status,
    });
    if (saveError) setError('Gagal menyimpan status komunikasi. Muat ulang dan coba lagi.');
    else await refresh();
    setBusyId(null);
  };

  const rebook = async (impact: Impact) => {
    const draft = drafts[impact.appointment_id];
    if (!draft?.barberId) {
      setError('Pilih kapster pengganti.');
      return;
    }
    const startAt = new Date(draft.startAt || impact.start_at);
    if (Number.isNaN(startAt.getTime())) {
      setError('Tanggal/jam pengganti tidak valid.');
      return;
    }
    setBusyId(impact.appointment_id);
    const { error: saveError } = await supabase.rpc('rebook_impacted_appointment', {
      p_leave_id: impact.leave_id,
      p_appointment_id: impact.appointment_id,
      p_barber_id: draft.barberId,
      p_start_at: startAt.toISOString(),
    });
    if (saveError) setError('Gagal memindahkan booking. Periksa jadwal kapster, waktu cuti, dan benturan booking.');
    else await refresh();
    setBusyId(null);
  };

  const cancel = async (impact: Impact) => {
    if (!window.confirm(`Pelanggan ${impact.customer_name} sudah menyetujui pembatalan booking ${impact.appointment_number}?`)) return;
    setBusyId(impact.appointment_id);
    const { error: cancelError } = await supabase.rpc('transition_appointment_status', {
      p_appointment_id: impact.appointment_id,
      p_outlet_id: impact.outlet_id,
      p_target_status: 'CANCELLED',
      p_expected_current_status: impact.appointment_status,
    });
    if (cancelError) setError('Gagal membatalkan booking. Muat ulang status janji temu.');
    else await refresh();
    setBusyId(null);
  };

  if (!error && impacts.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-500/40 bg-slate-950 p-4 text-slate-100 space-y-3" aria-label="Booking terdampak cuti">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-amber-400">Booking terdampak cuti ({impacts.length})</h3>
          <p className="text-xs text-slate-400">Hubungi pelanggan sebelum memindahkan jadwal. Membuka WhatsApp tidak berarti pesan terkirim.</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="rounded border border-slate-700 px-3 py-1 text-xs">Muat ulang</button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      {impacts.map((impact) => {
        const options = barbers.filter((barber) => /barber|kapster/i.test(barber.position) && barber.employee_outlets?.some((assignment) =>
          assignment.outlet_id === impact.outlet_id && assignment.is_active));
        const draft = drafts[impact.appointment_id] || { barberId: impact.barber_id, startAt: '' };
        const message = `Halo ${impact.customer_name}, kami dari ${impact.outlet_name}. Booking ${impact.appointment_number} pada ${new Date(impact.start_at).toLocaleString('id-ID')} perlu penyesuaian karena kapster berhalangan. Apakah Anda berkenan memilih kapster lain atau jadwal baru? Mohon konfirmasi terlebih dahulu. Terima kasih.`;
        return (
          <div key={`${impact.leave_id}:${impact.appointment_id}`} className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{impact.customer_name} · {impact.appointment_number}</p>
                <p className="text-xs text-slate-400">{impact.outlet_name} · {impact.barber_name} · {impact.service_name} · {new Date(impact.start_at).toLocaleString('id-ID')}</p>
                <p className="text-xs text-slate-400">Cuti {impact.leave_status === 'PENDING' ? 'menunggu persetujuan' : 'disetujui'} · {impact.customer_phone || 'Nomor pelanggan belum tersedia'}</p>
              </div>
              {isValidPhoneNumber(impact.customer_phone) && <a href={getWhatsAppShareUrl(impact.customer_phone, message)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Buka WhatsApp</a>}
            </div>
            <label className="flex flex-wrap items-center gap-2 text-xs">
              Status komunikasi
              <select value={impact.contact_status} disabled={busyId === impact.appointment_id} onChange={(event) => void saveStatus(impact, event.target.value as ContactStatus)} className="rounded border border-slate-600 bg-slate-950 p-2 text-white">
                {(Object.keys(statusLabels) as ContactStatus[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
            </label>
            {impact.leave_status === 'APPROVED' && impact.contact_status === 'CUSTOMER_AGREED' && (
              <div className="flex flex-wrap items-end gap-2 text-xs">
                <label>Kapster pengganti<select value={draft.barberId} onChange={(event) => setDrafts((prev) => ({ ...prev, [impact.appointment_id]: { ...draft, barberId: event.target.value } }))} className="block rounded border border-slate-600 bg-slate-950 p-2 text-white">
                  {options.map((barber) => <option key={barber.id} value={barber.id}>{barber.full_name}</option>)}
                </select></label>
                <label>Jadwal baru (opsional)<input type="datetime-local" value={draft.startAt} onChange={(event) => setDrafts((prev) => ({ ...prev, [impact.appointment_id]: { ...draft, startAt: event.target.value } }))} className="block rounded border border-slate-600 bg-slate-950 p-2 text-white" /></label>
                <button type="button" disabled={busyId === impact.appointment_id} onClick={() => void rebook(impact)} className="rounded bg-amber-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-50">Simpan perubahan</button>
                <button type="button" disabled={busyId === impact.appointment_id} onClick={() => void cancel(impact)} className="rounded border border-rose-500 px-3 py-2 font-semibold text-rose-400 disabled:opacity-50">Batalkan booking</button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
