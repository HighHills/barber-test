# Graph Report - barbershopapp  (2026-10-08)

## Corpus Check
- 334 files · ~336,475 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 2196 nodes · 3954 edges · 260 communities (113 shown, 147 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d6c63dc1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ref_vitest
- types/pos.ts
- staff-schedule-operation-errors.ts
- usePos
- formatCurrency
- pos-context.tsx
- accounting/page.tsx
- employee-leave-panel.tsx
- 20260904000013_security_transaction_hardening.sql
- analytics/page.tsx
- pos.schema.ts
- contrast-check.py
- phase-0.5-migration-export.sql
- purchases/page.tsx
- PosProvider
- commissions/page.tsx
- customers/page.tsx
- 20260904000012_security_rls_and_audit_guards.sql
- business-rules/package.json
- 20260904000006_pos_sales_and_refunds.sql
- web/package.json
- compilerOptions
- 20260904000014_crm_loyalty_and_memberships.sql
- mobile/package.json
- accounting-service.ts
- types/tsconfig.json
- expo
- Tone & Voice
- package.json
- compilerOptions
- 20260904000005_inventory_and_purchases.sql
- checkout-modal.tsx
- PublicBookingPage
- 20260904000010_notifications_and_indexes.sql
- receipt-modal.tsx
- validators/package.json
- inventory.ts
- outlets
- receive_purchase_order
- expenses
- cart-calculator.ts
- src/pos.ts
- tasks
- dependencies
- dependencies
- inventory/page.tsx
- settings.ts
- employee-schedule-panel.tsx
- settings-shell.tsx
- 20261008112725_restore_untracked_application_rpcs.sql
- types/src/index.ts
- sales
- products
- antislop-layoutmobile
- process_pos_sale
- devDependencies
- types/package.json
- profiles
- public.save_commission_rule
- commissions
- 20260904000009_double_entry_finance.sql
- 20260904000015_executive_analytics_views.sql
- appointments
- public._legacy_create_public_booking
- public.create_walk_in_queue
- createClient
- web/tsconfig.json
- 20260904000002_core_and_rbac.sql
- 20260904000004_catalog_and_pricing.sql
- public.check_in_appointment_to_queue
- payment-methods-panel.tsx
- customer-operation-errors.ts
- catalog.ts
- finance.ts
- purchases
- 20260904000003_employees_and_customers.sql
- queue/page.tsx
- core.ts
- 20260907000031_public_booking_phone_rate_limit.sql
- 20260907000037_loyalty_refund_void_reversal.sql
- public.create_appointment
- 20260911000011_phase_2b_business_rpc_outlet_authorization.sql
- scripts
- walkin-modal.tsx
- commission-rule-service.ts
- public._legacy_create_public_booking
- public.process_sale_refund
- 20260904000020_public_booking_portal.sql
- 20260907000024_transaction_actor_and_transfer_boundary_hardening.sql
- scripts
- mobile/tsconfig.json
- employees.ts
- config-typescript/package.json
- bookings.ts
- 20260918070000_inventory_draft_write_boundary_hardening.sql
- public.get_public_booking_slots
- devDependencies
- index.tsx
- extends
- create_public_booking
- audit.ts
- uq_cash_registers_one_active_per_outlet
- next.config.mjs
- route.ts
- antislop-human
- ref_react
- stitch_preview/DESIGN.md
- Group 1: Hard Gate (absolute, no exceptions)
- Barbershop Operating System — Design System & Visual Direction (DESIGN.md)
- book/page.tsx
- Group 2: Purpose-Gate (technique allowed, purpose required)
- Layout & Components
- Decorative Elements
- Visual & Color
- Group 3: Quality Locks (consistency)
- generateSaleEscPos
- Instalasi pelanggan baru (1 bisnis = 1 proyek Supabase + 1 APK)
- antislop
- Part 1: AI Slop Patterns (Warning Signs)
- App & Dashboard
- react-native.json
- public.queue_sale_links
- antislop-ui
- business-rules/tsconfig.json
- validators/tsconfig.json
- The Craftsmanship Standard
- Delivery Gate (Mandatory)
- _layout.tsx
- customer-service.ts
- Part 3: Liveliness Toolkit
- Structural & Flow
- tailwind.config.ts
- Gemini CLI Instructions
- AGENTS.md
- refund-service.ts
- BarberEmployee

## God Nodes (most connected - your core abstractions)
1. `usePos()` - 121 edges
2. `lucide-react` - 87 edges
3. `formatCurrency()` - 75 edges
4. `formatDateTime()` - 29 edges
5. `PosProvider()` - 28 edges
6. `PosHeader()` - 27 edges
7. `createClient()` - 21 edges
8. `OutletItem` - 21 edges
9. `outlets` - 21 edges
10. `profiles` - 21 edges

## Surprising Connections (you probably didn't know these)
- `10. Settings Application Shell Standard` --references--> `PosHeader()`  [INFERRED]
  DESIGN.md → apps/web/src/components/pos/pos-header.tsx
- `usePosCart()` --calls--> `calculateCart()`  [EXTRACTED]
  apps/web/src/hooks/use-pos-cart.ts → packages/business-rules/src/cart-calculator.ts
- `CommissionRuleModalProps` --references--> `CatalogItem`  [EXTRACTED]
  apps/web/src/components/commissions/commission-rule-modal.tsx → apps/web/src/types/pos.ts
- `CartPanelProps` --references--> `CartCalculationResult`  [EXTRACTED]
  apps/web/src/components/pos/cart-panel.tsx → packages/business-rules/src/cart-calculator.ts
- `CatalogItemModalProps` --references--> `CatalogItem`  [EXTRACTED]
  apps/web/src/components/pos/catalog-item-modal.tsx → apps/web/src/types/pos.ts

## Import Cycles
- None detected.

## Communities (260 total, 147 thin omitted)

### Community 0 - "ref_vitest"
Cohesion: 0.07
Nodes (20): CashReconciliationPanelProps, CloseSessionReconcileModal(), CloseSessionReconcileModalProps, AccountingOperation, mapAccountingOperationError(), rawMessage(), mapAnalyticsOperationError(), rawMessage() (+12 more)

### Community 1 - "types/pos.ts"
Cohesion: 0.12
Nodes (23): BARBER_OPERATIONAL_ERROR_CODE, BARBER_OPERATIONAL_ERROR_PREFIX, BarberOperationalError, parseAuthoritativeBarbers(), ParseBarbersResult, BARBER_AVAILABILITY_BADGE_CLASSES, BARBER_AVAILABILITY_LABELS, BARBER_AVAILABILITY_STATUSES (+15 more)

### Community 2 - "staff-schedule-operation-errors.ts"
Cohesion: 0.09
Nodes (38): EmployeeFormModal(), EmployeeFormModalProps, positions, EmployeeOutletAssignmentModal(), EmployeeOutletAssignmentModalProps, StaffAssignmentRow, StaffEmployeeRow, StaffOutletRelation (+30 more)

### Community 3 - "usePos"
Cohesion: 0.17
Nodes (18): CashierSubaccountModal(), CashierSubaccountModalProps, LoginDialog(), BarberSelectModal(), CartPanel(), CashSessionModal(), CashSessionModalProps, CatalogGrid() (+10 more)

### Community 4 - "formatCurrency"
Cohesion: 0.13
Nodes (24): HistoryCustomer, HistoryPage(), HistoryPayment, HistoryProfile, HistoryRefund, HistoryRefundItem, HistorySale, HistorySaleItem (+16 more)

### Community 5 - "pos-context.tsx"
Cohesion: 0.23
Nodes (12): NavGroupConfig, NavItemConfig, PosHeaderProps, defaultSettings, PosContext, PosContextType, BusinessSettings, CashierProfile (+4 more)

### Community 6 - "accounting/page.tsx"
Cohesion: 0.15
Nodes (20): AccountingContent(), AccountingPage(), BalanceSheetView(), BalanceSheetViewProps, CashReconciliationPanel(), FinancialPeriodsManager(), FinancialPeriodsManagerProps, GeneralLedgerView() (+12 more)

### Community 7 - "employee-leave-panel.tsx"
Cohesion: 0.12
Nodes (27): EmployeeLeaveAssignmentRow, EmployeeLeaveEmployeeRow, EmployeeLeaveOutletRelation, EmployeeLeavePanelProps, LeaveEmployeeRelation, LeaveQueryResultRow, LeaveFormModal(), LeaveFormModalProps (+19 more)

### Community 8 - "20260904000013_security_transaction_hardening.sql"
Cohesion: 0.07
Nodes (6): current_user_has_permission(), idx_sale_refund_payments_refund, _internal_post_journal_entry(), process_pos_sale(), resolve_commission_rule(), sale_refund_payments

### Community 9 - "analytics/page.tsx"
Cohesion: 0.10
Nodes (27): AnalyticsCatalogRelation, AnalyticsContent(), AnalyticsEmployee, AnalyticsQueue, AnalyticsSale, AnalyticsSaleItem, PeriodFilter, BarberProductivityRank() (+19 more)

### Community 10 - "pos.schema.ts"
Cohesion: 0.08
Nodes (23): createAppointmentSchema, createPublicGuestBookingSchema, createProductSchema, createServiceConsumptionSchema, createServiceSchema, setProductOutletPriceSchema, setServiceOutletPriceSchema, CreateJournalEntryInput (+15 more)

### Community 11 - "contrast-check.py"
Cohesion: 0.13
Nodes (18): contrast_ratio(), linearize(), luminance(), main(), parse_hex(), parse_pairing(), parse_reference_rows(), reference_doc_path() (+10 more)

### Community 12 - "phase-0.5-migration-export.sql"
Cohesion: 0.11
Nodes (15): audit_logs, financial_accounts, idx_audit_logs_entity, idx_journal_entries_date, idx_journal_entries_ref, idx_journal_lines_account, idx_journal_lines_entry, _internal_post_journal_entry() (+7 more)

### Community 13 - "purchases/page.tsx"
Cohesion: 0.16
Nodes (22): PurchasesContent(), PurchasesPage(), PurchaseOrderModal(), PurchaseOrderModalProps, SelectedProductRow, SupplierFormModal(), SupplierFormModalProps, SupplierPaymentModal() (+14 more)

### Community 14 - "PosProvider"
Cohesion: 0.13
Nodes (21): AnalyticsPage(), ExpenseQueryRow, ExpenseRelation, ExpensesContent(), ExpensesPage(), JournalNumberRow, HomePage(), SettingsPage() (+13 more)

### Community 15 - "commissions/page.tsx"
Cohesion: 0.13
Nodes (23): catalogSellingPrice(), CommissionCatalogOutlet, CommissionCatalogRow, CommissionLedgerRow, CommissionNamedRelation, CommissionRuleRow, CommissionsContent(), CommissionsPage() (+15 more)

### Community 16 - "customers/page.tsx"
Cohesion: 0.22
Nodes (15): CustomersContent(), CustomersPage(), CustomerCrmTableProps, CustomerDetailModal(), CustomerDetailModalProps, CustomerFormModal(), CustomerFormModalProps, LoyaltyLedgerView() (+7 more)

### Community 17 - "20260904000012_security_rls_and_audit_guards.sql"
Cohesion: 0.13
Nodes (9): current_user_has_outlet_access(), current_user_has_permission(), get_current_profile_id(), is_owner_or_admin(), prevent_posted_journal_line_modification(), trg_audit_logs_immutable, trg_inventory_movements_immutable, trg_journal_entries_immutable (+1 more)

### Community 18 - "business-rules/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @barber/types, devDependencies, @barber/config-typescript, @electric-sql/pglite, typescript, vitest, @barber/config-typescript (+11 more)

### Community 19 - "20260904000006_pos_sales_and_refunds.sql"
Cohesion: 0.18
Nodes (13): cash_registers, cash_sessions, idx_sale_items_barber, idx_sale_items_sale, idx_sale_payments_sale, idx_sales_customer, idx_sales_outlet_sold_at, payment_methods (+5 more)

### Community 20 - "web/package.json"
Cohesion: 0.08
Nodes (23): @barber/business-rules, @barber/config-typescript, @barber/types, @barber/validators, react, @supabase/supabase-js, @types/react, typescript (+15 more)

### Community 21 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module (+11 more)

### Community 22 - "20260904000014_crm_loyalty_and_memberships.sql"
Cohesion: 0.16
Nodes (10): award_loyalty_points(), customer_haircut_history, customer_loyalty_ledger, customer_tiers, idx_haircut_history_customer, idx_loyalty_ledger_created, idx_loyalty_ledger_customer, is_owner_or_admin() (+2 more)

### Community 23 - "mobile/package.json"
Cohesion: 0.11
Nodes (17): @barber/business-rules, @barber/config-typescript, @barber/types, @barber/validators, react, @supabase/supabase-js, @types/react, typescript (+9 more)

### Community 24 - "accounting-service.ts"
Cohesion: 0.13
Nodes (16): accountingService, ALLOWED_ACCOUNT_TYPES, ALLOWED_NORMAL_BALANCES, parseAccountType(), parseCashSessionStatus(), parseFinancialPeriodStatus(), parseNormalBalance(), parseStrictAuthoritativeNonNegativeNumber() (+8 more)

### Community 25 - "types/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, @barber/config-typescript/base.json

### Community 26 - "expo"
Cohesion: 0.11
Nodes (17): backgroundColor, adaptiveIcon, expo, android, icon, ios, name, orientation (+9 more)

### Community 27 - "Tone & Voice"
Cohesion: 0.05
Nodes (38): Actorless Passive, All-Caps Emphasis, antislop-copywriting, Aphorism Formulas, Boldface Overuse, Chatbot Closers, Copywriting Skill Checklist, Draft, audit, final (+30 more)

### Community 28 - "package.json"
Cohesion: 0.11
Nodes (18): description, devDependencies, turbo, typescript, engines, node, typescript, name (+10 more)

### Community 29 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, incremental, jsx, lib, module, moduleResolution, plugins, extends (+2 more)

### Community 30 - "20260904000005_inventory_and_purchases.sql"
Cohesion: 0.24
Nodes (12): idx_inv_mov_outlet_prod, idx_inv_mov_reference, inventory_movements, outlet_inventory, purchase_items, purchases, stock_adjustment_items, stock_adjustments (+4 more)

### Community 31 - "checkout-modal.tsx"
Cohesion: 0.17
Nodes (14): CartPanelProps, CheckoutModal(), CheckoutModalProps, SplitPaymentRow, CustomerSelectModalProps, mapPosHistoryError(), mapPosOperationError(), messageOf() (+6 more)

### Community 32 - "PublicBookingPage"
Cohesion: 0.24
Nodes (16): BookingErrorAlert(), PublicBookingPage(), loadOutlets(), BookingErrorContext, BookingErrorInfo, BookingErrorKind, BookingTiming, calculateBookingTiming() (+8 more)

### Community 33 - "20260904000010_notifications_and_indexes.sql"
Cohesion: 0.13
Nodes (9): idx_audit_logs_entity, idx_notifications_user_unread, idx_outlet_inventory_low_stock, idx_outlets_active, idx_products_barcode, idx_products_sku, idx_sales_status, idx_services_code (+1 more)

### Community 34 - "receipt-modal.tsx"
Cohesion: 0.18
Nodes (19): ReceiptModal(), ReceiptModalProps, BluetoothPrinterConnection, connectBluetoothPrinter(), isBluetoothSupported(), Navigator, PRINTER_CHARACTERISTICS, PRINTER_SERVICES (+11 more)

### Community 35 - "validators/package.json"
Cohesion: 0.11
Nodes (17): dependencies, zod, devDependencies, @barber/config-typescript, @barber/types, typescript, @barber/config-typescript, @barber/types (+9 more)

### Community 36 - "inventory.ts"
Cohesion: 0.12
Nodes (15): InventoryMovement, MovementType, OutletInventory, Purchase, PurchaseItem, PurchasePaymentStatus, PurchaseStatus, StockAdjustment (+7 more)

### Community 37 - "outlets"
Cohesion: 0.18
Nodes (16): appointments, commission_rules, customers, employee_leaves, employee_outlets, employee_schedules, employees, idx_appointments_barber_start (+8 more)

### Community 38 - "receive_purchase_order"
Cohesion: 0.19
Nodes (3): receive_purchase_order(), record_supplier_payment(), upsert_supplier()

### Community 39 - "expenses"
Cohesion: 0.20
Nodes (8): expense_categories, expenses, idx_expense_categories_code, idx_expenses_category, idx_expenses_date, idx_expenses_outlet, record_expense(), public.void_expense()

### Community 41 - "cart-calculator.ts"
Cohesion: 0.16
Nodes (13): calculateCart(), CalculatedItem, CartCalculatorParams, CartItemInput, CustomerTierDiscountInput, BalanceCheckResult, JournalLineCheck, validateJournalBalance() (+5 more)

### Community 42 - "src/pos.ts"
Cohesion: 0.13
Nodes (14): CashRegister, CashSession, CashSessionStatus, PaymentMethod, RefundStatus, RefundType, Sale, SaleItem (+6 more)

### Community 43 - "tasks"
Cohesion: 0.13
Nodes (14): dependsOn, outputs, dependsOn, cache, persistent, dependsOn, $schema, tasks (+6 more)

### Community 44 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, @barber/business-rules, @barber/types, @barber/validators, expo, expo-constants, expo-linking, expo-router (+6 more)

### Community 45 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, @barber/business-rules, @barber/types, @barber/validators, class-variance-authority, clsx, lucide-react, next (+6 more)

### Community 46 - "inventory/page.tsx"
Cohesion: 0.19
Nodes (16): InventoryContent(), InventoryPage(), QUICK_ADJUSTMENT_REASONS, StockAdjustmentModal(), StockAdjustmentModalProps, StockTransferModal(), StockTransferModalProps, ErrorLike (+8 more)

### Community 47 - "settings.ts"
Cohesion: 0.10
Nodes (28): CustomRoleFormModal(), CustomRoleFormModalProps, ProductCategoryModalProps, ProductConversionModal(), ProductConversionModalProps, COMMON_BASE_UNITS, OutletPriceState, ProductFormModal() (+20 more)

### Community 48 - "employee-schedule-panel.tsx"
Cohesion: 0.19
Nodes (11): EmployeeScheduleAssignmentRow, EmployeeScheduleEmployeeRow, EmployeeScheduleOutletRelation, EmployeeSchedulePanel(), EmployeeSchedulePanelProps, EMPLOYEE_SCHEDULE_WEEK_DAYS, EmployeeScheduleRowForMapping, formatScheduleTime() (+3 more)

### Community 50 - "settings-shell.tsx"
Cohesion: 0.17
Nodes (12): BusinessSettingsPanel(), BusinessSettingsPanelProps, defaultFormData, EmployeeLeavePanel(), ProductCategoriesPanel(), ProductCategoriesPanelProps, ProductCategoryModal(), SidebarGroup (+4 more)

### Community 52 - "types/src/index.ts"
Cohesion: 0.23
Nodes (8): CommissionResolutionResult, resolveCommission(), ResolveCommissionParams, Commission, CommissionRule, CommissionStatus, Customer, CommissionType

### Community 53 - "sales"
Cohesion: 0.16
Nodes (14): cash_registers, cash_sessions, commissions, idx_commissions_employee_earned, idx_commissions_status, idx_sale_items_barber, idx_sale_items_sale, idx_sales_customer (+6 more)

### Community 54 - "products"
Cohesion: 0.14
Nodes (14): idx_inv_mov_outlet_prod, idx_inv_mov_reference, idx_products_barcode, idx_products_sku, inventory_movements, product_categories, product_outlets, product_unit_conversions (+6 more)

### Community 55 - "antislop-layoutmobile"
Cohesion: 0.06
Nodes (30): 100vh Sections, antislop-layoutmobile, Bottom Nav That Eats Content, Breakpoint Driven by Device List, Breakpoints, Columns That Don't Collapse, Desktop-Only Layout, Desktop-Sized Everything (+22 more)

### Community 56 - "process_pos_sale"
Cohesion: 0.17
Nodes (10): business_settings, business_settings_singleton_idx, idx_outlet_inventory_low_stock, idx_services_code, outlet_inventory, process_pos_sale(), service_categories, service_consumptions (+2 more)

### Community 57 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, autoprefixer, @barber/config-typescript, eslint, eslint-config-next, postcss, tailwindcss, @types/node (+4 more)

### Community 58 - "types/package.json"
Cohesion: 0.15
Nodes (12): devDependencies, @barber/config-typescript, typescript, @barber/config-typescript, typescript, main, name, private (+4 more)

### Community 59 - "profiles"
Cohesion: 0.29
Nodes (12): current_user_has_outlet_access(), current_user_has_permission(), financial_periods, get_current_profile_id(), idx_notifications_user_unread, is_owner_or_admin(), notifications, permissions (+4 more)

### Community 61 - "commissions"
Cohesion: 0.24
Nodes (5): commission_rules, commissions, idx_commission_rules_lookup, idx_commissions_employee_earned, idx_commissions_status

### Community 62 - "20260904000009_double_entry_finance.sql"
Cohesion: 0.27
Nodes (8): financial_accounts, financial_periods, idx_journal_entries_date, idx_journal_entries_ref, idx_journal_lines_account, idx_journal_lines_entry, journal_entries, journal_lines

### Community 63 - "20260904000015_executive_analytics_views.sql"
Cohesion: 0.21
Nodes (6): idx_appointments_start_status, idx_queues_started_status, idx_sale_items_analytics_lookup, idx_sale_items_barber_revenue, idx_sales_analytics_lookup, view_executive_outlet_performance

### Community 64 - "appointments"
Cohesion: 0.31
Nodes (5): appointments, idx_appointments_barber_start, idx_appointments_outlet_start, idx_queues_outlet_status, queues

### Community 68 - "createClient"
Cohesion: 0.16
Nodes (14): loadOutletData(), fetchPublicBarbers(), fetchPublicServices(), createClient(), getSupabaseEnv(), getSupabase(), AuthoritativeAppointment, CreateAppointmentInput (+6 more)

### Community 69 - "web/tsconfig.json"
Cohesion: 0.20
Nodes (9): compilerOptions, allowJs, baseUrl, noEmit, paths, exclude, extends, include (+1 more)

### Community 70 - "20260904000002_core_and_rbac.sql"
Cohesion: 0.36
Nodes (9): audit_logs, business_settings, business_settings_singleton_idx, outlets, permissions, profiles, role_permissions, roles (+1 more)

### Community 71 - "20260904000004_catalog_and_pricing.sql"
Cohesion: 0.38
Nodes (8): product_categories, product_outlets, product_unit_conversions, products, service_categories, service_consumptions, service_outlets, services

### Community 73 - "payment-methods-panel.tsx"
Cohesion: 0.39
Nodes (7): PAYMENT_TYPES, PaymentMethodModal(), PaymentMethodModalProps, PaymentMethodsPanel(), PaymentMethodsPanelProps, FinancialAccountItem, PaymentMethodItem

### Community 74 - "customer-operation-errors.ts"
Cohesion: 0.26
Nodes (15): BLOCKED_HAIRCUT_RPC_MESSAGE, BLOCKED_POINTS_RPC_MESSAGE, ErrorLike, extractErrorInfo(), GENERIC_HAIRCUT_ERROR_MESSAGE, GENERIC_LOAD_CUSTOMER_ERROR_MESSAGE, GENERIC_POINTS_ERROR_MESSAGE, GENERIC_SAVE_CUSTOMER_ERROR_MESSAGE (+7 more)

### Community 75 - "catalog.ts"
Cohesion: 0.22
Nodes (8): Product, ProductCategory, ProductOutlet, ProductUnitConversion, Service, ServiceCategory, ServiceConsumption, ServiceOutlet

### Community 76 - "finance.ts"
Cohesion: 0.22
Nodes (8): AccountType, FinancialAccount, FinancialPeriod, JournalEntry, JournalLine, JournalStatus, NormalBalance, PeriodStatus

### Community 77 - "purchases"
Cohesion: 0.25
Nodes (9): idx_sale_payments_sale, idx_sale_refund_payments_refund, payment_methods, purchase_items, purchases, sale_payments, sale_refund_payments, supplier_payments (+1 more)

### Community 78 - "20260904000003_employees_and_customers.sql"
Cohesion: 0.42
Nodes (6): customers, employee_leaves, employee_outlets, employee_schedules, employees, idx_customers_phone

### Community 79 - "queue/page.tsx"
Cohesion: 0.27
Nodes (12): QueueManagementContent(), QueuePage(), AppointmentCalendar(), AppointmentCalendarProps, AppointmentModal(), QueueBoard(), CheckInValidationResult, mapAppointmentCheckInError() (+4 more)

### Community 80 - "core.ts"
Cohesion: 0.25
Nodes (7): BusinessSettings, Outlet, Permission, Profile, Role, RolePermission, UserRole

### Community 81 - "20260907000031_public_booking_phone_rate_limit.sql"
Cohesion: 0.32
Nodes (4): public._check_public_booking_phone_rate_limit(), public._legacy_create_public_booking(), public.public_booking_phone_limits, public._record_public_booking_phone_success()

### Community 82 - "20260907000037_loyalty_refund_void_reversal.sql"
Cohesion: 0.32
Nodes (3): idx_loyalty_ledger_refund_id, uq_loyalty_ledger_refund_event, uq_loyalty_ledger_void_event

### Community 84 - "20260911000011_phase_2b_business_rpc_outlet_authorization.sql"
Cohesion: 0.29
Nodes (3): public.receive_purchase_order(), public.record_expense(), public.record_supplier_payment()

### Community 85 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, check-types, dev, lint, start, test

### Community 86 - "walkin-modal.tsx"
Cohesion: 0.20
Nodes (11): BarberSelectModalProps, CatalogGridProps, AppointmentModalProps, QueueBoardProps, WalkinModal(), WalkinModalProps, parseBarberOperationalError(), appointmentService (+3 more)

### Community 87 - "commission-rule-service.ts"
Cohesion: 0.21
Nodes (14): AuthoritativeCommissionRule, CommissionType, DeleteCommissionRuleResult, getSupabase(), parseAuthoritativeCommissionRule(), parseDeleteCommissionRuleResult(), parseSetCommissionRuleActiveResult(), parseStrictAuthoritativeUUID() (+6 more)

### Community 93 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, android, check-types, ios, start, web

### Community 94 - "mobile/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, paths, extends, include, @barber/config-typescript/react-native.json

### Community 95 - "employees.ts"
Cohesion: 0.33
Nodes (5): Employee, EmployeeLeave, EmployeeOutlet, EmployeeSchedule, LeaveStatus

### Community 96 - "config-typescript/package.json"
Cohesion: 0.40
Nodes (4): files, name, private, version

### Community 97 - "bookings.ts"
Cohesion: 0.40
Nodes (4): Appointment, AppointmentStatus, Queue, QueueStatus

### Community 102 - "devDependencies"
Cohesion: 0.50
Nodes (4): devDependencies, @barber/config-typescript, @types/react, typescript

### Community 104 - "extends"
Cohesion: 0.33
Nodes (5): extends, rules, @typescript-eslint/no-explicit-any, next/core-web-vitals, next/typescript

### Community 206 - "route.ts"
Cohesion: 0.15
Nodes (14): deploymentConfig(), dynamic, GET(), headers, POST(), runtime, previous, metadata (+6 more)

### Community 223 - "antislop-human"
Cohesion: 0.10
Nodes (20): antislop-human, Broken Tab Order, Color & Contrast, Color-Only Feedback, Focus & States, How to use this skill, Human Skill Checklist, Keyboard (+12 more)

### Community 224 - "ref_react"
Cohesion: 0.13
Nodes (24): CreateSubaccountModal(), CreateSubaccountModalProps, OutletFormModal(), OutletFormModalProps, OutletSettingsPanel(), OutletSettingsPanelProps, ServiceCategoriesPanel(), ServiceCategoriesPanelProps (+16 more)

### Community 225 - "stitch_preview/DESIGN.md"
Cohesion: 0.11
Nodes (17): Action & Status, Brand & Style, Breakpoints & Grid Models, Buttons, Cards & Service Tiles, Checkboxes & Segmented Controls, Colors, Components (+9 more)

### Community 226 - "Group 1: Hard Gate (absolute, no exceptions)"
Cohesion: 0.11
Nodes (18): Group 1: Hard Gate (absolute, no exceptions), R-02 — Copywriting, R-03 — Mobile Responsiveness, R-17 — Data & Numbers, R-18 — Testimonials, R-23 — Clarification & Visual Assets, R-24 — Navigation, R-25 — Color Contrast (+10 more)

### Community 227 - "Barbershop Operating System — Design System & Visual Direction (DESIGN.md)"
Cohesion: 0.13
Nodes (14): 10. Settings Application Shell Standard, 1. Product Identity, 2. Core Personality, 3. The Product Experience: "One Cohesive System", 4.1. Application Shell Identity, 4.2. Intentional Accent: Amber / Gold, 4.3. Operational Content Surfaces, 4. Visual Direction & Color Palette (+6 more)

### Community 228 - "book/page.tsx"
Cohesion: 0.33
Nodes (11): buildWhatsAppTicketUrl(), classifyBookingError(), fetchPublicAvailableSlots(), formatWhatsAppPhone(), submitPublicBooking(), BookingConfirmation, BookingTimeSlot, PublicBarber (+3 more)

### Community 229 - "Group 2: Purpose-Gate (technique allowed, purpose required)"
Cohesion: 0.15
Nodes (13): Group 2: Purpose-Gate (technique allowed, purpose required), R-01 — Color & Gradients, R-04 — Icons, R-06 — Typography, R-07 — Background, R-08 — Button Arrows, R-09 — Badges, R-10 — Glassmorphism (+5 more)

### Community 230 - "Layout & Components"
Cohesion: 0.18
Nodes (11): 4-Column Template Footer, Bento Grid, Copy-Paste Feature Cards, Demo Without a Product, "How It Works" Always 3 Steps, Layout & Components, Monotonous Template Layout, "Most Popular" Pricing Card (+3 more)

### Community 231 - "Decorative Elements"
Cohesion: 0.18
Nodes (11): AI Capsule Badges, Colored Left Stripe, Decorative Elements, Decorative Status Dot, Emoji as Decoration, Fake Terminal Window, Generic AI Icons, Generic AI Typography (+3 more)

### Community 232 - "Visual & Color"
Cohesion: 0.18
Nodes (11): Background Grid, Dark Mode Default for No Reason, Excessive Accent Color, Excessive Border Radius, Excessive Glassmorphism, Generic Blue-Purple Gradient, Glow Everywhere, Overly Soft Shadows (+3 more)

### Community 233 - "Group 3: Quality Locks (consistency)"
Cohesion: 0.20
Nodes (10): Group 3: Quality Locks (consistency), R-05 — Layout & Page Structure, R-11 — Border Radius, R-15 — CTA (Call to Action), R-16 — Copywriting & Buzzwords, R-20 — Visual Identity, R-21 — Dark Mode, R-29 — Color Palette (+2 more)

### Community 235 - "Instalasi pelanggan baru (1 bisnis = 1 proyek Supabase + 1 APK)"
Cohesion: 0.33
Nodes (5): Deploy web dan bangun APK, Instalasi pelanggan baru (1 bisnis = 1 proyek Supabase + 1 APK), Pemeriksaan sebelum serah terima, Prasyarat operator, Satu perintah provisioning

### Community 236 - "antislop"
Cohesion: 0.25
Nodes (7): antislop, Core Principle, First-Run Install Wizard, Functional Patterns, Part 2: Mandatory Rules (R-01 to R-38, grouped), Two Usage Modes, What This Is (and What It Isn't)

### Community 237 - "Part 1: AI Slop Patterns (Warning Signs)"
Cohesion: 0.25
Nodes (8): Accessibility, Copywriting & Content, Decorative Elements, Functionality & Content, Identity & Originality, Layout & Components, Part 1: AI Slop Patterns (Warning Signs), Visual & Color

### Community 238 - "App & Dashboard"
Cohesion: 0.25
Nodes (8): App & Dashboard, Charts Without a Question, Default Dashboard Shell, Filler Activity Feed, Filler Data in Fields and Columns, Generic Table Columns, Placeholder Empty and Loading States, Stat Cards With Invented Numbers

### Community 239 - "react-native.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, module, moduleResolution, extends, ./base.json, $schema

### Community 241 - "antislop-ui"
Cohesion: 0.29
Nodes (6): antislop-ui, Endless Pulses and Loops, How to use this skill, Motion, Template Animations Stacked, UI Skill Checklist

### Community 242 - "business-rules/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, @barber/config-typescript/base.json

### Community 243 - "validators/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, @barber/config-typescript/base.json

### Community 244 - "The Craftsmanship Standard"
Cohesion: 0.33
Nodes (6): C-1 — Intentionality, C-2 — Functional Completeness, C-3 — Content-Driven Composition, C-4 — Resilience, C-5 — Evidence Over Claims, The Craftsmanship Standard

### Community 245 - "Delivery Gate (Mandatory)"
Cohesion: 0.40
Nodes (5): Block 1: Hard Gate (absolute), Block 2: Purpose-Gate (technique allowed, reason required), Block 3: Liveliness (required to be alive, not just clean), Block 4: Craftsmanship & Quality Locks, Delivery Gate (Mandatory)

### Community 247 - "customer-service.ts"
Cohesion: 0.27
Nodes (8): AuthoritativeCustomer, CreateCustomerInput, customerService, getSupabase(), parseAuthoritativeCustomer(), parseStrictAuthoritativeDate(), parseStrictAuthoritativeString(), parseStrictAuthoritativeUUID()

### Community 248 - "Part 3: Liveliness Toolkit"
Cohesion: 0.50
Nodes (4): Design Read (how the dials are set), Levers (how the dials become visual decisions), Part 3: Liveliness Toolkit, Three Dials (required)

### Community 249 - "Structural & Flow"
Cohesion: 0.50
Nodes (4): Dead Navigation, Non-Functional Controls, Sections That Fill a Template, Structural & Flow

### Community 258 - "refund-service.ts"
Cohesion: 0.24
Nodes (8): getSupabase(), parseAuthoritativeRefundResult(), parseStrictAuthoritativeString(), parseStrictAuthoritativeUUID(), ProcessRefundInput, ProcessRefundResult, RefundItemInput, refundService

### Community 259 - "BarberEmployee"
Cohesion: 0.43
Nodes (6): BarberPerformanceRankProps, CommissionLedgerTableProps, CommissionPayoutModalProps, BarberCommissionSummary, BarberEmployee, CommissionItemView

## Knowledge Gaps
- **684 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+679 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1105 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **147 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `lucide-react` connect `ref_react` to `ref_vitest`, `staff-schedule-operation-errors.ts`, `usePos`, `formatCurrency`, `BarberEmployee`, `accounting/page.tsx`, `pos-context.tsx`, `employee-leave-panel.tsx`, `analytics/page.tsx`, `purchases/page.tsx`, `PosProvider`, `commissions/page.tsx`, `customers/page.tsx`, `web/package.json`, `checkout-modal.tsx`, `receipt-modal.tsx`, `inventory/page.tsx`, `settings.ts`, `employee-schedule-panel.tsx`, `settings-shell.tsx`, `payment-methods-panel.tsx`, `queue/page.tsx`, `walkin-modal.tsx`, `book/page.tsx`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _684 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ref_vitest` be split into smaller, more focused modules?**
  _Cohesion score 0.06557377049180328 - nodes in this community are weakly interconnected._
- **Why does `usePos()` connect `usePos` to `staff-schedule-operation-errors.ts`, `formatCurrency`, `pos-context.tsx`, `accounting/page.tsx`, `employee-leave-panel.tsx`, `analytics/page.tsx`, `purchases/page.tsx`, `PosProvider`, `commissions/page.tsx`, `customers/page.tsx`, `checkout-modal.tsx`, `receipt-modal.tsx`, `inventory/page.tsx`, `settings.ts`, `employee-schedule-panel.tsx`, `settings-shell.tsx`, `payment-methods-panel.tsx`, `queue/page.tsx`, `walkin-modal.tsx`, `ref_react`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Should `types/pos.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11693548387096774 - nodes in this community are weakly interconnected._
- **Why does `@electric-sql/pglite` connect `ref_vitest` to `business-rules/package.json`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Should `staff-schedule-operation-errors.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08859357696567 - nodes in this community are weakly interconnected._