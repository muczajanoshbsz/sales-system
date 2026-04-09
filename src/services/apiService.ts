import { Sale, PendingSale, StockItem, MarketPrice } from '../types';
import { auth } from '../firebase';

const API_BASE = '/api';

const getHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (auth.currentUser) {
    headers['x-user-id'] = auth.currentUser.uid;
  }
  return headers;
};

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    let errorMessage = 'Hálózati hiba történt';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch (e) {
      // Fallback to status text
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  return response;
};

export const apiService = {
  // Sales
  async getSales(): Promise<Sale[]> {
    const response = await fetch(`${API_BASE}/sales`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
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
      headers: getHeaders(),
      body: JSON.stringify(sale),
    });
    await handleResponse(response);
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
      headers: getHeaders(),
    });
    await handleResponse(response);
  },

  async updateSale(id: string, sale: Partial<Sale>): Promise<Sale> {
    const response = await fetch(`${API_BASE}/sales/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(sale),
    });
    await handleResponse(response);
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
      headers: getHeaders(),
    });
    await handleResponse(response);
  },

  // Stock
  async getStock(): Promise<StockItem[]> {
    const response = await fetch(`${API_BASE}/stock`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    const data = await response.json();
    return data.map((i: any) => ({
      ...i,
      quantity: Number(i.quantity),
      buy_price: Number(i.buy_price),
      lead_time: i.lead_time !== undefined ? Number(i.lead_time) : 7,
    }));
  },

  async updateStock(id: string, quantity: number, lead_time?: number, buy_price?: number): Promise<void> {
    const response = await fetch(`${API_BASE}/stock/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ quantity, lead_time, buy_price }),
    });
    await handleResponse(response);
  },

  async addStock(item: Omit<StockItem, 'id'>): Promise<StockItem> {
    const response = await fetch(`${API_BASE}/stock`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(item),
    });
    await handleResponse(response);
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
      headers: getHeaders(),
    });
    await handleResponse(response);
  },

  // Pending Sales
  async getPendingSales(): Promise<PendingSale[]> {
    const response = await fetch(`${API_BASE}/pending_sales`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
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
      headers: getHeaders(),
      body: JSON.stringify(sale),
    });
    await handleResponse(response);
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
      headers: getHeaders(),
      body: JSON.stringify({ status }),
    });
    await handleResponse(response);
  },

  // Market Prices
  async getMarketPrices(): Promise<MarketPrice[]> {
    const response = await fetch(`${API_BASE}/market_prices`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
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
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async restoreSystem(backupData: any): Promise<void> {
    const response = await fetch(`${API_BASE}/system/restore`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(backupData),
    });
    await handleResponse(response);
  },

  async getAuditLogs(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/audit_logs`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },
  
  async clearAuditLogs(): Promise<void> {
    const response = await fetch(`${API_BASE}/audit_logs`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    await handleResponse(response);
  },

  async deleteAllSystemData(): Promise<void> {
    const response = await fetch(`${API_BASE}/system/all`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    await handleResponse(response);
  },

  async syncUser(userData: { uid: string; email: string; displayName?: string }): Promise<any> {
    const response = await fetch(`${API_BASE}/users/sync`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(userData),
    });
    await handleResponse(response);
    return await response.json();
  },

  // Admin Global Methods
  async getAdminUsers(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/users`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async getAdminSales(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/sales`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async getAdminStock(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/stock`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async getAdminPendingSales(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/pending_sales`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async getAdminAuditLogs(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/audit_logs`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async getAdminStats(): Promise<any> {
    const response = await fetch(`${API_BASE}/admin/stats`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },
};
