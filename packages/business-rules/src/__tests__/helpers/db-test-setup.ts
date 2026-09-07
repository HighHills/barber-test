import { PGlite } from '@electric-sql/pglite';
// @ts-ignore
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import * as fs from 'fs';
import * as path from 'path';

export interface TestDbEnvironment {
  db: PGlite;
  outletAId: string;
  outletBId: string;
  ownerUserId: string;
  ownerProfileId: string;
  managerAUserId: string;
  managerAProfileId: string;
  managerBUserId: string;
  managerBProfileId: string;
  cashierAUserId: string;
  cashierAProfileId: string;
  barberAEmployeeId: string;
  barberAUserId: string;
  barberAProfileId: string;
  barberBEmployeeId: string;
  inventoryAUserId: string;
  inventoryAProfileId: string;
  accountingUserId: string;
  accountingProfileId: string;
  customerId: string;
  cashMethodId: string;
  bankMethodId: string;
  qrisMethodId: string;
  serviceCutId: string;
  serviceColorId: string;
  consumableProductId: string;
  retailPomadeId: string;
  retailShampooId: string;
  roleMap: Map<string, string>;
  asUser: (userId: string | null) => Promise<void>;
  resetUser: () => Promise<void>;
}

export async function createTestDbEnvironment(): Promise<TestDbEnvironment> {
  const db = new PGlite({
    extensions: {
      btree_gist,
    },
  });

  // 0. Bootstrap test-only auth mocks for PGlite
  await db.exec(`
    DO $$ BEGIN
      CREATE ROLE anon;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE ROLE authenticated;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE ROLE service_role;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS UUID AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
    $$ LANGUAGE sql STABLE;
    CREATE OR REPLACE FUNCTION validate_commission_tier_config()
    RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;
  `);

  // 1. Run all 13 migrations in order
  const migDir = path.resolve(__dirname, '../../../../../supabase/migrations');
  const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();

  for (const f of files) {
    let sql = fs.readFileSync(path.join(migDir, f), 'utf8');
    sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, '-- pgcrypto builtin in modern PG');
    try {
      await db.exec(sql);
    } catch (e: any) {
      console.error('FAILED IN MIGRATION FILE:', f, e.message);
      throw e;
    }
  }

  // 2. Run seed.sql
  const seedFile = path.resolve(__dirname, '../../../../../supabase/seed.sql');
  const seedSql = fs.readFileSync(seedFile, 'utf8');
  await db.exec(seedSql);

  // 3. Ensure sequence usage for authenticated
  await db.exec(`
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
  `);

  // 4. Seed Outlets
  const outARes = await db.query<{ id: string }>(
    "INSERT INTO outlets (code, name, address) VALUES ('OUT-01', 'Downtown Branch', '123 Main St') RETURNING id"
  );
  const outletAId = outARes.rows[0].id;

  const outBRes = await db.query<{ id: string }>(
    "INSERT INTO outlets (code, name, address) VALUES ('OUT-02', 'Uptown Branch', '456 High St') RETURNING id"
  );
  const outletBId = outBRes.rows[0].id;

  // Roles map
  const rolesRes = await db.query<{ id: string; code: string }>("SELECT id, code FROM roles");
  const roleMap = new Map(rolesRes.rows.map((r) => [r.code, r.id]));

  // Owner
  const ownerUserId = '11111111-1111-1111-1111-111111111111';
  const ownerProfRes = await db.query<{ id: string }>(
    `INSERT INTO profiles (auth_user_id, display_name) VALUES ('${ownerUserId}', 'Business Owner') RETURNING id`
  );
  const ownerProfileId = ownerProfRes.rows[0].id;
  await db.query(
    `INSERT INTO user_roles (user_id, role_id, outlet_id) VALUES ('${ownerProfileId}', '${roleMap.get('OWNER')}', NULL)`
  );

  // Manager A (Outlet A)
  const managerAUserId = '22222222-2222-2222-2222-222222222222';
  const mgrAProfRes = await db.query<{ id: string }>(
    `INSERT INTO profiles (auth_user_id, display_name) VALUES ('${managerAUserId}', 'Manager Outlet A') RETURNING id`
  );
  const managerAProfileId = mgrAProfRes.rows[0].id;
  await db.query(
    `INSERT INTO user_roles (user_id, role_id, outlet_id) VALUES ('${managerAProfileId}', '${roleMap.get('MANAGER')}', '${outletAId}')`
  );

  // Manager B (Outlet B)
  const managerBUserId = '33333333-3333-3333-3333-333333333333';
  const mgrBProfRes = await db.query<{ id: string }>(
    `INSERT INTO profiles (auth_user_id, display_name) VALUES ('${managerBUserId}', 'Manager Outlet B') RETURNING id`
  );
  const managerBProfileId = mgrBProfRes.rows[0].id;
  await db.query(
    `INSERT INTO user_roles (user_id, role_id, outlet_id) VALUES ('${managerBProfileId}', '${roleMap.get('MANAGER')}', '${outletBId}')`
  );

  // Cashier A (Outlet A)
  const cashierAUserId = '44444444-4444-4444-4444-444444444444';
  const cashAProfRes = await db.query<{ id: string }>(
    `INSERT INTO profiles (auth_user_id, display_name) VALUES ('${cashierAUserId}', 'Cashier Outlet A') RETURNING id`
  );
  const cashierAProfileId = cashAProfRes.rows[0].id;
  await db.query(
    `INSERT INTO user_roles (user_id, role_id, outlet_id) VALUES ('${cashierAProfileId}', '${roleMap.get('CASHIER')}', '${outletAId}')`
  );

  // Barber A (Outlet A)
  const barberAEmpRes = await db.query<{ id: string }>(
    "INSERT INTO employees (employee_code, full_name, position) VALUES ('EMP-B01', 'Barber John', 'Barber') RETURNING id"
  );
  const barberAEmployeeId = barberAEmpRes.rows[0].id;
  await db.query(
    `INSERT INTO employee_outlets (employee_id, outlet_id, is_primary) VALUES ('${barberAEmployeeId}', '${outletAId}', true)`
  );

  // Barber B (Outlet B)
  const barberBEmpRes = await db.query<{ id: string }>(
    "INSERT INTO employees (employee_code, full_name, position) VALUES ('EMP-B02', 'Barber Steve', 'Barber') RETURNING id"
  );
  const barberBEmployeeId = barberBEmpRes.rows[0].id;
  await db.query(
    `INSERT INTO employee_outlets (employee_id, outlet_id, is_primary) VALUES ('${barberBEmployeeId}', '${outletBId}', true)`
  );

  // Barber User (Outlet A)
  const barberAUserId = '55555555-5555-5555-5555-555555555555';
  const barbAProfRes = await db.query<{ id: string }>(
    `INSERT INTO profiles (auth_user_id, display_name, employee_id) VALUES ('${barberAUserId}', 'Barber John Profile', '${barberAEmployeeId}') RETURNING id`
  );
  const barberAProfileId = barbAProfRes.rows[0].id;
  await db.query(
    `INSERT INTO user_roles (user_id, role_id, outlet_id) VALUES ('${barberAProfileId}', '${roleMap.get('BARBER')}', '${outletAId}')`
  );

  // Inventory User (Outlet A)
  const inventoryAUserId = '66666666-6666-6666-6666-666666666666';
  const invAProfRes = await db.query<{ id: string }>(
    `INSERT INTO profiles (auth_user_id, display_name) VALUES ('${inventoryAUserId}', 'Inventory Officer Outlet A') RETURNING id`
  );
  const inventoryAProfileId = invAProfRes.rows[0].id;
  await db.query(
    `INSERT INTO user_roles (user_id, role_id, outlet_id) VALUES ('${inventoryAProfileId}', '${roleMap.get('INVENTORY')}', '${outletAId}')`
  );

  // Accounting User (Global)
  const accountingUserId = '77777777-7777-7777-7777-777777777777';
  const accProfRes = await db.query<{ id: string }>(
    `INSERT INTO profiles (auth_user_id, display_name) VALUES ('${accountingUserId}', 'Accountant Global') RETURNING id`
  );
  const accountingProfileId = accProfRes.rows[0].id;
  await db.query(
    `INSERT INTO user_roles (user_id, role_id, outlet_id) VALUES ('${accountingProfileId}', '${roleMap.get('ACCOUNTING')}', NULL)`
  );

  // Customer
  const custRes = await db.query<{ id: string }>(
    "INSERT INTO customers (customer_code, full_name, phone) VALUES ('CUST-001', 'Customer Alice', '08123456789') RETURNING id"
  );
  const customerId = custRes.rows[0].id;

  // Payment Methods
  const cashRes = await db.query<{ id: string }>("SELECT id FROM payment_methods WHERE code = 'CASH'");
  const cashMethodId = cashRes.rows[0].id;
  const bankRes = await db.query<{ id: string }>("SELECT id FROM payment_methods WHERE code = 'BANK_TRANSFER'");
  const bankMethodId = bankRes.rows[0].id;
  const qrisRes = await db.query<{ id: string }>("SELECT id FROM payment_methods WHERE code = 'QRIS'");
  const qrisMethodId = qrisRes.rows[0].id;

  // Catalog
  const srvCatRes = await db.query<{ id: string }>("INSERT INTO service_categories (name) VALUES ('Haircuts') RETURNING id");
  const prodCatRes = await db.query<{ id: string }>("INSERT INTO product_categories (name) VALUES ('Hair Care') RETURNING id");

  // Service 1: Classic Haircut (Rp50,000)
  const srv1Res = await db.query<{ id: string }>(
    `INSERT INTO services (category_id, code, name, duration_minutes, default_cost_price)
     VALUES ('${srvCatRes.rows[0].id}', 'SRV-CUT', 'Classic Haircut', 30, 5000) RETURNING id`
  );
  const serviceCutId = srv1Res.rows[0].id;
  await db.query(`INSERT INTO service_outlets (service_id, outlet_id, selling_price) VALUES ('${serviceCutId}', '${outletAId}', 50000)`);
  await db.query(`INSERT INTO service_outlets (service_id, outlet_id, selling_price) VALUES ('${serviceCutId}', '${outletBId}', 55000)`);

  // Service 2: Hair Coloring (Rp150,000)
  const srv2Res = await db.query<{ id: string }>(
    `INSERT INTO services (category_id, code, name, duration_minutes, default_cost_price)
     VALUES ('${srvCatRes.rows[0].id}', 'SRV-COLOR', 'Hair Coloring', 60, 25000) RETURNING id`
  );
  const serviceColorId = srv2Res.rows[0].id;
  await db.query(`INSERT INTO service_outlets (service_id, outlet_id, selling_price) VALUES ('${serviceColorId}', '${outletAId}', 150000)`);

  // Consumable Product: Neck Strip (Cost: 1,000)
  const consRes = await db.query<{ id: string }>(
    `INSERT INTO products (category_id, sku, name, base_unit, default_cost_price)
     VALUES ('${prodCatRes.rows[0].id}', 'MAT-NECK', 'Neck Paper Strip', 'PCS', 1000) RETURNING id`
  );
  const consumableProductId = consRes.rows[0].id;
  await db.query(
    `INSERT INTO service_consumptions (service_id, product_id, quantity) VALUES ('${serviceCutId}', '${consumableProductId}', 1.0000)`
  );

  // Retail Product 1: Matte Pomade (Cost: 50,000, Price: 100,000)
  const pomRes = await db.query<{ id: string }>(
    `INSERT INTO products (category_id, sku, name, base_unit, default_cost_price)
     VALUES ('${prodCatRes.rows[0].id}', 'RET-POMADE', 'Matte Pomade', 'JAR', 50000) RETURNING id`
  );
  const retailPomadeId = pomRes.rows[0].id;
  await db.query(`INSERT INTO product_outlets (product_id, outlet_id, selling_price) VALUES ('${retailPomadeId}', '${outletAId}', 100000)`);
  await db.query(`INSERT INTO product_outlets (product_id, outlet_id, selling_price) VALUES ('${retailPomadeId}', '${outletBId}', 110000)`);

  // Retail Product 2: Anti-Dandruff Shampoo (Cost: 40,000, Price: 80,000)
  const shpRes = await db.query<{ id: string }>(
    `INSERT INTO products (category_id, sku, name, base_unit, default_cost_price)
     VALUES ('${prodCatRes.rows[0].id}', 'RET-SHAMPOO', 'Anti-Dandruff Shampoo', 'BOTTLE', 40000) RETURNING id`
  );
  const retailShampooId = shpRes.rows[0].id;
  await db.query(`INSERT INTO product_outlets (product_id, outlet_id, selling_price) VALUES ('${retailShampooId}', '${outletAId}', 80000)`);

  // Initial Inventory Outlet A
  await db.query(
    `INSERT INTO outlet_inventory (outlet_id, product_id, quantity, average_cost) VALUES ('${outletAId}', '${consumableProductId}', 200.0, 1000.0)`
  );
  await db.query(
    `INSERT INTO outlet_inventory (outlet_id, product_id, quantity, average_cost) VALUES ('${outletAId}', '${retailPomadeId}', 50.0, 50000.0)`
  );
  await db.query(
    `INSERT INTO outlet_inventory (outlet_id, product_id, quantity, average_cost) VALUES ('${outletAId}', '${retailShampooId}', 40.0, 40000.0)`
  );

  // Initial Inventory Outlet B
  await db.query(
    `INSERT INTO outlet_inventory (outlet_id, product_id, quantity, average_cost) VALUES ('${outletBId}', '${retailPomadeId}', 30.0, 50000.0)`
  );

  async function asUser(userId: string | null) {
    if (userId) {
      await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userId}';`);
    } else {
      await db.exec('RESET ROLE; RESET "request.jwt.claim.sub";');
    }
  }

  return {
    db,
    outletAId,
    outletBId,
    ownerUserId,
    ownerProfileId,
    managerAUserId,
    managerAProfileId,
    managerBUserId,
    managerBProfileId,
    cashierAUserId,
    cashierAProfileId,
    barberAEmployeeId,
    barberAUserId,
    barberAProfileId,
    barberBEmployeeId,
    inventoryAUserId,
    inventoryAProfileId,
    accountingUserId,
    accountingProfileId,
    customerId,
    cashMethodId,
    bankMethodId,
    qrisMethodId,
    serviceCutId,
    serviceColorId,
    consumableProductId,
    retailPomadeId,
    retailShampooId,
    roleMap,
    asUser,
    resetUser: () => asUser(null),
  };
}
