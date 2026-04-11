import React, { useEffect, useState } from 'react';
import { Sale, PendingSale, StockItem } from '../types';
import { Button, Card, Input, Select } from './ui/Base';
import { Modal } from './ui/Modal';
import { formatCurrency, formatDate, cn, translateError } from '../lib/utils';
import { APP_CONFIG } from '../constants';
import { Plus, Edit2, Trash2, Check, X, Clock, Database, Download, ShoppingCart } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { useToast } from './ToastContext';
import { apiService } from '../services/apiService';
import { useNavigate } from 'react-router-dom';

const SalesManager: React.FC = () => {
  const { user, isAdmin } = useFirebase();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [models, setModels] = useState<string[]>([]);
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
      const [salesData, pendingData, stockData, modelsData] = await Promise.all([
        apiService.getSales(),
        apiService.getPendingSales(),
        apiService.getStock(),
        apiService.getActiveModels()
      ]);
      setSales(salesData);
      setPendingSales(pendingData);
      setStock(stockData);
      setModels(modelsData);
      
      if (modelsData.length > 0 && !formData.model) {
        setFormData(prev => ({ ...prev, model: modelsData[0] }));
      }
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
          showToast('Eladás sikeresen módosítva', 'success');
        } catch (err) {
          showToast(translateError(err), 'error');
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
        showToast('Függő eladás rögzítve', 'success');
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
    if (!user) return;
    if (!isAdmin && pending.userId !== user.uid) return;
    
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
      
      showToast('Eladás sikeresen rögzítve a készletből', 'success');
      fetchData();
    } catch (error) {
      showToast(translateError(error), 'error');
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
          showToast('Eladás törölve', 'success');
          fetchData();
        } catch (error) {
          showToast(translateError(error), 'error');
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
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Eladások Kezelése</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Tranzakciók és függő tételek kezelése</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {selectedSales.length > 0 && (
            <Button variant="ghost" onClick={handleBulkDelete} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-xl font-bold uppercase tracking-widest text-[10px]">
              <Trash2 className="w-4 h-4 mr-2" />
              Törlés ({selectedSales.length})
            </Button>
          )}
          {isAdmin && sales.length > 0 && (
            <Button variant="ghost" onClick={handleDeleteAllSales} className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-xl font-bold uppercase tracking-widest text-[10px]">
              <Trash2 className="w-4 h-4 mr-2" />
              Összes Törlése
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate('/settings')} className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm rounded-xl">
            <Download className="w-4 h-4 mr-2" />
            Exportálás
          </Button>
          <Button variant="secondary" onClick={() => setIsPendingModalOpen(true)} className="relative bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm rounded-xl">
            <Clock className="w-4 h-4 mr-2" />
            Függő
            {pendingSales.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white dark:ring-slate-800">
                {pendingSales.length}
              </span>
            )}
          </Button>
          <Button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 rounded-xl">
            <Plus className="w-4 h-4 mr-2" />
            Új Eladás
          </Button>
        </div>
      </div>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm text-left">
            <thead className="text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    checked={sales.length > 0 && selectedSales.length === sales.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-6 py-4">Dátum</th>
                <th className="px-6 py-4">Modell</th>
                <th className="px-6 py-4">Platform</th>
                <th className="px-6 py-4 text-center">Menny.</th>
                <th className="px-6 py-4 text-right">Eladási Ár</th>
                <th className="px-6 py-4 text-right">Profit</th>
                <th className="px-6 py-4 text-right">Műveletek</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sales.map((sale) => (
                <tr key={sale.id} className={cn(
                  "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group",
                  selectedSales.includes(sale.id!) && "bg-indigo-50/50 dark:bg-indigo-900/20"
                )}>
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      checked={selectedSales.includes(sale.id!)}
                      onChange={() => toggleSelectSale(sale.id!)}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 dark:text-white">{formatDate(sale.date)}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-0.5">{sale.city || 'Nincs megadva'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 dark:text-white">{sale.model}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-0.5">{sale.condition}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                      {sale.platform}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-slate-900 dark:text-white">{sale.quantity}</td>
                  <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">{formatCurrency(sale.sell_price)}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={cn(
                      "px-2 py-0.5 rounded-lg text-xs font-bold",
                      sale.profit >= 0 ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                    )}>
                      {formatCurrency(sale.profit)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(sale)} className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteSaleRecord(sale.id!)} className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sales.length === 0 && (
            <div className="p-20 text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShoppingCart className="w-10 h-10 text-slate-200" />
              </div>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nincsenek rögzített eladások</p>
            </div>
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
                {models.map(m => <option key={m} value={m}>{m}</option>)}
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
              <label htmlFor="quantity" className="text-sm font-medium">Mennyiség</label>
              <Input 
                id="quantity"
                type="number" 
                name="quantity" 
                value={formData.quantity} 
                onChange={handleInputChange} 
                min="1" 
                required 
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="buy_price" className="text-sm font-medium">Beszerzési Ár</label>
              <Input 
                id="buy_price"
                type="number" 
                name="buy_price" 
                value={formData.buy_price} 
                onChange={handleInputChange} 
                min="0"
                required 
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="sell_price" className="text-sm font-medium">Eladási Ár</label>
              <Input 
                id="sell_price"
                type="number" 
                name="sell_price" 
                value={formData.sell_price} 
                onChange={handleInputChange} 
                min="0"
                required 
                aria-required="true"
              />
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
            <div key={pending.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{pending.model} ({pending.condition})</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{pending.platform} • {pending.quantity} db • {formatCurrency(pending.sell_price)}</p>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1">Várható profit: {formatCurrency(pending.profit)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => cancelSale(pending.id!)} className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <X className="w-4 h-4" />
                </Button>
                {(isAdmin || pending.userId === user?.uid) && (
                  <Button size="sm" onClick={() => confirmSale(pending)} className="bg-emerald-600 hover:bg-emerald-700">
                    <Check className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {pendingSales.length === 0 && (
            <div className="py-8 text-center text-slate-500 dark:text-slate-400 italic">Nincsenek függő eladások.</div>
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
          <p className="text-slate-600 dark:text-slate-400">{confirmModal.message}</p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="dark:text-slate-400 dark:hover:bg-slate-800">
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
