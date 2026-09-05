import { z } from 'zod';

export const createJournalLineSchema = z.object({
  financial_account_id: z.string().uuid(),
  outlet_id: z.string().uuid().nullable().optional(),
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
  description: z.string().nullable().optional(),
}).refine(
  (data) => (data.debit > 0 && data.credit === 0) || (data.debit === 0 && data.credit > 0),
  {
    message: 'A journal line must have either debit > 0 OR credit > 0, never both or neither',
  }
);

export const createJournalEntrySchema = z.object({
  journal_date: z.string(),
  reference_type: z.string().nullable().optional(),
  reference_id: z.string().uuid().nullable().optional(),
  description: z.string().min(1, 'Description is required'),
  lines: z.array(createJournalLineSchema).min(2, 'Journal entry must have at least 2 lines'),
}).refine(
  (data) => {
    const totalDebit = data.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = data.lines.reduce((sum, line) => sum + line.credit, 0);
    // Tolerate minute float difference below 0.0001
    return Math.abs(totalDebit - totalCredit) < 0.0001;
  },
  {
    message: 'Double-entry invariant violated: Total Debit must equal Total Credit',
  }
);

export type CreateJournalLineInput = z.infer<typeof createJournalLineSchema>;
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;
