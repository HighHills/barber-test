/**
 * Customer Operation Error Sanitization & BLOCKED Verification Suite
 *
 * Verifies:
 * 1. Missing RPC produces explicit BLOCKED status for both haircut and loyalty operations.
 * 2. Arbitrary PostgreSQL errors (SQLSTATE, relation names, column constraints, syntax errors)
 *    never leak internal details to the operator.
 * 3. Actual Supabase RPC error strings match exact production PostgreSQL triggers and map
 *    to safe, humane Indonesian operational messages.
 * 4. Backward-compatible synthetic business error codes remain supported without leaking.
 * 5. Safe error mappers for load customer, save customer, and save tier work fail-closed.
 * 6. Static code assertions on `apps/web/src/app/customers/page.tsx` guarantee zero raw error leaks.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  mapSaveHaircutRecordError,
  mapAdjustPointsError,
  mapLoadCustomerError,
  mapSaveCustomerError,
  mapSaveTierError,
  BLOCKED_HAIRCUT_RPC_MESSAGE,
  BLOCKED_POINTS_RPC_MESSAGE,
  GENERIC_HAIRCUT_ERROR_MESSAGE,
  GENERIC_POINTS_ERROR_MESSAGE,
  GENERIC_LOAD_CUSTOMER_ERROR_MESSAGE,
  GENERIC_SAVE_CUSTOMER_ERROR_MESSAGE,
  GENERIC_SAVE_TIER_ERROR_MESSAGE,
} from '../lib/customer-operation-errors';

describe('Customer Operation Error Sanitization (Fail-Closed Contract)', () => {
  describe('1. Missing RPC Detection (BLOCKED Status)', () => {
    it('returns BLOCKED status for haircut when error code is 42883 (undefined_function)', () => {
      const error = {
        code: '42883',
        message: 'function public.add_customer_haircut_record(uuid, uuid, uuid, text) does not exist',
      };
      const result = mapSaveHaircutRecordError(error);
      expect(result).toBe(BLOCKED_HAIRCUT_RPC_MESSAGE);
      expect(result).toContain('BLOCKED');
      expect(result).toContain('add_customer_haircut_record');
    });

    it('returns BLOCKED status for haircut when PostgREST message indicates function does not exist', () => {
      const error = new Error('Could not find the function public.add_customer_haircut_record in the schema cache');
      const result = mapSaveHaircutRecordError(error);
      expect(result).toBe(BLOCKED_HAIRCUT_RPC_MESSAGE);
    });

    it('returns BLOCKED status for haircut when message contains rpc not found string', () => {
      const error = { message: 'RPC add_customer_haircut_record not found on database' };
      const result = mapSaveHaircutRecordError(error);
      expect(result).toBe(BLOCKED_HAIRCUT_RPC_MESSAGE);
    });

    it('returns BLOCKED status for loyalty points when error code is 42883', () => {
      const error = {
        code: '42883',
        message: 'function public.adjust_customer_loyalty_points(uuid, uuid, integer, text, uuid) does not exist',
      };
      const result = mapAdjustPointsError(error);
      expect(result).toBe(BLOCKED_POINTS_RPC_MESSAGE);
      expect(result).toContain('BLOCKED');
      expect(result).toContain('adjust_customer_loyalty_points');
    });

    it('returns BLOCKED status for loyalty points when PostgREST message indicates function does not exist', () => {
      const error = new Error('Could not find the function public.adjust_customer_loyalty_points');
      const result = mapAdjustPointsError(error);
      expect(result).toBe(BLOCKED_POINTS_RPC_MESSAGE);
    });
  });

  describe('2. Sanitization of Internal PostgreSQL Errors (Zero Leaks)', () => {
    const rawPostgresErrors = [
      {
        code: '42P01',
        message: 'relation "customer_haircut_history" does not exist',
      },
      {
        code: '23502',
        message: 'null value in column "barber_id" of relation "customer_haircut_history" violates not-null constraint',
      },
      {
        code: '23503',
        message: 'insert or update on table "customer_loyalty_ledger" violates foreign key constraint "customer_loyalty_ledger_customer_id_fkey"',
      },
      {
        code: '42601',
        message: 'syntax error at or near "SELECT" at character 14',
      },
      {
        code: '57014',
        message: 'canceling statement due to statement timeout',
      },
      {
        code: '08006',
        message: 'connection failure to PostgreSQL cluster backend server 10.0.0.1:5432',
      },
      {
        code: 'XX000',
        message: 'internal error: tuple concurrently updated in block 42 offset 1',
      },
    ];

    it('sanitizes all PostgreSQL internals for save haircut record', () => {
      for (const err of rawPostgresErrors) {
        const result = mapSaveHaircutRecordError(err);
        expect(result).toBe(GENERIC_HAIRCUT_ERROR_MESSAGE);
        expect(result).not.toContain(err.code);
        expect(result).not.toContain('relation');
        expect(result).not.toContain('table');
        expect(result).not.toContain('constraint');
        expect(result).not.toContain('column');
        expect(result).not.toContain('syntax');
        expect(result).not.toContain('timeout');
        expect(result).not.toContain('5432');
      }
    });

    it('sanitizes all PostgreSQL internals for adjust points', () => {
      for (const err of rawPostgresErrors) {
        const result = mapAdjustPointsError(err);
        expect(result).toBe(GENERIC_POINTS_ERROR_MESSAGE);
        expect(result).not.toContain(err.code);
        expect(result).not.toContain('relation');
        expect(result).not.toContain('table');
        expect(result).not.toContain('constraint');
        expect(result).not.toContain('column');
        expect(result).not.toContain('syntax');
        expect(result).not.toContain('timeout');
        expect(result).not.toContain('5432');
      }
    });

    it('sanitizes all PostgreSQL internals for load customer, save customer, and save tier', () => {
      for (const err of rawPostgresErrors) {
        const loadRes = mapLoadCustomerError(err);
        expect(loadRes).toBe(GENERIC_LOAD_CUSTOMER_ERROR_MESSAGE);
        expect(loadRes).not.toContain(err.code);

        const saveRes = mapSaveCustomerError(err);
        expect(saveRes).toBe(GENERIC_SAVE_CUSTOMER_ERROR_MESSAGE);
        expect(saveRes).not.toContain(err.code);

        const tierRes = mapSaveTierError(err);
        expect(tierRes).toBe(GENERIC_SAVE_TIER_ERROR_MESSAGE);
        expect(tierRes).not.toContain(err.code);
      }
    });

    it('handles unexpected non-object errors fail-closed without leaking', () => {
      expect(mapSaveHaircutRecordError(null)).toBe(GENERIC_HAIRCUT_ERROR_MESSAGE);
      expect(mapSaveHaircutRecordError(undefined)).toBe(GENERIC_HAIRCUT_ERROR_MESSAGE);
      expect(mapSaveHaircutRecordError(12345)).toBe(GENERIC_HAIRCUT_ERROR_MESSAGE);

      expect(mapAdjustPointsError(null)).toBe(GENERIC_POINTS_ERROR_MESSAGE);
      expect(mapAdjustPointsError(undefined)).toBe(GENERIC_POINTS_ERROR_MESSAGE);
      expect(mapAdjustPointsError(true)).toBe(GENERIC_POINTS_ERROR_MESSAGE);

      expect(mapLoadCustomerError(null)).toBe(GENERIC_LOAD_CUSTOMER_ERROR_MESSAGE);
      expect(mapSaveCustomerError(null)).toBe(GENERIC_SAVE_CUSTOMER_ERROR_MESSAGE);
      expect(mapSaveTierError(null)).toBe(GENERIC_SAVE_TIER_ERROR_MESSAGE);
    });
  });

  describe('3. Actual Supabase RPC Error Strings (Exact Production Contract)', () => {
    it('maps actual "Customer ... tidak ditemukan atau tidak aktif" string from haircut RPC', () => {
      const err = {
        code: '22023',
        message: 'Customer c4a8b792-7f21-4f9e-a81d-8f9210ab4e12 tidak ditemukan atau tidak aktif',
      };
      const result = mapSaveHaircutRecordError(err);
      expect(result).toBe('Data pelanggan tidak ditemukan atau berstatus tidak aktif.');
      expect(result).not.toContain('c4a8b792');
      expect(result).not.toContain('22023');
    });

    it('maps actual "Customer ... tidak ditemukan atau tidak aktif" string from points RPC', () => {
      const err = {
        code: '22023',
        message: 'Customer d8f3a110-3321-4d1a-b672-998877665544 tidak ditemukan atau tidak aktif',
      };
      const result = mapAdjustPointsError(err);
      expect(result).toBe('Data pelanggan tidak ditemukan atau berstatus tidak aktif.');
      expect(result).not.toContain('d8f3a110');
      expect(result).not.toContain('22023');
    });

    it('maps actual "Nama style pangkas wajib diisi" string from haircut RPC', () => {
      const err = {
        code: '22023',
        message: 'Nama style pangkas wajib diisi',
      };
      const result = mapSaveHaircutRecordError(err);
      expect(result).toBe('Nama gaya pangkas rambut wajib diisi.');
      expect(result).not.toContain('22023');
    });

    it('maps actual "Barber ... tidak aktif atau tidak ditugaskan pada outlet ..." string from haircut RPC', () => {
      const err = {
        code: '42501',
        message: 'Barber b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d tidak aktif atau tidak ditugaskan pada outlet o1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c',
      };
      const result = mapSaveHaircutRecordError(err);
      expect(result).toBe('Kapster tidak aktif atau tidak ditugaskan pada cabang ini.');
      expect(result).not.toContain('b1a2c3d4');
      expect(result).not.toContain('o1a2b3c4');
      expect(result).not.toContain('42501');
    });

    it('maps actual "Perubahan poin tidak boleh 0" string from points RPC', () => {
      const err = {
        code: '22023',
        message: 'Perubahan poin tidak boleh 0',
      };
      const result = mapAdjustPointsError(err);
      expect(result).toBe('Jumlah poin penyesuaian tidak boleh bernilai 0.');
      expect(result).not.toContain('22023');
    });

    it('maps actual "Koreksi poin melebihi saldo customer..." string from points RPC', () => {
      const err = {
        code: '22023',
        message: 'Koreksi poin melebihi saldo customer. Saldo saat ini: 50, koreksi: -100',
      };
      const result = mapAdjustPointsError(err);
      expect(result).toBe('Pengurangan poin melebihi saldo poin aktif pelanggan.');
      expect(result).not.toContain('22023');
    });

    it('maps formatted "Koreksi poin melebihi saldo customer % (saldo: %, pengurangan: %)" string from points RPC', () => {
      const err = {
        code: '22023',
        message: 'Koreksi poin melebihi saldo customer c4a8... (saldo: 50, pengurangan: 100)',
      };
      const result = mapAdjustPointsError(err);
      expect(result).toBe('Pengurangan poin melebihi saldo poin aktif pelanggan.');
      expect(result).not.toContain('22023');
    });

    it('maps actual "Alasan koreksi poin wajib diisi" string from points RPC', () => {
      const err = {
        code: '22023',
        message: 'Alasan koreksi poin wajib diisi',
      };
      const result = mapAdjustPointsError(err);
      expect(result).toBe('Alasan penyesuaian poin wajib diisi.');
      expect(result).not.toContain('22023');
    });
  });

  describe('4. Backward-Compatible Synthetic Business Error Codes', () => {
    it('maps permission denied cleanly for haircut and points', () => {
      const haircutErr = { code: '42501', message: 'Akses ditolak: pengguna tidak memiliki izin' };
      expect(mapSaveHaircutRecordError(haircutErr)).toBe(
        'Akses ditolak: Anda tidak memiliki izin untuk menyimpan catatan pangkas rambut.'
      );

      const pointsErr = { code: '42501', message: 'PERMISSION_DENIED' };
      expect(mapAdjustPointsError(pointsErr)).toBe(
        'Akses ditolak: Anda tidak memiliki izin untuk melakukan koreksi poin loyalitas.'
      );
    });

    it('maps CUSTOMER_NOT_FOUND code for haircut and points', () => {
      const err = { message: 'CUSTOMER_NOT_FOUND' };
      expect(mapSaveHaircutRecordError(err)).toBe('Data pelanggan tidak ditemukan atau berstatus tidak aktif.');
      expect(mapAdjustPointsError(err)).toBe('Data pelanggan tidak ditemukan atau berstatus tidak aktif.');
    });

    it('maps BARBER_NOT_FOUND code for haircut', () => {
      const err = { message: 'BARBER_NOT_FOUND' };
      expect(mapSaveHaircutRecordError(err)).toBe('Kapster tidak aktif atau tidak ditugaskan pada cabang ini.');
    });

    it('maps STYLE_NAME_REQUIRED code for haircut', () => {
      const err = { message: 'STYLE_NAME_REQUIRED' };
      expect(mapSaveHaircutRecordError(err)).toBe('Nama gaya pangkas rambut wajib diisi.');
    });

    it('maps zero points codes for loyalty points', () => {
      expect(mapAdjustPointsError({ message: 'POINTS_ZERO' })).toBe('Jumlah poin penyesuaian tidak boleh bernilai 0.');
      expect(mapAdjustPointsError({ message: 'POINTS_MUST_BE_NON_ZERO' })).toBe(
        'Jumlah poin penyesuaian tidak boleh bernilai 0.'
      );
    });

    it('maps INSUFFICIENT_POINTS code for loyalty points', () => {
      const err = { message: 'INSUFFICIENT_POINTS' };
      expect(mapAdjustPointsError(err)).toBe('Pengurangan poin melebihi saldo poin aktif pelanggan.');
    });

    it('maps REASON_REQUIRED code for loyalty points', () => {
      const err = { message: 'REASON_REQUIRED' };
      expect(mapAdjustPointsError(err)).toBe('Alasan penyesuaian poin wajib diisi.');
    });

    it('maps invalid returned balance for loyalty points', () => {
      const err = new Error('INVALID_BALANCE_RETURNED');
      expect(mapAdjustPointsError(err)).toBe('Gagal menyesuaikan poin: respon saldo dari server tidak valid.');
    });
  });

  describe('5. Load, Save Customer & Tier Error Mappers', () => {
    describe('mapLoadCustomerError', () => {
      it('maps permission denied cleanly', () => {
        const err = { code: '42501', message: 'permission denied for relation customers' };
        expect(mapLoadCustomerError(err)).toBe('Akses ditolak: Anda tidak memiliki izin untuk melihat data pelanggan.');
      });

      it('maps arbitrary errors to safe generic message', () => {
        const err = new Error('PG connection failed');
        expect(mapLoadCustomerError(err)).toBe(GENERIC_LOAD_CUSTOMER_ERROR_MESSAGE);
      });
    });

    describe('mapSaveCustomerError', () => {
      it('maps permission denied cleanly', () => {
        const err = { code: '42501', message: 'CUSTOMER_CREATE_FORBIDDEN' };
        expect(mapSaveCustomerError(err)).toBe(
          'Akses ditolak: Anda tidak memiliki izin untuk mendaftarkan atau memperbarui data pelanggan.'
        );
      });

      it('maps validation errors for name and phone', () => {
        expect(mapSaveCustomerError({ message: 'Nama pelanggan wajib diisi' })).toBe('Nama pelanggan wajib diisi.');
        expect(mapSaveCustomerError({ message: 'CUSTOMER_PHONE_REQUIRED' })).toBe('Nomor telepon pelanggan wajib diisi.');
      });

      it('maps duplicate phone constraint violation without leaking table name', () => {
        const err = {
          code: '23505',
          message: 'duplicate key value violates unique constraint "customers_phone_unique"',
        };
        const result = mapSaveCustomerError(err);
        expect(result).toBe('Nomor telepon pelanggan sudah terdaftar di sistem.');
        expect(result).not.toContain('customers_phone_unique');
        expect(result).not.toContain('23505');
      });

      it('maps tier and barber validations', () => {
        expect(mapSaveCustomerError({ message: 'INVALID_CUSTOMER_TIER' })).toBe(
          'Tingkatan (tier) loyalitas pelanggan tidak valid.'
        );
        expect(mapSaveCustomerError({ message: 'INVALID_PREFERRED_BARBER' })).toBe(
          'Kapster pilihan tidak valid atau tidak ditugaskan pada cabang ini.'
        );
      });

      it('falls back to safe generic message on unexpected errors', () => {
        expect(mapSaveCustomerError(new Error('Unknown crash'))).toBe(GENERIC_SAVE_CUSTOMER_ERROR_MESSAGE);
      });
    });

    describe('mapSaveTierError', () => {
      it('maps permission denied cleanly', () => {
        const err = { code: '42501', message: 'Akses ditolak' };
        expect(mapSaveTierError(err)).toBe('Akses ditolak: Anda tidak memiliki izin untuk mengubah aturan tier loyalitas.');
      });

      it('maps duplicate tier code or name constraint', () => {
        const err = { code: '23505', message: 'duplicate key value violates unique constraint "customer_tiers_code_key"' };
        expect(mapSaveTierError(err)).toBe('Nama atau kode aturan tier loyalitas sudah terdaftar.');
      });

      it('falls back to safe generic message on unexpected errors', () => {
        expect(mapSaveTierError(new Error('Network error'))).toBe(GENERIC_SAVE_TIER_ERROR_MESSAGE);
      });
    });
  });

  describe('6. Static Code Assertions on customers/page.tsx', () => {
    const pagePath = path.resolve(__dirname, '../app/customers/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf8');

    it('imports all safe error mappers', () => {
      expect(pageContent).toContain('mapSaveHaircutRecordError');
      expect(pageContent).toContain('mapAdjustPointsError');
      expect(pageContent).toContain('mapLoadCustomerError');
      expect(pageContent).toContain('mapSaveCustomerError');
      expect(pageContent).toContain('mapSaveTierError');
    });

    it('never concatenates raw err.message or rpcErr.message in handleSaveHaircutRecord', () => {
      const startIdx = pageContent.indexOf('const handleSaveHaircutRecord =');
      expect(startIdx).toBeGreaterThan(0);
      const endIdx = pageContent.indexOf('const handleAdjustPoints =', startIdx);
      expect(endIdx).toBeGreaterThan(startIdx);
      const block = pageContent.substring(startIdx, endIdx);

      expect(block).not.toContain('+ err.message');
      expect(block).not.toContain('+ err?.message');
      expect(block).not.toContain('+ error.message');
      expect(block).not.toContain('err.message ||');
      expect(block).toContain('mapSaveHaircutRecordError');
    });

    it('never concatenates raw err.message or rpcErr.message in handleAdjustPoints', () => {
      const startIdx = pageContent.indexOf('const handleAdjustPoints =');
      expect(startIdx).toBeGreaterThan(0);
      const endIdx = pageContent.indexOf('const handleFormSubmit =', startIdx);
      expect(endIdx).toBeGreaterThan(startIdx);
      const block = pageContent.substring(startIdx, endIdx);

      expect(block).not.toContain('+ err.message');
      expect(block).not.toContain('+ err?.message');
      expect(block).not.toContain('+ rpcErr.message');
      expect(block).not.toContain('rpcErr.message ||');
      expect(block).toContain('mapAdjustPointsError');
    });

    it('never concatenates raw err.message in loadCustomers, preserving console.error', () => {
      const startIdx = pageContent.indexOf('const loadCustomers =');
      expect(startIdx).toBeGreaterThan(0);
      const endIdx = pageContent.indexOf('const loadLoyaltyLedger =', startIdx);
      expect(endIdx).toBeGreaterThan(startIdx);
      const block = pageContent.substring(startIdx, endIdx);

      expect(block).not.toContain('+ (err.message');
      expect(block).not.toContain('+ err.message');
      expect(block).not.toContain('Error tidak diketahui');
      expect(block).toContain('console.error(');
      expect(block).toContain('mapLoadCustomerError');
    });

    it('never concatenates raw err.message in handleFormSubmit, preserving console.error', () => {
      const startIdx = pageContent.indexOf('const handleFormSubmit =');
      expect(startIdx).toBeGreaterThan(0);
      const endIdx = pageContent.indexOf('const handleUpdateTier =', startIdx);
      expect(endIdx).toBeGreaterThan(startIdx);
      const block = pageContent.substring(startIdx, endIdx);

      expect(block).not.toContain('+ err.message');
      expect(block).toContain('console.error(');
      expect(block).toContain('mapSaveCustomerError');
    });

    it('never concatenates raw err.message in handleUpdateTier, preserving console.error', () => {
      const startIdx = pageContent.indexOf('const handleUpdateTier =');
      expect(startIdx).toBeGreaterThan(0);
      const endIdx = pageContent.indexOf('return (', startIdx);
      expect(endIdx).toBeGreaterThan(startIdx);
      const block = pageContent.substring(startIdx, endIdx);

      expect(block).not.toContain('+ err.message');
      expect(block).toContain('console.error(');
      expect(block).toContain('mapSaveTierError');
    });

    it('returns immediately on RPC error before setting success notification', () => {
      const haircutIdx = pageContent.indexOf('const handleSaveHaircutRecord =');
      const haircutEnd = pageContent.indexOf('const handleAdjustPoints =', haircutIdx);
      const haircutBlock = pageContent.substring(haircutIdx, haircutEnd);

      const ifErrorIdx = haircutBlock.indexOf('if (error)');
      const successIdx = haircutBlock.indexOf("type: 'SUCCESS'");
      expect(ifErrorIdx).toBeLessThan(successIdx);

      const errorBranch = haircutBlock.substring(ifErrorIdx, successIdx);
      expect(errorBranch).toContain('return;');

      const pointsIdx = pageContent.indexOf('const handleAdjustPoints =');
      const pointsEnd = pageContent.indexOf('const handleFormSubmit =', pointsIdx);
      const pointsBlock = pageContent.substring(pointsIdx, pointsEnd);

      const ifRpcErrIdx = pointsBlock.indexOf('if (rpcErr)');
      const pointsSuccessIdx = pointsBlock.indexOf("type: 'SUCCESS'");
      expect(ifRpcErrIdx).toBeLessThan(pointsSuccessIdx);

      const pointsErrorBranch = pointsBlock.substring(ifRpcErrIdx, pointsSuccessIdx);
      expect(pointsErrorBranch).toContain('return;');
    });
  });
});
