import React, { useEffect, useState } from 'react';
import { StockItem } from '../types';
import { Button, Card, Input, Select } from './ui/Base';
import { Modal } from './ui/Modal';
import { formatCurrency, cn } from '../lib/utils';
import { APP_CONFIG } from '../constants';
import { Plus, Edit2, Trash2, AlertCircle, TrendingDown, Clock, Download } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { apiService } from '../services/apiService';
import { Sale } from '../types';
import { subDays, isAfter, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const InventoryManager: React.FC = () => {
  const { isAdmin } = useFirebase();
  const navigate = useNavigate();
  const [stock, setStock] = useState<StockItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  
  const [formData, setFormData] = useState<Partial<StockItem>>({
    model: APP_CONFIG.models[0],
    condition: APP_CONFIG.conditions[0],
    quantity: 0,
    buy_price: 0,
    lead_time: 7,
  });

  const fetchData = async () => {
    try {
      const [stockData, salesData] = await Promise.all([
        apiService.getStock(),
        apiService.getSales()
      ]);
      setStock(stockData);
      setSales(salesData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'quantity' || name === 'buy_price' || name === 'lead_time' ? Number(value) : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    try {
      if (editingItem) {
        await apiService.updateStock(editingItem.id!, formData.quantity || 0, formData.lead_time);
      } else {
        await apiService.addStock(formData as Omit<StockItem, 'id'>);
      }
      setIsModalOpen(false);
      setEditingItem(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Failed to save stock:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      model: APP_CONFIG.models[0],
      condition: APP_CONFIG.conditions[0],
      quantity: 0,
      buy_price: 0,
      lead_time: 7,
    });
  };

  const openEditModal = (item: StockItem) => {
    setEditingItem(item);
    setFormData({
      model: item.model,
      condition: item.condition,
      quantity: item.quantity,
      buy_price: item.buy_price,
      lead_time: item.lead_time || 7,
    });
    setIsModalOpen(true);
  };

  const deleteItem = async (id: string) => {
    if (!window.confirm('Biztosan törölni szeretnéd ezt a tételt?')) return;
    try {
      await apiService.deleteStock(id);
      fetchData();
    } catch (error) {
      console.error('Failed to delete stock:', error);
    }
  };

  const getStockPrediction = (item: StockItem) => {
    const thirtyDaysAgo = subDays(new Date(), 30);
    const itemSales = sales.filter(s => 
      s.model === item.model && 
      s.condition === item.condition && 
      isAfter(parseISO(s.date), thirtyDaysAgo)
    );
    
    const totalSold = itemSales.reduce((sum, s) => sum + s.quantity, 0);
    const velocity = totalSold / 30; // units per day
    
    if (velocity === 0) return { daysRemaining: 999, daysUntilCritical: 999, velocity: 0 };
    
    const daysRemaining = item.quantity / velocity;
    const daysUntilCritical = (item.quantity - APP_CONFIG.thresholds.critical_stock) / velocity;
    
    return { 
      daysRemaining: Math.max(0, Math.round(daysRemaining)), 
      daysUntilCritical: Math.max(0, Math.round(daysUntilCritical)),
      velocity: Number(velocity.toFixed(2))
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">Készlet Kezelés</h2>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate('/data')}>
            <Download className="w-4 h-4 mr-2" />
            Exportálás
          </Button>
          {isAdmin && (
            <Button onClick={() => { setEditingItem(null); resetForm(); setIsModalOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Új Tétel
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stock.map((item) => {
          const prediction = getStockPrediction(item);
          const isCriticalSoon = prediction.daysUntilCritical < 30;
          const isLeadTimeRisk = prediction.daysRemaining < (item.lead_time || 7);

          return (
            <Card key={item.id} className="p-6 relative group">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{item.model}</h3>
                  <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase mt-1">
                    {item.condition}
                  </span>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold",
                  item.quantity <= APP_CONFIG.thresholds.critical_stock ? "bg-red-100 text-red-700" :
                  item.quantity <= APP_CONFIG.thresholds.low_stock ? "bg-amber-100 text-amber-700" :
                  "bg-emerald-100 text-emerald-700"
                )}>
                  {item.quantity} db
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Beszerzési ár</p>
                    <p className="text-sm font-semibold text-slate-900">{formatCurrency(item.buy_price)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Összérték</p>
                    <p className="text-sm font-bold text-indigo-600">{formatCurrency(item.buy_price * item.quantity)}</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Napi fogyás:</span>
                    </div>
                    <span className="text-xs font-bold text-slate-900">{prediction.velocity} db/nap</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Készlet kitart:</span>
                    </div>
                    <span className={cn(
                      "text-xs font-bold",
                      prediction.daysRemaining < 7 ? "text-red-600" : 
                      prediction.daysRemaining < 14 ? "text-amber-600" : 
                      "text-emerald-600"
                    )}>
                      {prediction.daysRemaining > 365 ? '∞' : `${prediction.daysRemaining} nap`}
                    </span>
                  </div>
                </div>
              </div>

              {(isCriticalSoon || isLeadTimeRisk) && (
                <div className={cn(
                  "mt-4 flex items-start gap-2 text-[11px] font-bold p-2.5 rounded-lg border",
                  isLeadTimeRisk ? "bg-red-50 text-red-700 border-red-100" : "bg-amber-50 text-amber-700 border-amber-100"
                )}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    {isLeadTimeRisk ? (
                      <p>RENDELÉS SZÜKSÉGES! A készlet kitartása ({prediction.daysRemaining} nap) kevesebb, mint a beszerzési idő ({item.lead_time || 7} nap).</p>
                    ) : (
                      <p>Kritikus szint várható {prediction.daysUntilCritical} napon belül!</p>
                    )}
                  </div>
                </div>
              )}

              {isAdmin && (
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEditModal(item)} className="h-8 w-8 p-0">
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteItem(item.id!)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "Tétel Szerkesztése" : "Új Tétel Hozzáadása"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Modell</label>
            <Select name="model" value={formData.model} onChange={handleInputChange}>
              {APP_CONFIG.models.map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Állapot</label>
            <Select name="condition" value={formData.condition} onChange={handleInputChange}>
              {APP_CONFIG.conditions.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Mennyiség</label>
              <Input type="number" name="quantity" value={formData.quantity} onChange={handleInputChange} min="0" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Beszerzési Ár</label>
              <Input type="number" name="buy_price" value={formData.buy_price} onChange={handleInputChange} required />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Beszerzési Idő (nap)</label>
            <Input type="number" name="lead_time" value={formData.lead_time} onChange={handleInputChange} min="1" required />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Mégse</Button>
            <Button type="submit">{editingItem ? "Módosítás Mentése" : "Hozzáadás"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default InventoryManager;
