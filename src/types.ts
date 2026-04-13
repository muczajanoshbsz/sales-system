export type UserRole = 'admin' | 'client';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
  is_suspended?: boolean;
  has_seen_onboarding?: boolean;
}

export interface Sale {
  id?: string;
  date: string;
  model: string;
  condition: string;
  platform: string;
  quantity: number;
  buy_price: number;
  sell_price: number;
  fees: number;
  profit: number;
  buyer?: string;
  city?: string;
  tracking_number?: string;
  notes?: string;
  userId: string;
}

export interface StockItem {
  id?: string;
  model: string;
  condition: string;
  quantity: number;
  buy_price: number;
  lead_time?: number; // Days to restock
  last_updated?: string;
}

export interface MarketPrice {
  id?: string;
  model: string;
  condition: string;
  platform: string;
  price: number;
  date: string;
}

export interface PendingSale extends Omit<Sale, 'id'> {
  id?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
}

export interface ProductModel {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppConfig {
  models: string[];
  conditions: string[];
  platforms: string[];
  thresholds: {
    low_stock: number;
    critical_stock: number;
  };
}
