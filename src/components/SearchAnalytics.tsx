import React, { useState, useEffect } from 'react';
import { Sale } from '../types';
import { Card, Input, Select, Button } from './ui/Base';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { APP_CONFIG } from '../constants';
import { Search, Filter, Download, X } from 'lucide-react';
import { apiService } from '../services/apiService';

const SearchAnalytics: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [filters, setFilters] = useState({
    search: '',
    model: '',
    condition: '',
    platform: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const data = await apiService.getSales();
        setSales(data);
        setFilteredSales(data);
      } catch (error) {
        console.error('Failed to fetch sales:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSales();
  }, []);

  useEffect(() => {
    let result = sales;

    if (filters.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(sale => 
        sale.buyer?.toLowerCase().includes(s) || 
        sale.notes?.toLowerCase().includes(s) ||
        sale.tracking_number?.toLowerCase().includes(s)
      );
    }

    if (filters.model) result = result.filter(s => s.model === filters.model);
    if (filters.condition) result = result.filter(s => s.condition === filters.condition);
    if (filters.platform) result = result.filter(s => s.platform === filters.platform);
    if (filters.startDate) result = result.filter(s => s.date >= filters.startDate);
    if (filters.endDate) result = result.filter(s => s.date <= filters.endDate);

    setFilteredSales(result);
  }, [filters, sales]);

  const exportCSV = () => {
    const headers = ['Dátum', 'Modell', 'Állapot', 'Platform', 'Mennyiség', 'Eladási Ár', 'Profit', 'Vevő'];
    const rows = filteredSales.map(s => [
      s.date, s.model, s.condition, s.platform, s.quantity, s.sell_price, s.profit, s.buyer || ''
    ]);
    
    const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `eladasok_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      model: '',
      condition: '',
      platform: '',
      startDate: '',
      endDate: '',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Keresés és Elemzés</h2>
        <Button variant="outline" onClick={exportCSV} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div className="md:col-span-2 lg:col-span-1 space-y-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Keresés</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Vevő, megjegyzés..." 
                className="pl-10 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                value={filters.search}
                onChange={(e) => setFilters({...filters, search: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Modell</label>
            <Select value={filters.model} onChange={(e) => setFilters({...filters, model: e.target.value})} className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
              <option value="">Összes Modell</option>
              {APP_CONFIG.models.map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Platform</label>
            <Select value={filters.platform} onChange={(e) => setFilters({...filters, platform: e.target.value})} className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
              <option value="">Összes Platform</option>
              {APP_CONFIG.platforms.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dátumtól</label>
            <Input type="date" value={filters.startDate} onChange={(e) => setFilters({...filters, startDate: e.target.value})} className="dark:bg-slate-800 dark:border-slate-700 dark:text-white" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dátumig</label>
            <Input type="date" value={filters.endDate} onChange={(e) => setFilters({...filters, endDate: e.target.value})} className="dark:bg-slate-800 dark:border-slate-700 dark:text-white" />
          </div>

          <div className="flex items-end">
            <Button variant="ghost" onClick={clearFilters} className="text-slate-500 dark:text-slate-400 dark:hover:bg-slate-800">
              <X className="w-4 h-4 mr-2" />
              Szűrők törlése
            </Button>
          </div>
        </div>
      </Card>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4">Dátum</th>
                <th className="px-6 py-4">Modell</th>
                <th className="px-6 py-4">Platform</th>
                <th className="px-6 py-4">Vevő</th>
                <th className="px-6 py-4 text-right">Ár</th>
                <th className="px-6 py-4 text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{formatDate(sale.date)}</td>
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{sale.model}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{sale.platform}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{sale.buyer || '-'}</td>
                  <td className="px-6 py-4 text-right font-semibold text-slate-900 dark:text-white">{formatCurrency(sale.sell_price)}</td>
                  <td className={cn("px-6 py-4 text-right font-bold", sale.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    {formatCurrency(sale.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredSales.length === 0 && (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400">Nincs találat.</div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default SearchAnalytics;
