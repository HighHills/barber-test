-- 20260904000001_extensions_and_enums.sql
-- Extension and Core Enums for Barbershop Operating System

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Employee Leave
CREATE TYPE leave_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- Inventory Movements
CREATE TYPE movement_type_enum AS ENUM (
  'OPENING',
  'PURCHASE',
  'SALE',
  'SERVICE_CONSUMPTION',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'RETURN_IN',
  'RETURN_OUT'
);

-- Purchasing
CREATE TYPE purchase_status_enum AS ENUM ('DRAFT', 'RECEIVED', 'CANCELLED');
CREATE TYPE purchase_payment_status_enum AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- Adjustments & Transfers
CREATE TYPE stock_adjustment_status_enum AS ENUM ('DRAFT', 'APPROVED', 'APPLIED', 'CANCELLED');
CREATE TYPE stock_transfer_status_enum AS ENUM ('REQUESTED', 'APPROVED', 'COMPLETED', 'CANCELLED');

-- Cash Sessions & POS
CREATE TYPE cash_session_status_enum AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE sale_status_enum AS ENUM ('COMPLETED', 'REFUNDED', 'VOIDED');
CREATE TYPE sale_item_type_enum AS ENUM ('SERVICE', 'PRODUCT');
CREATE TYPE commission_type_enum AS ENUM ('PERCENTAGE', 'FIXED', 'TIERED');
CREATE TYPE commission_status_enum AS ENUM ('EARNED', 'PAYABLE', 'PAID', 'VOIDED');
CREATE TYPE refund_type_enum AS ENUM ('FULL', 'PARTIAL');
CREATE TYPE refund_status_enum AS ENUM ('COMPLETED', 'CANCELLED');

-- Bookings & Queues
CREATE TYPE appointment_status_enum AS ENUM (
  'PENDING',
  'CONFIRMED',
  'ARRIVED',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
);

CREATE TYPE queue_status_enum AS ENUM (
  'WAITING',
  'CALLED',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
);

-- Finance & Double-Entry Accounting
CREATE TYPE account_type_enum AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE normal_balance_enum AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE period_status_enum AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE journal_status_enum AS ENUM ('DRAFT', 'POSTED', 'REVERSED');
