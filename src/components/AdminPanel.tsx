import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Users, 
  ShoppingCart, 
  Package, 
  Activity, 
  TrendingUp, 
  ShieldCheck, 
  Search,
  Brain,
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
  Ghost,
  Database,
  Download,
  Upload,
  History,
  FileJson,
  FileSpreadsheet,
  AlertTriangle,
  RefreshCw,
  Stethoscope,
  Trash,
  Settings,
  Archive,
  Lock,
  Cloud,
  FileText,
  Send,
  Award,
  PieChart,
  ChevronRight,
  Bot,
  Sparkles,
  MessageSquare,
  TrendingUp as TrendingUpIcon,
  Info
} from 'lucide-react';
import { apiService } from '../services/apiService';
import { Card, Button, Badge, LoadingSpinner } from './ui/Base';
import { Modal } from './ui/Modal';
import { useFirebase } from './FirebaseProvider';
import { useToast } from './ToastContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';
import { ProductModel } from '../types';

import { GhostModeModal } from './GhostModeModal';

type Tab = 'stats' | 'users' | 'sales' | 'stock' | 'catalog' | 'logs' | 'backups' | 'diagnostics' | 'reports';

const AdminPanel: React.FC = () => {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as Tab) || 'stats';
  const setActiveTab = (tab: Tab) => setSearchParams({ tab });

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [catalogModels, setCatalogModels] = useState<ProductModel[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<{ report: string; timestamp: string } | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagHistory, setDiagHistory] = useState<{ role: 'user' | 'model'; content: string }[]>([]);
  const [diagInput, setDiagInput] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showBackupAlert, setShowBackupAlert] = useState(false);
  const [isCreatingAutoBackup, setIsCreatingAutoBackup] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userInsights, setUserInsights] = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [ghostModalOpen, setGhostModalOpen] = useState(false);
  const [vaultSetupOpen, setVaultSetupOpen] = useState(false);
  const [vaultConfigInput, setVaultConfigInput] = useState('');
  const [configs, setConfigs] = useState<any[]>([]);
  const [ghostTarget, setGhostTarget] = useState<any>(null);
  const { enterGhostMode, enterTimeTravel } = useFirebase();

  useEffect(() => {
    fetchData();
    if (activeTab === 'backups' || activeTab === 'stats') {
      checkDailyBackup();
    }
  }, [activeTab]);

  const checkDailyBackup = async () => {
    try {
      const allBackups = await apiService.getBackups();
      const today = new Date().toISOString().split('T')[0];
      const hasTodayAuto = allBackups.some(b => 
        b.type === 'auto' && b.created_at.startsWith(today)
      );

      if (!hasTodayAuto) {
        setShowBackupAlert(true);
      }
    } catch (error) {
      console.error('Error checking daily backup:', error);
    }
  };

  const handleCreateAutoBackup = async () => {
    setIsCreatingAutoBackup(true);
    try {
      await apiService.createBackup();
      setShowBackupAlert(false);
      fetchData();
    } catch (error) {
      console.error('Error creating auto backup:', error);
      alert('Hiba a mentés során');
    } finally {
      setIsCreatingAutoBackup(false);
    }
  };

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
        case 'backups':
          const [backupsData, configsData] = await Promise.all([
            apiService.getBackups(),
            apiService.getSystemConfigs()
          ]);
          setBackups(backupsData);
          setConfigs(configsData);
          break;
        case 'reports':
          const reportData = await apiService.getWeeklyReport();
          setWeeklyReport(reportData);
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
      if (activeTab === 'catalog') return catalogModels;
      if (activeTab === 'backups') return backups;
      return [];
    }
    
    const term = searchTerm.toLowerCase();
    if (activeTab === 'users') return users.filter(u => u.email.toLowerCase().includes(term) || u.displayName?.toLowerCase().includes(term));
    if (activeTab === 'sales') return sales.filter(s => s.model.toLowerCase().includes(term) || s.userEmail?.toLowerCase().includes(term));
    if (activeTab === 'stock') return stock.filter(s => s.model.toLowerCase().includes(term) || s.userEmail?.toLowerCase().includes(term));
    if (activeTab === 'logs') return logs.filter(l => l.action.toLowerCase().includes(term) || l.userEmail?.toLowerCase().includes(term));
    if (activeTab === 'catalog') return catalogModels.filter(m => m.name.toLowerCase().includes(term));
    if (activeTab === 'backups') return (Array.isArray(backups) ? backups : []).filter(b => b.filename.toLowerCase().includes(term) || (b.created_by || '').toLowerCase().includes(term));
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
                              setGhostTarget(item);
                              setGhostModalOpen(true);
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

  const handleRunDiagnostics = async (message?: string) => {
    setDiagLoading(true);
    try {
      const userMessage = message || diagInput;
      if (message || diagInput) {
        setDiagHistory(prev => [...prev, { role: 'user', content: userMessage }]);
      }
      
      const analysis = await apiService.getAIDiagnostics(userMessage, diagHistory);
      
      setDiagnostics({
        report: analysis,
        timestamp: new Date().toISOString()
      });
      setDiagHistory(prev => [...prev, { role: 'model', content: analysis }]);
      setDiagInput('');
    } catch (error) {
      console.error('Diagnostics failed:', error);
    } finally {
      setDiagLoading(false);
    }
  };

  const renderDiagnostics = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Info & Actions */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6 bg-gradient-to-br from-indigo-600 to-violet-700 border-none text-white overflow-hidden relative">
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-4">
                <Stethoscope className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-black tracking-tight mb-2">AI Rendszer-Doktor</h3>
              <p className="text-indigo-100 text-sm leading-relaxed mb-6">
                A Gemini AI átvizsgálja a rendszeredet, elemzi a hibanaplókat, a készletet és a mentéseket, hogy segítsen a hibaelhárításban.
              </p>
              <Button 
                onClick={() => handleRunDiagnostics()} 
                disabled={diagLoading}
                className="w-full bg-white text-indigo-600 hover:bg-indigo-50 font-bold uppercase tracking-widest text-[10px] py-4 rounded-xl shadow-xl shadow-indigo-900/20"
              >
                {diagLoading ? <LoadingSpinner size="sm" /> : (
                  <>
                    <Activity className="w-4 h-4 mr-2" />
                    Teljes Ellenőrzés
                  </>
                )}
              </Button>
            </div>
            {/* Decorative circles */}
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -left-10 -top-10 w-32 h-32 bg-indigo-400/20 rounded-full blur-2xl"></div>
          </Card>

          <Card className="p-6 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              Mire képes a Doktor?
            </h4>
            <ul className="space-y-3">
              {[
                'Hibanaplók elemzése',
                'Készlethiány előrejelzés',
                'Mentési integritás ellenőrzése',
                'Üzleti anomáliák kiszűrése',
                'Technikai segítségnyújtás'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Right Column: Chat/Report Area */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="flex flex-col h-[600px] border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Bot className="w-5 h-5 text-indigo-600" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900"></div>
                </div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Diagnosztikai Konzultáció</h3>
              </div>
              {diagnostics && (
                <span className="text-[10px] text-slate-400 font-medium">
                  Utolsó jelentés: {new Date(diagnostics.timestamp).toLocaleTimeString('hu-HU')}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
              {diagHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                  <MessageSquare className="w-12 h-12 text-slate-300" />
                  <p className="text-sm font-medium text-slate-400 max-w-xs">
                    Indíts egy teljes ellenőrzést, vagy kérdezz valamit a rendszerről!
                  </p>
                </div>
              ) : (
                diagHistory.map((chat, idx) => (
                  <div key={idx} className={cn(
                    "flex gap-4 max-w-[85%]",
                    chat.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                  )}>
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                      chat.role === 'user' ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    )}>
                      {chat.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={cn(
                      "p-4 rounded-2xl text-sm leading-relaxed",
                      chat.role === 'user' 
                        ? "bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-100 dark:shadow-none" 
                        : "bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 rounded-tl-none border border-slate-100 dark:border-slate-800"
                    )}>
                      <div className="whitespace-pre-wrap">{chat.content}</div>
                    </div>
                  </div>
                ))
              )}
              {diagLoading && (
                <div className="flex gap-4 mr-auto max-w-[85%] animate-pulse">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-tl-none">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                      <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (diagInput.trim()) handleRunDiagnostics();
                }}
                className="relative"
              >
                <input 
                  type="text"
                  value={diagInput}
                  onChange={(e) => setDiagInput(e.target.value)}
                  placeholder="Kérdezz a Doktortól..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  disabled={diagLoading}
                />
                <button 
                  type="submit"
                  disabled={diagLoading || !diagInput.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg disabled:opacity-30 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );

  const safeParseMetadata = (metadata: string | null) => {
    try {
      return JSON.parse(metadata || '{}');
    } catch (e) {
      return {};
    }
  };

  const renderVaultSetupModal = () => (
    <Modal isOpen={vaultSetupOpen} onClose={() => setVaultSetupOpen(false)} title="Recovery Vault Konfigurálása">
      <div className="space-y-6">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 p-4 rounded-xl flex gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            Hozzon létre egy <strong>Google Service Account</strong>-ot a Google Cloud Console-ban, 
            majd töltse le a JSON kulcsot és másolja be ide a tartalmát. 
            Szüksége lesz egy <strong>folder_id</strong>-ra is a JSON-ön belül, ahová a mentések kerülnek.
          </p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="text-xs font-black uppercase text-slate-500 mb-2 block tracking-widest">Service Account JSON (kiegészítve folder_id-val)</label>
            <textarea
              className="w-full h-48 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-[10px] font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder='{ "type": "service_account", ..., "folder_id": "..." }'
              value={vaultConfigInput}
              onChange={(e) => setVaultConfigInput(e.target.value)}
            />
          </div>
          
          <Button 
            className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 rounded-xl font-bold shadow-lg shadow-indigo-200"
            onClick={async () => {
              try {
                JSON.parse(vaultConfigInput);
                await apiService.updateSystemConfig('GOOGLE_DRIVE_CONFIG', vaultConfigInput);
                showToast('Vault konfiguráció sikeresen mentve!', 'success');
                setVaultSetupOpen(false);
                fetchData();
              } catch (e) {
                showToast('Érvénytelen JSON vagy mentési hiba', 'error');
              }
            }}
          >
            Vault Aktiválása
          </Button>
        </div>
      </div>
    </Modal>
  );

  const renderBackups = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/30">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Database className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Manuális Mentés</h3>
              <p className="text-xs text-slate-500">Azonnali rendszermentés</p>
            </div>
          </div>
          <Button 
            className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
            onClick={async () => {
              try {
                await apiService.createBackup();
                fetchData();
              } catch (error) {
                alert('Mentés sikertelen');
              }
            }}
          >
            <Plus className="w-4 h-4" />
            Mentés Indítása
          </Button>
        </Card>

        <Card className="p-6 bg-slate-900 border-none text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
            <ShieldCheck className="w-24 h-24" />
          </div>
          <div className="flex items-center gap-4 mb-4 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
              <Archive className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white">System Artifact</h3>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Kód + Adatbázis Snapshot</p>
            </div>
          </div>
          <Button 
            className="w-full gap-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold h-12 rounded-xl relative z-10"
            onClick={async () => {
              if (confirm('Ez egy teljes rendszer-pillanatképet készít (Kód + Adatbázis) és titkosítja azt. Biztosan elindítod?')) {
                try {
                  showToast('Rendszer snapshot generálása elindult...', 'info');
                  await apiService.createSystemArtifact();
                  showToast('Rendszer snapshot sikeresen elkészült!', 'success');
                  fetchData();
                } catch (error) {
                  showToast('Hiba történt a generálás során', 'error');
                }
              }
            }}
          >
            <Lock className="w-4 h-4" />
            Snapshot Generálása
          </Button>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Adat Export</h3>
              <p className="text-xs text-slate-500">Excel formátumú letöltés</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              className="flex-1 gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-11"
              onClick={() => apiService.exportData('xlsx')}
            >
              <Download className="w-4 h-4" />
              XLSX
            </Button>
            <Button 
              variant="outline"
              className="flex-1 gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-11"
              onClick={() => apiService.exportData('json')}
            >
              <FileJson className="w-4 h-4" />
              JSON
            </Button>
          </div>
        </Card>

        <Card className="p-6 bg-amber-50/50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Cloud className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Recovery Vault</h3>
              <p className="text-xs text-slate-500">Google Drive Automata Mentés</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className={`text-[10px] ${(Array.isArray(configs) ? configs : []).some(c => c.key === 'GOOGLE_DRIVE_CONFIG') ? 'bg-emerald-200/50 text-emerald-800' : 'bg-amber-200/50 text-amber-800'} dark:bg-amber-900/30 p-2 rounded-lg font-bold text-center`}>
              {(Array.isArray(configs) ? configs : []).some(c => c.key === 'GOOGLE_DRIVE_CONFIG') 
                ? '✅ VAULT AKTÍV: Google Drive csatlakozva.' 
                : '⚠️ SETUP SZÜKSÉGES: Csatlakoztasd a Google Service Accountot.'}
            </div>
            <Button 
              variant="outline"
              className="w-full gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 h-11"
              onClick={() => setVaultSetupOpen(true)}
            >
              <Settings className="w-4 h-4" />
              Konfigurálás
            </Button>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-slate-400" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Mentési Előzmények</h3>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase tracking-widest">Utolsó 50 mentés</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Időpont</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Típus</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Méret</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Készítette</th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Műveletek</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {Array.isArray(backups) && backups.map((backup) => (
                <tr key={backup.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {new Date(backup.created_at).toLocaleString('hu-HU')}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">{backup.filename}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Badge variant={backup.type === 'auto' ? 'info' : backup.type === 'system' ? 'outline' : 'outline'} className="text-[10px] uppercase tracking-tighter">
                        {backup.type === 'auto' ? 'Automatikus' : backup.type === 'system' ? 'Snapshot' : 'Manuális'}
                      </Badge>
                      {safeParseMetadata(backup.metadata).googleDriveId && (
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title="Feltöltve a Vaultba">
                          <Cloud className="w-3 h-3" />
                          <span className="text-[8px] font-black uppercase">Vault</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-slate-500">
                    {(backup.size / 1024).toFixed(2)} KB
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 italic">
                    {backup.created_by}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {backup.type !== 'system' && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-indigo-600 hover:bg-indigo-50"
                          onClick={() => enterTimeTravel(backup.id.toString(), backup.created_at)}
                          title="Time Travel (Betekintés)"
                        >
                          <Clock className="w-4 h-4" />
                        </Button>
                      )}
                      
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-emerald-600 hover:bg-emerald-50"
                        onClick={async () => {
                          try {
                            if (backup.type === 'system') {
                              await apiService.downloadSystemArtifact(backup.id, backup.filename);
                            } else {
                              await apiService.downloadBackup(backup.id);
                            }
                          } catch (error) {
                            alert('Letöltés sikertelen: ' + (error as Error).message);
                          }
                        }}
                        title="Letöltés"
                      >
                        <Download className="w-4 h-4" />
                      </Button>

                      {backup.type === 'system' && (Array.isArray(configs) ? configs : []).some(c => c.key === 'GOOGLE_DRIVE_CONFIG') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          title="Feltöltés a Vaultba (Google Drive)"
                          onClick={async () => {
                            try {
                              showToast('Feltöltés a Vaultba folyamatban...', 'info');
                              await apiService.uploadToVault(backup.id);
                              showToast('Artifact sikeresen mentve a Vaultba!', 'success');
                              fetchData();
                            } catch (e) {
                              showToast('Vault feltöltés sikertelen', 'error');
                            }
                          }}
                        >
                          <Cloud className="w-4 h-4" />
                        </Button>
                      )}

                      {backup.type !== 'system' && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-600 hover:bg-red-50"
                          onClick={async () => {
                            if (confirm('FIGYELEM! A rendszer visszaállítása felülírja a jelenlegi adatokat. Biztosan folytatod?')) {
                              try {
                                await apiService.restoreBackup(backup.id);
                                alert('Rendszer sikeresen visszaállítva');
                                window.location.reload();
                              } catch (error) {
                                alert('Visszaállítás sikertelen');
                              }
                            }
                          }}
                          title="Visszaállítás"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(Array.isArray(backups) ? backups : []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                    Még nem készült biztonsági mentés.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="p-6 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-900/30 flex items-start gap-4">
        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h4 className="text-sm font-black text-amber-900 dark:text-amber-400 uppercase tracking-wider mb-1">Biztonsági Figyelmeztetés</h4>
          <p className="text-xs text-amber-800 dark:text-amber-500 leading-relaxed">
            A rendszer visszaállítása egy korábbi mentésből <strong>visszafordíthatatlan folyamat</strong>. A jelenlegi adatok elvesznek, és a mentéskori állapot lép a helyükbe. Javasoljuk, hogy visszaállítás előtt készíts egy friss manuális mentést a jelenlegi állapotról.
          </p>
        </div>
      </div>
    </div>
  );

  const renderReports = () => {
    const handleTestSend = async () => {
      setTestLoading(true);
      try {
        await apiService.testSendReport();
        alert('📊 Teszt jelentés sikeresen elküldve az e-mail címedre!');
        fetchData();
      } catch (error) {
        alert('❌ Hiba a küldés során: ' + (error as Error).message);
      } finally {
        setTestLoading(false);
      }
    };

    const data = weeklyReport?.report_json || weeklyReport?.data;

    if (!weeklyReport || !data) {
      return (
        <div className="h-96 flex flex-col items-center justify-center text-center space-y-6 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-full">
            <TrendingUpIcon className="w-10 h-10 text-indigo-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Nincs Aktív Jelentés</h3>
            <p className="text-slate-500 max-w-xs mx-auto text-sm">A rendszer automatikusan generálja a jelentéseket, de bármikor kérhetsz egy friss tesztet.</p>
          </div>
          <Button 
            onClick={handleTestSend} 
            disabled={testLoading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 h-12 rounded-xl shadow-lg shadow-indigo-500/20 transition-all"
          >
            {testLoading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generálás...
              </span>
            ) : "Friss jelentés generálása"}
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Heti Üzleti Jelentés</h2>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
              <Calendar className="w-4 h-4" />
              <span>{new Date(weeklyReport.start_date).toLocaleDateString('hu-HU')} - {new Date(weeklyReport.end_date).toLocaleDateString('hu-HU')}</span>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleTestSend} 
            disabled={testLoading}
            className="gap-2 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 h-11 px-6 rounded-xl text-indigo-600 font-bold"
          >
            <Send className={cn("w-4 h-4", testLoading && "animate-pulse")} />
            {testLoading ? "Küldés..." : "Friss teszt jelentés küldése"}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Summary Card */}
          <Card className="lg:col-span-1 p-6 bg-gradient-to-br from-slate-900 to-slate-800 border-none text-white shadow-xl overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
              <TrendingUpIcon className="w-32 h-32" />
            </div>
            
            <div className="flex items-center gap-3 mb-8 relative z-10">
              <div className="p-2 bg-white/10 rounded-lg">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="font-bold uppercase tracking-widest text-xs">Mérőszámok</h3>
            </div>

            <div className="space-y-6 relative z-10">
              <div className="p-5 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Heti Profit</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white">
                    {formatCurrency(data.financials?.totalProfit || 0)}
                  </span>
                  <TrendingUpIcon className="w-4 h-4 text-emerald-400" />
                </div>
              </div>

              <div className="p-5 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Eladott Mennyiség</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white">
                    {data.financials?.totalSales || 0} db
                  </span>
                  <ShoppingCart className="w-4 h-4 text-blue-400" />
                </div>
              </div>

              <div className="p-5 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sztártermék</p>
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  <span className="text-sm font-bold text-white">
                    {data.topProduct?.model || 'N/A'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  {data.topProduct?.count || 0} eladás az elmúlt időszakban
                </p>
              </div>
            </div>
          </Card>

          {/* AI Analysis */}
          <Card className="lg:col-span-2 p-8 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl rounded-3xl">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                <Brain className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">AI Vezetői Jelentés</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Szakértői elemzés az adataid alapján</p>
              </div>
            </div>

            <div className="prose dark:prose-invert max-w-none">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-8 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 leading-relaxed text-sm font-medium whitespace-pre-wrap">
                {weeklyReport.report_text}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-indigo-500" />
                  Készlet Audit
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Összes készlet:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{data.inventory?.totalStock || 0} db</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Alacsony stock:</span>
                    <span className={cn("font-bold", (data.inventory?.lowStockItems?.length || 0) > 0 ? "text-amber-500" : "text-emerald-500")}>
                      {data.inventory?.lowStockItems?.length || 0} modell
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  Rendszer Egészség
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Mentés Status:</span>
                    <span className="font-bold text-emerald-500">OPTIMÁLIS</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Integritás:</span>
                    <span className="font-bold text-slate-900 dark:text-white">ÉP</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'stats': return renderStats();
      case 'catalog': return renderCatalog();
      case 'backups': return renderBackups();
      case 'diagnostics': return renderDiagnostics();
      case 'reports': return renderReports();
      default: return renderTable();
    }
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
        
        <div className="flex items-center gap-1 sm:gap-2 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto custom-scrollbar max-w-full pb-2 sm:pb-1">
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
            onClick={() => setActiveTab('backups')}
            className={cn(
              "px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'backups' ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Database className="w-3.5 h-3.5" />
            Mentés
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={cn(
              "px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'diagnostics' ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            AI Diagnózis
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={cn(
              "px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'reports' ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            Heti Jelentés
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
          {renderContent()}
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

      <GhostModeModal
        isOpen={ghostModalOpen}
        onClose={() => setGhostModalOpen(false)}
        onConfirm={(readOnly) => {
          if (ghostTarget) {
            enterGhostMode({ 
              uid: ghostTarget.uid, 
              displayName: ghostTarget.displayName, 
              email: ghostTarget.email 
            }, readOnly);
          }
          setGhostModalOpen(false);
        }}
        targetUser={ghostTarget || { email: '' }}
      />

      {/* Missing Backup Alert Modal */}
      <AnimatePresence>
        {showBackupAlert && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle className="w-10 h-10 text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-4 uppercase tracking-tight">
                  Hiányzó Napi Mentés!
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                  A rendszer nem talált automatikus biztonsági mentést a mai napra. 
                  A biztonságos üzemeltetés érdekében javasolt a mentés pótlása.
                </p>
                <div className="flex flex-col gap-3">
                  <Button 
                    variant="primary" 
                    className="w-full py-4 text-sm font-black uppercase tracking-widest shadow-lg shadow-indigo-200 dark:shadow-none"
                    onClick={handleCreateAutoBackup}
                    disabled={isCreatingAutoBackup}
                  >
                    {isCreatingAutoBackup ? (
                      <div className="flex items-center gap-2">
                        <LoadingSpinner size="sm" />
                        Mentés folyamatban...
                      </div>
                    ) : (
                      'Mentés pótlása most'
                    )}
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full py-3 text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest"
                    onClick={() => setShowBackupAlert(false)}
                    disabled={isCreatingAutoBackup}
                  >
                    Később emlékeztess
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {renderVaultSetupModal()}
    </div>
  );
};

export default AdminPanel;
