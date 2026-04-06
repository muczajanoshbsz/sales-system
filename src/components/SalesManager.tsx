import React, { useEffect, useState } from 'react';
import { Sale, PendingSale, StockItem } from '../types';
import { Button, Card, Input, Select } from './ui/Base';
import { Modal } from './ui/Modal';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { APP_CONFIG } from '../constants';
import { Plus, Edit2, Trash2, Check, X, Clock, Database, Download } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { apiService } from '../services/apiService';
import { useNavigate } from 'react-router-dom';

const SalesManager: React.FC = () => {
  const { user, isAdmin } = useFirebase();
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);
  const [selectedSales, setSelectedSales] = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    variant?: 'danger' | 'primary';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  
  const [formData, setFormData] = useState<Partial<Sale>>({
    date: new Date().toISOString().split('T')[0],
    model: APP_CONFIG.models[0],
    condition: APP_CONFIG.conditions[0],
    platform: APP_CONFIG.platforms[0],
    quantity: 1,
    buy_price: 0,
    sell_price: 0,
    fees: 0,
    buyer: '',
    city: '',
    tracking_number: '',
    notes: '',
  });

  const fetchData = async () => {
    try {
      const [salesData, pendingData, stockData] = await Promise.all([
        apiService.getSales(),
        apiService.getPendingSales(),
        apiService.getStock()
      ]);
      setSales(salesData);
      setPendingSales(pendingData);
      setStock(stockData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'quantity' || name === 'buy_price' || name === 'sell_price' || name === 'fees' ? Number(value) : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const profit = (formData.sell_price || 0) - ((formData.buy_price || 0) * (formData.quantity || 1) + (formData.fees || 0));
      
      if (editingSale) {
        const updatedSale: Partial<Sale> = {
          ...formData,
          profit,
          userId: editingSale.userId
        };
        console.log('Attempting to update sale:', editingSale.id, updatedSale);
        try {
          await apiService.updateSale(editingSale.id!, updatedSale);
          setIsModalOpen(false);
          setEditingSale(null);
        } catch (err) {
          console.error('Update failed:', err);
          alert('Hiba történt a módosítás mentésekor: ' + (err as Error).message);
          return; // Don't reset form if it failed
        }
      } else {
        const pendingData: Omit<PendingSale, 'id'> = {
          ...formData as Sale,
          profit,
          status: 'pending',
          userId: user.uid,
        };
        await apiService.addPendingSale(pendingData);
        setIsModalOpen(false);
      }
      
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Failed to save sale:', error);
    }
  };

  const handleEdit = (sale: Sale) => {
    setEditingSale(sale);
    setFormData({
      date: sale.date.split('T')[0],
      model: sale.model,
      condition: sale.condition,
      platform: sale.platform,
      quantity: sale.quantity,
      buy_price: sale.buy_price,
      sell_price: sale.sell_price,
      fees: sale.fees,
      buyer: sale.buyer || '',
      city: sale.city || '',
      tracking_number: sale.tracking_number || '',
      notes: sale.notes || '',
    });
    setIsModalOpen(true);
  };

  const confirmSale = async (pending: PendingSale) => {
    if (!isAdmin) return;
    
    // Find stock item
    const stockItem = stock.find(s => s.model === pending.model && s.condition === pending.condition);
    if (!stockItem || stockItem.quantity < pending.quantity) {
      alert('Nincs elég készlet!');
      return;
    }

    try {
      // Update stock
      await apiService.updateStock(stockItem.id!, stockItem.quantity - pending.quantity);

      // Add to sales
      const { id, status, ...saleData } = pending;
      await apiService.addSale(saleData);

      // Update pending status
      await apiService.updatePendingStatus(pending.id!, 'confirmed');
      
      fetchData();
    } catch (error) {
      console.error('Failed to confirm sale:', error);
    }
  };

  const cancelSale = async (id: string) => {
    try {
      await apiService.updatePendingStatus(id, 'cancelled');
      fetchData();
    } catch (error) {
      console.error('Failed to cancel sale:', error);
    }
  };

  const deleteSaleRecord = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eladás törlése',
      message: 'Biztosan törölni szeretnéd ezt az eladást?',
      confirmText: 'Törlés',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await apiService.deleteSale(id);
          setSelectedSales(prev => prev.filter(sid => sid !== id));
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          fetchData();
        } catch (error) {
          console.error('Failed to delete sale:', error);
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Kijelölt eladások törlése',
      message: `Biztosan törölni szeretnéd a kijelölt ${selectedSales.length} eladást?`,
      confirmText: 'Kijelölt törlése',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await Promise.all(selectedSales.map(id => apiService.deleteSale(id)));
          setSelectedSales([]);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          fetchData();
        } catch (error) {
          console.error('Failed bulk delete:', error);
        }
      }
    });
  };

  const toggleSelectSale = (id: string) => {
    setSelectedSales(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedSales.length === sales.length && sales.length > 0) {
      setSelectedSales([]);
    } else {
      setSelectedSales(sales.map(s => s.id!));
    }
  };

  const handleDeleteAllSales = async () => {
    if (!isAdmin) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'ÖSSZES eladás törlése',
      message: 'FIGYELEM! Biztosan törölni szeretnéd az ÖSSZES eladást? Ez a művelet nem vonható vissza!',
      confirmText: 'MINDEN törlése',
      variant: 'danger',
      onConfirm: async () => {
        setLoading(true);
        try {
          await apiService.deleteAllSales();
          setSelectedSales([]);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          fetchData();
        } catch (error) {
          console.error('Failed to delete all sales:', error);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      model: APP_CONFIG.models[0],
      condition: APP_CONFIG.conditions[0],
      platform: APP_CONFIG.platforms[0],
      quantity: 1,
      buy_price: 0,
      sell_price: 0,
      fees: 0,
      buyer: '',
      city: '',
      tracking_number: '',
      notes: '',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">Eladások Kezelése</h2>
        <div className="flex gap-3">
          {selectedSales.length > 0 && (
            <Button variant="ghost" onClick={handleBulkDelete} className="text-red-600 hover:bg-red-50">
              <Trash2 className="w-4 h-4 mr-2" />
              Törlés ({selectedSales.length})
            </Button>
          )}
          {isAdmin && sales.length > 0 && (
            <Button variant="ghost" onClick={handleDeleteAllSales} className="text-red-400 hover:text-red-600 hover:bg-red-50">
              <Trash2 className="w-4 h-4 mr-2" />
              Összes Törlése
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate('/data')}>
            <Download className="w-4 h-4 mr-2" />
            Exportálás
          </Button>
          <Button variant="secondary" onClick={() => setIsPendingModalOpen(true)} className="relative">
            <Clock className="w-4 h-4 mr-2" />
            Függő Eladások
            {pendingSales.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white">
                {pendingSales.length}
              </span>
            )}
          </Button>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Új Eladás
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    checked={sales.length > 0 && selectedSales.length === sales.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-6 py-4">Dátum</th>
                <th className="px-6 py-4">Modell</th>
                <th className="px-6 py-4">Állapot</th>
                <th className="px-6 py-4">Platform</th>
                <th className="px-6 py-4">Város</th>
                <th className="px-6 py-4 text-center">Menny.</th>
                <th className="px-6 py-4 text-right">Eladási Ár</th>
                <th className="px-6 py-4 text-right">Profit</th>
                <th className="px-6 py-4 text-right">Műveletek</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map((sale) => (
                <tr key={sale.id} className={cn(
                  "hover:bg-slate-50 transition-colors",
                  selectedSales.includes(sale.id!) && "bg-indigo-50/50"
                )}>
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={selectedSales.includes(sale.id!)}
                      onChange={() => toggleSelectSale(sale.id!)}
                    />
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900">{formatDate(sale.date)}</td>
                  <td className="px-6 py-4 text-slate-600">{sale.model}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">
                      {sale.condition}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{sale.platform}</td>
                  <td className="px-6 py-4 text-slate-600">{sale.city || '-'}</td>
                  <td className="px-6 py-4 text-center text-slate-600">{sale.quantity}</td>
                  <td className="px-6 py-4 text-right font-semibold text-slate-900">{formatCurrency(sale.sell_price)}</td>
                  <td className={cn("px-6 py-4 text-right font-bold", sale.profit >= 0 ? "text-emerald-600" : "text-red-600")}>
                    {formatCurrency(sale.profit)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(sale)} className="text-slate-400 hover:text-indigo-600">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteSaleRecord(sale.id!)} className="text-slate-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sales.length === 0 && (
            <div className="p-12 text-center text-slate-500">Nincsenek rögzített eladások.</div>
          )}
        </div>
      </Card>

      {/* New/Edit Sale Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingSale(null);
          resetForm();
        }} 
        title={editingSale ? "Eladás Módosítása" : "Új Eladás Rögzítése"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Dátum</label>
              <Input type="date" name="date" value={formData.date} onChange={handleInputChange} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Modell</label>
              <Select name="model" value={formData.model} onChange={handleInputChange}>
                {APP_CONFIG.models.map(m => <option key={m} value={m}>{m}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Állapot</label>
              <Select name="condition" value={formData.condition} onChange={handleInputChange}>
                {APP_CONFIG.conditions.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Platform</label>
              <Select name="platform" value={formData.platform} onChange={handleInputChange}>
                {APP_CONFIG.platforms.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Mennyiség</label>
              <Input type="number" name="quantity" value={formData.quantity} onChange={handleInputChange} min="1" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Beszerzési Ár</label>
              <Input type="number" name="buy_price" value={formData.buy_price} onChange={handleInputChange} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Eladási Ár</label>
              <Input type="number" name="sell_price" value={formData.sell_price} onChange={handleInputChange} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Vevő Neve</label>
              <Input name="buyer" value={formData.buyer} onChange={handleInputChange} placeholder="Pl. Kovács János" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Város</label>
              <Input name="city" value={formData.city} onChange={handleInputChange} placeholder="Pl. Budapest" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" type="button" onClick={() => {
              setIsModalOpen(false);
              setEditingSale(null);
              resetForm();
            }}>Mégse</Button>
            <Button type="submit">{editingSale ? "Módosítás Mentése" : "Mentés Függőként"}</Button>
          </div>
        </form>
      </Modal>

      {/* Pending Sales Modal */}
      <Modal isOpen={isPendingModalOpen} onClose={() => setIsPendingModalOpen(false)} title="Függő Eladások">
        <div className="space-y-4">
          {pendingSales.map((pending) => (
            <div key={pending.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{pending.model} ({pending.condition})</p>
                <p className="text-xs text-slate-500">{pending.platform} • {pending.quantity} db • {formatCurrency(pending.sell_price)}</p>
                <p className="text-xs font-bold text-emerald-600 mt-1">Várható profit: {formatCurrency(pending.profit)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => cancelSale(pending.id!)} className="text-red-600 hover:bg-red-50">
                  <X className="w-4 h-4" />
                </Button>
                {isAdmin && (
                  <Button size="sm" onClick={() => confirmSale(pending)} className="bg-emerald-600 hover:bg-emerald-700">
                    <Check className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {pendingSales.length === 0 && (
            <div className="py-8 text-center text-slate-500 italic">Nincsenek függő eladások.</div>
          )}
        </div>
      </Modal>

      {/* Confirmation Modal */}
      <Modal 
        isOpen={confirmModal.isOpen} 
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
        title={confirmModal.title}
      >
        <div className="space-y-6">
          <p className="text-slate-600">{confirmModal.message}</p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}>
              Mégse
            </Button>
            <Button 
              onClick={confirmModal.onConfirm}
              className={cn(
                confirmModal.variant === 'danger' ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"
              )}
            >
              {confirmModal.confirmText || 'Megerősítés'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SalesManager;