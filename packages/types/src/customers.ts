export interface Customer {
  id: string;
  customer_code: string;
  full_name: string;
  phone: string;
  email: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  date_of_birth: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
