import { Sale, PendingSale, StockItem, MarketPrice, ProductModel } from '../types';
import { auth } from '../firebase';

const API_BASE = '/api';

const getHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (auth.currentUser) {
    headers['x-user-id'] = auth.currentUser.uid;
  }
  
  // Ghost Mode Headers
  const ghostUserId = sessionStorage.getItem('ghost_user_id');
  const ghostReadOnly = sessionStorage.getItem('ghost_mode_readonly');
  const backupId = sessionStorage.getItem('time_travel_backup_id');
  
  if (ghostUserId) {
    headers['x-ghost-user-id'] = ghostUserId;
    if (ghostReadOnly === 'true') {
      headers['x-ghost-mode-readonly'] = 'true';
    }
  }

  if (backupId) {
    headers['x-backup-id'] = backupId;
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
    
    if (errorMessage === 'Account suspended') {
      window.dispatchEvent(new CustomEvent('user-suspended'));
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

  async updatePendingSale(id: string, sale: Partial<PendingSale>): Promise<PendingSale> {
    const response = await fetch(`${API_BASE}/pending_sales/${id}`, {
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

  async completeOnboarding(): Promise<void> {
    const response = await fetch(`${API_BASE}/users/onboarding-complete`, {
      method: 'POST',
      headers: getHeaders(),
    });
    await handleResponse(response);
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

  async getAdminUserSessions(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/user-sessions`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async updateUser(uid: string, data: { role?: string; is_suspended?: boolean }): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/users/${uid}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    await handleResponse(response);
  },

  async getUserInsights(uid: string): Promise<any> {
    const response = await fetch(`${API_BASE}/admin/users/${uid}/insights`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async professionalDeleteUser(uid: string, mode: 'cascade' | 'anonymize'): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/users/${uid}/professional-delete`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ mode }),
    });
    await handleResponse(response);
  },

  // Catalog
  async getCatalogModels(): Promise<ProductModel[]> {
    const response = await fetch(`${API_BASE}/catalog/models`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async getActiveModels(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/catalog/active-models`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async addCatalogModel(name: string): Promise<ProductModel> {
    const response = await fetch(`${API_BASE}/catalog/models`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    });
    await handleResponse(response);
    return await response.json();
  },

  async updateCatalogModel(id: number, data: { name?: string; is_active?: boolean }): Promise<ProductModel> {
    const response = await fetch(`${API_BASE}/catalog/models/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    await handleResponse(response);
    return await response.json();
  },

  async deleteCatalogModel(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/catalog/models/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    await handleResponse(response);
  },

  // Backups
  async getBackups(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/backups`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async createBackup(): Promise<any> {
    const response = await fetch(`${API_BASE}/admin/backups/create`, {
      method: 'POST',
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async restoreBackup(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/backups/restore/${id}`, {
      method: 'POST',
      headers: getHeaders(),
    });
    await handleResponse(response);
  },

  async downloadBackup(id: number): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/admin/backups/download/${id}`, {
        headers: getHeaders(),
      });
      await handleResponse(response);
      
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `backup-${id}.json`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      throw error;
    }
  },

  async createSystemArtifact(): Promise<any> {
    const response = await fetch(`${API_BASE}/admin/backups/system-artifact`, {
      method: 'POST',
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async downloadSystemArtifact(id: number, filename: string = 'system-artifact.zip.enc'): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/admin/backups/download-artifact/${id}`, {
        headers: getHeaders(),
      });
      await handleResponse(response);
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Artifact download failed:', error);
      throw error;
    }
  },

  async uploadToVault(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/backups/vault-upload/${id}`, {
      method: 'POST',
      headers: getHeaders(),
    });
    await handleResponse(response);
  },

  async getSystemConfigs(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/system-config`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async getSessionTimeout(): Promise<{ value: string }> {
    const response = await fetch(`${API_BASE}/config/session-timeout`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async updateSystemConfig(key: string, value: string): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/system-config`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ key, value }),
    });
    await handleResponse(response);
  },

  async exportData(format: 'json' | 'xlsx'): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/export/${format}`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-${new Date().toISOString().split('T')[0]}.${format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
  },

  async getAIDiagnostics(message?: string, history?: any[]): Promise<string> {
    const response = await fetch(`${API_BASE}/admin/ai-diagnostics`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ message, history }),
    });
    await handleResponse(response);
    const data = await response.json();
    return data.analysis;
  },

  // Notifications
  async getNotifications(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/notifications`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async markNotificationRead(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/notifications/${id}/read`, {
      method: 'PUT',
      headers: getHeaders(),
    });
    await handleResponse(response);
  },

  async markAllNotificationsRead(): Promise<void> {
    const response = await fetch(`${API_BASE}/notifications/read-all`, {
      method: 'PUT',
      headers: getHeaders(),
    });
    await handleResponse(response);
  },

  // Weekly Report
  async getWeeklyReport(): Promise<any> {
    const response = await fetch(`${API_BASE}/admin/weekly-report`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async testSendReport(): Promise<any> {
    const response = await fetch(`${API_BASE}/admin/reports/test-send`, {
      method: 'POST',
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async runMaintenance(testMode: boolean = false): Promise<any> {
    const response = await fetch(`${API_BASE}/admin/system/maintenance`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ testMode }),
    });
    await handleResponse(response);
    return await response.json();
  },

  async getAITips(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/ai/tips`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async getAIDataAuditFlags(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/ai/audit-flags`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async getSystemHealthChecks(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/ai/health-checks`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async getArchivedSummaries(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/admin/ai/archives`, {
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async triggerRecoveryDrill(): Promise<any> {
    const response = await fetch(`${API_BASE}/admin/ai/trigger-drill`, {
      method: 'POST',
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },

  async triggerAIDataAudit(): Promise<any> {
    const response = await fetch(`${API_BASE}/admin/ai/trigger-audit`, {
      method: 'POST',
      headers: getHeaders(),
    });
    await handleResponse(response);
    return await response.json();
  },
};
