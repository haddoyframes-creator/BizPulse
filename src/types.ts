export interface BusinessInfo {
  id: string;
  name: string;
  logo_url: string | null;
  user_photo_url?: string | null;
  phone_number?: string;
  email_address?: string;
  address?: string;
  nature_of_business?: string;
  is_subscribed: number;
  rc_number?: string;
  payment_gateway?: 'paystack' | 'monnify';
  monnify_test_mode?: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  photo_url: string | null;
  size: string | null;
  vat_status?: 'vatable' | 'exempt' | 'zero_rated';
}

export interface Transaction {
  id: string;
  type: 'sale' | 'expense';
  amount: number;
  category: string;
  date: string;
  product_id: string | null;
  customer_id: string | null;
  quantity: number;
  description: string | null;
  item_name?: string;
  vat_status?: 'vatable' | 'exempt' | 'zero_rated';
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface DailyStat {
  total_sales: number;
  total_expenses: number;
  date: string;
}

export interface User {
  id: string;
  email: string;
  hasPin: boolean;
  subscription_tier: 'free' | 'basic' | 'pro';
  subscription_status: 'active' | 'expired' | 'pending';
  role?: 'admin' | 'user';
  unlocked_cac_years?: number[];
  unlocked_tax_years?: number[];
}

export interface BillingRecord {
  id: string;
  amount: number;
  description: string;
  date: string;
  status: 'success' | 'failed' | 'pending';
  gateway: 'paystack' | 'monnify';
  reference: string;
}

export interface MonnifySDK {
  initialize: (config: {
    amount: number;
    currency: string;
    reference: string;
    customerFullName: string;
    customerEmail: string;
    apiKey: string;
    contractCode: string;
    paymentDescription: string;
    isTestMode: boolean;
    onComplete: (response: any) => void;
    onClose: (response: any) => void;
  }) => void;
}

declare global {
  interface Window {
    MonnifySDK?: MonnifySDK;
  }
}
