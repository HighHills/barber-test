import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(__dirname, '../../../../supabase/migrations/20261009073415_leave_booking_followup.sql'), 'utf8');
const accessMigration = readFileSync(resolve(__dirname, '../../../../supabase/migrations/20261009082954_restrict_leave_booking_followups_to_booking_managers.sql'), 'utf8');
const webPanel = readFileSync(resolve(__dirname, '../components/queue/leave-booking-impacts.tsx'), 'utf8');

describe('leave booking follow-up contract', () => {
  it('serializes leave approval with booking creation and rejects new appointments during approved leave', () => {
    expect(migration).toContain('CREATE TRIGGER lock_leave_barber');
    expect(migration).toContain('CREATE TRIGGER reject_appointment_during_leave');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("l.status = 'APPROVED'");
    expect(migration).toContain('NEW.start_at < l.end_at AND NEW.end_at > l.start_at');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public._legacy_create_public_booking');
    expect(migration).toContain('l.employee_id = e.id AND l.outlet_id = p_outlet_id');
  });

  it('keeps customer contact and rebooking behind booking permission and recorded agreement', () => {
    expect(migration).toContain('CREATE FUNCTION public.list_leave_booking_impacts');
    expect(migration).toContain('public.current_user_has_outlet_access(a.outlet_id)');
    expect(migration).toContain('CREATE FUNCTION public.set_leave_booking_contact_status');
    expect(migration).toContain('CREATE FUNCTION public.rebook_impacted_appointment');
    expect(migration).toContain("f.contact_status = 'CUSTOMER_AGREED'");
    expect(accessMigration).toContain("public.current_user_has_permission('booking.manage', impact.outlet_id)");
    expect(accessMigration).toContain("public.current_user_has_permission('booking.manage', a.outlet_id)");
    expect(accessMigration).toContain('REVOKE ALL ON FUNCTION public._base_rebook_impacted_appointment');
  });

  it('opens WhatsApp without marking the contact status automatically', () => {
    const openWhatsApp = webPanel.slice(webPanel.indexOf('const message ='), webPanel.indexOf('return (', webPanel.indexOf('const message =')));
    expect(webPanel).toContain('href={getWhatsAppShareUrl(impact.customer_phone, message)}');
    expect(openWhatsApp).not.toContain('set_leave_booking_contact_status');
    expect(openWhatsApp).not.toContain('impact.reason');
  });
});
