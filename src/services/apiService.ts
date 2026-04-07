import { Sale, PendingSale, StockItem, MarketPrice } from '../types';

const API_BASE = '/api';

export const apiService = {
  // Sales
  async getSales(): Promise<Sale[]> {
    const response = await fetch(`${API_BASE}/sales`);
    if (!response.ok) throw new Error('Failed to fetch sales');
    const data = await response.json();
    return data.map((s: any) => ({
      ...s,
      quantity: Number(s.quantity),
      buy_price: Number(s.buy_price),
      sell_price: Number(s.sell_price),
      fees: Number(s.fees),
      profit: Number(s.profit),
    }));
  },

  async addSale(sale: Omit<Sale, 'id'>): Promise<Sale> {
    const response = await fetch(`${API_BASE}/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sale),
    });
    if (!response.ok) throw new Error('Failed to add sale');
    const s = await response.json();
    return {
      ...s,
      quantity: Number(s.quantity),
      buy_price: Number(s.buy_price),
      sell_price: Number(s.sell_price),
      fees: Number(s.fees),
      profit: Number(s.profit),
    };
  },

  async deleteSale(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/sales/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete sale');
  },

  async updateSale(id: string, sale: Partial<Sale>): Promise<Sale> {
    const response = await fetch(`${API_BASE}/sales/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sale),
    });
    if (!response.ok) throw new Error('Failed to update sale');
    const s = await response.json();
    return {
      ...s,
      quantity: Number(s.quantity),
      buy_price: Number(s.buy_price),
      sell_price: Number(s.sell_price),
      fees: Number(s.fees),
      profit: Number(s.profit),
    };
  },

  async deleteAllSales(): Promise<void> {
    const response = await fetch(`${API_BASE}/sales`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete all sales');
  },

  // Stock
  async getStock(): Promise<StockItem[]> {
    const response = await fetch(`${API_BASE}/stock`);
    if (!response.ok) throw new Error('Failed to fetch stock');
    const data = await response.json();
    return data.map((i: any) => ({
      ...i,
      quantity: Number(i.quantity),
      buy_price: Number(i.buy_price),
      lead_time: i.lead_time !== undefined ? Number(i.lead_time) : 7,
    }));
  },

  async updateStock(id: string, quantity: number, lead_time?: number): Promise<void> {
    const response = await fetch(`${API_BASE}/stock/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity, lead_time }),
    });
    if (!response.ok) throw new Error('Failed to update stock');
  },

  async addStock(item: Omit<StockItem, 'id'>): Promise<StockItem> {
    const response = await fetch(`${API_BASE}/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!response.ok) throw new Error('Failed to add stock');
    const i = await response.json();
    return {
      ...i,
      quantity: Number(i.quantity),
      buy_price: Number(i.buy_price),
      lead_time: i.lead_time !== undefined ? Number(i.lead_time) : 7,
    };
  },

  async deleteStock(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/stock/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete stock');
  },

  // Pending Sales
  async getPendingSales(): Promise<PendingSale[]> {
    const response = await fetch(`${API_BASE}/pending_sales`);
    if (!response.ok) throw new Error('Failed to fetch pending sales');
    const data = await response.json();
    return data.map((s: any) => ({
      ...s,
      quantity: Number(s.quantity),
      buy_price: Number(s.buy_price),
      sell_price: Number(s.sell_price),
      fees: Number(s.fees),
      profit: Number(s.profit),
    }));
  },

  async addPendingSale(sale: Omit<PendingSale, 'id'>): Promise<PendingSale> {
    const response = await fetch(`${API_BASE}/pending_sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sale),
    });
    if (!response.ok) throw new Error('Failed to add pending sale');
    const s = await response.json();
    return {
      ...s,
      quantity: Number(s.quantity),
      buy_price: Number(s.buy_price),
      sell_price: Number(s.sell_price),
      fees: Number(s.fees),
      profit: Number(s.profit),
    };
  },

  async updatePendingStatus(id: string, status: string): Promise<void> {
    const response = await fetch(`${API_BASE}/pending_sales/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error('Failed to update pending status');
  },

  // Market Prices
  async getMarketPrices(): Promise<MarketPrice[]> {
    const response = await fetch(`${API_BASE}/market_prices`);
    if (!response.ok) throw new Error('Failed to fetch market prices');
    const data = await response.json();
    return data.map((p: any) => ({
      ...p,
      price: Number(p.price),
    }));
  },

  // System
  async getSystemBackup(): Promise<any> {
    const response = await fetch(`${API_BASE}/system/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error('Failed to create system backup');
    return await response.json();
  },

  async restoreSystem(backupData: any): Promise<void> {
    const response = await fetch(`${API_BASE}/system/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backupData),
    });
    if (!response.ok) throw new Error('Failed to restore system');
  },

  async getAuditLogs(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/audit_logs`);
    if (!response.ok) throw new Error('Failed to fetch audit logs');
    return await response.json();
  },
  
  async clearAuditLogs(): Promise<void> {
    const response = await fetch(`${API_BASE}/audit_logs`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to clear audit logs');
  },

  async deleteAllSystemData(): Promise<void> {
    const response = await fetch(`${API_BASE}/system/all`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete all system data');
  },
};
