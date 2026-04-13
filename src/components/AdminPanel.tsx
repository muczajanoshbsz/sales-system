import React, { useState, useEffect } from 'react';
import { 
  Users, 
  ShoppingCart, 
  Package, 
  Activity, 
  TrendingUp, 
  ShieldCheck, 
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  User as UserIcon,
  Mail,
  Calendar,
  Filter,
  BookOpen,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Ban,
  UserCheck,
  DollarSign,
  BarChart3,
  ExternalLink,
  X,
  Ghost
} from 'lucide-react';
import { apiService } from '../services/apiService';
import { Card, Button, Badge, LoadingSpinner } from './ui/Base';
import { useFirebase } from './FirebaseProvider';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';
import { ProductModel } from '../types';

type Tab = 'stats' | 'users' | 'sales' | 'stock' | 'catalog' | 'logs';

const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('stats');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [catalogModels, setCatalogModels] = useState<ProductModel[]>([]);
  const [newModelName, setNewModelName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userInsights, setUserInsights] = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const { enterGhostMode } = useFirebase();

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'stats':
          const statsData = await apiService.getAdminStats();
          setStats(statsData);
          break;
        case 'users':
          const usersData = await apiService.getAdminUsers();
          setUsers(usersData);
          break;
        case 'sales':
          const salesData = await apiService.getAdminSales();
          setSales(salesData);
          break;
        case 'stock':
          const stockData = await apiService.getAdminStock();
          setStock(stockData);
          break;
        case 'logs':
          const logsData = await apiService.getAdminAuditLogs();
          setLogs(logsData);
          break;
        case 'catalog':
          const catalogData = await apiService.getCatalogModels();
          setCatalogModels(catalogData);
          break;
      }
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = () => {
    if (!searchTerm) {
      if (activeTab === 'users') return users;
      if (activeTab === 'sales') return sales;
      if (activeTab === 'stock') return stock;
      if (activeTab === 'logs') return logs;
      return [];
    }
    
    const term = searchTerm.toLowerCase();
    if (activeTab === 'users') return users.filter(u => u.email.toLowerCase().includes(term) || u.displayName?.toLowerCase().includes(term));
    if (activeTab === 'sales') return sales.filter(s => s.model.toLowerCase().includes(term) || s.userEmail?.toLowerCase().includes(term));
    if (activeTab === 'stock') return stock.filter(s => s.model.toLowerCase().includes(term) || s.userEmail?.toLowerCase().includes(term));
    if (activeTab === 'logs') return logs.filter(l => l.action.toLowerCase().includes(term) || l.userEmail?.toLowerCase().includes(term));
    if (activeTab === 'catalog') return catalogModels.filter(m => m.name.toLowerCase().includes(term));
    return [];
  };

  const handleAddCatalogModel = async () => {
    if (!newModelName.trim()) return;
    try {
      await apiService.addCatalogModel(newModelName.trim());
      setNewModelName('');
      fetchData();
    } catch (error) {
      console.error('Error adding model:', error);
    }
  };

  const handleToggleModelStatus = async (id: number, currentStatus: boolean) => {
    try {
      await apiService.updateCatalogModel(id, { is_active: !currentStatus });
      fetchData();
    } catch (error) {
      console.error('Error toggling status:', error);
    }
  };

  const handleDeleteModel = async (id: number) => {
    if (!confirm('Biztosan törölni szeretnéd ezt a modellt?')) return;
    try {
      await apiService.deleteCatalogModel(id);
      fetchData();
    } catch (error) {
      console.error('Error deleting model:', error);
    }
  };

  const handleUpdateUser = async (uid: string, data: any) => {
    try {
      await apiService.updateUser(uid, data);
      fetchData();
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  const handleShowInsights = async (user: any) => {
    setSelectedUser(user);
    setInsightsLoading(true);
    try {
      const insights = await apiService.getUserInsights(user.uid);
      setUserInsights(insights);
    } catch (error) {
      console.error('Error fetching insights:', error);
    } finally {
      setInsightsLoading(false);
    }
  };

  const renderCatalog = () => {
    const data = filteredData();
    
    return (
      <div className="space-y-6">
        <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Új modell neve (pl. AirPods Pro 3)..."
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <Button onClick={handleAddCatalogModel} disabled={!newModelName.trim()}>
              Hozzáadás
            </Button>
          </div>
        </Card>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Modell Név</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Állapot</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Létrehozva</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Műveletek</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={item.is_active ? 'success' : 'outline'}>
                        {item.is_active ? 'AKTÍV' : 'INAKTÍV'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 font-mono">
                      {new Date(item.created_at).toLocaleDateString('hu-HU')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleToggleModelStatus(item.id, item.is_active)}
                          className={cn(item.is_active ? "text-amber-500 hover:bg-amber-50" : "text-emerald-500 hover:bg-emerald-50")}
                        >
                          {item.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDeleteModel(item.id)}
                          className="text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderStats = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Összes Eladás</p>
              <h3 className="text-3xl font-mono font-bold text-slate-900 dark:text-white">{stats?.totalSales || 0}</h3>
            </div>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
              <ShoppingCart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
        </Card>
        <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Összes Készlet</p>
              <h3 className="text-3xl font-mono font-bold text-slate-900 dark:text-white">{stats?.totalStock || 0}</h3>
            </div>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
              <Package className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
        </Card>
        <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Felhasználók</p>
              <h3 className="text-3xl font-mono font-bold text-slate-900 dark:text-white">{stats?.totalUsers || 0}</h3>
            </div>
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>
        <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Összes Profit</p>
              <h3 className="text-3xl font-mono font-bold text-slate-900 dark:text-white">
                {new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(stats?.totalProfit || 0)}
              </h3>
            </div>
            <div className="p-2 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
              <TrendingUp className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-6 h-6 text-indigo-600" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Rendszer Állapot</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Adatbázis Kapcsolat</span>
              <Badge variant="success">Aktív</Badge>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">AI Szolgáltatás</span>
              <Badge variant="success">Elérhető</Badge>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Rendszer Verzió</span>
              <span className="text-xs font-mono text-slate-500">v2.4.0-admin</span>
            </div>
          </div>
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
            <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 mb-2 uppercase tracking-wider">Admin Megjegyzés</h4>
            <p className="text-xs text-indigo-700 dark:text-indigo-400 leading-relaxed">
              Ez a felület a teljes rendszer felügyeletére szolgál. Itt láthatod az összes felhasználó tevékenységét, 
              a globális készletet és eladásokat. A fő menüpontok (Dashboard, Készlet, Eladások) továbbra is csak a 
              saját adataidat mutatják a zavartalan munkavégzés érdekében.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );

  const renderTable = () => {
    const data = filteredData();
    
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                {activeTab === 'users' && (
                  <>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Felhasználó</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">Státusz</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Szerepkör</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Utolsó Aktivitás</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Műveletek</th>
                  </>
                )}
                {activeTab === 'sales' && (
                  <>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Dátum</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Modell</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Eladó</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Profit</th>
                  </>
                )}
                {activeTab === 'stock' && (
                  <>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Modell</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Állapot</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Tulajdonos</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Készlet</th>
                  </>
                )}
                {activeTab === 'logs' && (
                  <>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Időpont</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Felhasználó</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Művelet</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Részletek</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  {activeTab === 'users' && (
                    <>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                              <UserIcon className="w-5 h-5 text-slate-500" />
                            </div>
                            {item.last_active && (Date.now() - new Date(item.last_active).getTime() < 5 * 60 * 1000) && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{item.displayName || 'Névtelen'}</p>
                            <p className="text-xs text-slate-500">{item.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant={item.is_suspended ? 'danger' : 'success'}>
                          {item.is_suspended ? 'TILTOTT' : 'AKTÍV'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={item.role === 'admin' ? 'warning' : 'info'}>
                          {item.role.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {item.last_active ? new Date(item.last_active).toLocaleString('hu-HU', { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase tracking-tighter">
                            {item.last_active ? new Date(item.last_active).toLocaleDateString('hu-HU') : 'Soha'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              if (confirm(`Biztosan be szeretnél lépni ${item.displayName || item.email} fiókjába Ghost módban?`)) {
                                enterGhostMode({ uid: item.uid, displayName: item.displayName, email: item.email }, true);
                              }
                            }}
                            title="Ghost Mode (Betekintés)"
                          >
                            <Ghost className="w-4 h-4 text-purple-500" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleShowInsights(item)}
                            title="Részletek"
                          >
                            <ExternalLink className="w-4 h-4 text-indigo-500" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleUpdateUser(item.uid, { role: item.role === 'admin' ? 'client' : 'admin' })}
                            title={item.role === 'admin' ? 'Visszaminősítés' : 'Előléptetés'}
                          >
                            <ShieldAlert className={cn("w-4 h-4", item.role === 'admin' ? "text-amber-500" : "text-blue-500")} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleUpdateUser(item.uid, { is_suspended: !item.is_suspended })}
                            title={item.is_suspended ? 'Feloldás' : 'Tiltás'}
                          >
                            {item.is_suspended ? <UserCheck className="w-4 h-4 text-emerald-500" /> : <Ban className="w-4 h-4 text-red-500" />}
                          </Button>
                        </div>
                      </td>
                    </>
                  )}
                  {activeTab === 'sales' && (
                    <>
                      <td className="px-6 py-4 text-xs font-mono text-slate-500">
                        {new Date(item.date).toLocaleDateString('hu-HU')}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{item.model}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">{item.condition}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span className="text-xs text-slate-600 dark:text-slate-400">{item.userEmail}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-mono font-bold text-emerald-600">
                          +{new Intl.NumberFormat('hu-HU').format(item.profit)} Ft
                        </span>
                      </td>
                    </>
                  )}
                  {activeTab === 'stock' && (
                    <>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{item.model}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
                          {item.condition}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-600 dark:text-slate-400">{item.userEmail}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={cn(
                          "text-sm font-mono font-bold",
                          item.quantity > 5 ? "text-slate-900 dark:text-white" : "text-amber-500"
                        )}>
                          {item.quantity} db
                        </span>
                      </td>
                    </>
                  )}
                  {activeTab === 'logs' && (
                    <>
                      <td className="px-6 py-4 text-[10px] font-mono text-slate-500">
                        {new Date(item.timestamp).toLocaleString('hu-HU')}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{item.userEmail}</span>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-tighter">
                          {item.action}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-500 truncate max-w-[200px] block">
                          {item.details}
                        </span>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 text-slate-200" />
                      <p className="text-sm text-slate-400">Nincs találat a keresési feltételeknek megfelelően.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-600" />
            Rendszerfelügyelet
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-1">Globális statisztikák és rendszerkezelés</p>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto no-scrollbar max-w-full">
          <button
            onClick={() => setActiveTab('stats')}
            className={cn(
              "px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'stats' ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Statisztika
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={cn(
              "px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'users' ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            Csapat
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={cn(
              "px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'sales' ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Eladások
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={cn(
              "px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'stock' ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Package className="w-3.5 h-3.5" />
            Készlet
          </button>
          <button
            onClick={() => setActiveTab('catalog')}
            className={cn(
              "px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'catalog' ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Katalógus
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={cn(
              "px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'logs' ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Activity className="w-3.5 h-3.5" />
            Napló
          </button>
        </div>
      </div>

      {activeTab !== 'stats' && (
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Keresés..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Szűrés
          </Button>
        </div>
      )}

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {activeTab === 'stats' ? renderStats() : activeTab === 'catalog' ? renderCatalog() : renderTable()}
        </motion.div>
      )}

      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <UserIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedUser.displayName || 'Névtelen'}</h2>
                    <p className="text-sm text-slate-500">{selectedUser.email}</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setSelectedUser(null); setUserInsights(null); }}
                  className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {insightsLoading ? (
                  <div className="h-64 flex items-center justify-center">
                    <LoadingSpinner size="lg" />
                  </div>
                ) : (
                  <>
                    {/* Quick Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className="p-4 bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30">
                        <div className="flex items-center gap-3 mb-2">
                          <DollarSign className="w-4 h-4 text-emerald-600" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Egyéni Profit</span>
                        </div>
                        <p className="text-2xl font-mono font-bold text-emerald-600">
                          {formatCurrency(userInsights?.totalProfit || 0)}
                        </p>
                      </Card>
                      <Card className="p-4 bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30">
                        <div className="flex items-center gap-3 mb-2">
                          <Package className="w-4 h-4 text-blue-600" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-400">Aktuális Készlet</span>
                        </div>
                        <p className="text-2xl font-mono font-bold text-blue-600">
                          {userInsights?.stock?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0} db
                        </p>
                      </Card>
                      <Card className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/30">
                        <div className="flex items-center gap-3 mb-2">
                          <Clock className="w-4 h-4 text-indigo-600" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-700 dark:text-indigo-400">Utolsó Belépés</span>
                        </div>
                        <p className="text-sm font-bold text-indigo-900 dark:text-indigo-300">
                          {selectedUser.last_login ? new Date(selectedUser.last_login).toLocaleString('hu-HU') : 'Soha'}
                        </p>
                      </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Stock Details */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <Package className="w-4 h-4 text-slate-400" />
                          Részletes Készlet
                        </h3>
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                                <th className="px-4 py-2 font-bold text-slate-500">Modell</th>
                                <th className="px-4 py-2 font-bold text-slate-500">Állapot</th>
                                <th className="px-4 py-2 font-bold text-slate-500 text-right">Mennyiség</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {userInsights?.stock?.map((item: any, idx: number) => (
                                <tr key={idx}>
                                  <td className="px-4 py-2 font-bold text-slate-700 dark:text-slate-300">{item.model}</td>
                                  <td className="px-4 py-2 text-slate-500 uppercase tracking-tighter">{item.condition}</td>
                                  <td className="px-4 py-2 text-right font-mono font-bold text-indigo-600">{item.quantity} db</td>
                                </tr>
                              ))}
                              {(!userInsights?.stock || userInsights.stock.length === 0) && (
                                <tr>
                                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400 italic">Nincs készleten lévő termék.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Activity Logs */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-slate-400" />
                          Utolsó Aktivitások
                        </h3>
                        <div className="space-y-3">
                          {userInsights?.logs?.map((log: any, idx: number) => (
                            <div key={idx} className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 flex justify-between items-start gap-3">
                              <div>
                                <p className="text-xs font-bold text-slate-900 dark:text-white">{log.action}</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">{log.details}</p>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                                {new Date(log.timestamp).toLocaleString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ))}
                          {(!userInsights?.logs || userInsights.logs.length === 0) && (
                            <div className="py-8 text-center text-slate-400 text-xs italic">Nincs rögzített aktivitás.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPanel;
