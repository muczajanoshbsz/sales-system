import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Select } from './ui/Base';
import { 
  Settings as SettingsIcon, 
  Bell, 
  DollarSign, 
  Shield, 
  Save, 
  RefreshCcw, 
  User, 
  Mail, 
  ShieldCheck, 
  Database, 
  Layout, 
  Smartphone,
  Globe,
  Lock,
  History,
  Eye,
  EyeOff,
  Download,
  Upload,
  Trash2,
  Info,
  AlertTriangle
} from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { cn } from '../lib/utils';
import SystemBackup from './SystemBackup';
import DataExporter from './DataExporter';
import DataImporter from './DataImporter';
import { motion, AnimatePresence } from 'motion/react';
import { apiService } from '../services/apiService';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { useToast } from './ToastContext';

type TabType = 'general' | 'notifications' | 'data' | 'profile';

const Settings: React.FC = () => {
  const { profile, isAdmin } = useFirebase();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [settings, setSettings] = useState({
    currency: 'HUF',
    lowStockThreshold: 5,
    criticalStockThreshold: 2,
    defaultPlatform: 'Vatera',
    notificationsEnabled: true,
    autoBackup: false,
    theme: 'light',
    language: 'hu',
    compactMode: false,
  });

  useEffect(() => {
    const savedSettings = localStorage.getItem('app_settings');
    if (savedSettings) {
      setSettings(prev => ({ ...prev, ...JSON.parse(savedSettings) }));
    }
  }, []);

  const handleSave = () => {
    setLoading(true);
    localStorage.setItem('app_settings', JSON.stringify(settings));
    
    // Trigger theme/compact mode update in App.tsx
    window.dispatchEvent(new CustomEvent('settings-updated'));
    
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      showToast('Beállítások sikeresen mentve!', 'success');
      setTimeout(() => setSuccess(false), 3000);
    }, 800);
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Biztosan törölni szeretné az összes rendszernaplót?')) return;
    try {
      await apiService.clearAuditLogs();
      showToast('Rendszernaplók törölve.', 'success');
    } catch (error) {
      showToast('Hiba a naplók törlésekor.', 'error');
    }
  };

  const handleDeleteAllData = async () => {
    if (!window.confirm('FIGYELEM! Ez a művelet véglegesen törli az ÖSSZES adatot (eladások, készlet, naplók). Biztosan folytatja?')) return;
    try {
      await apiService.deleteAllSystemData();
      showToast('Minden adat törölve.', 'success');
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      showToast('Hiba az adatok törlésekor.', 'error');
    }
  };

  const handlePasswordReset = async () => {
    if (!profile?.email) return;
    try {
      await sendPasswordResetEmail(auth, profile.email);
      showToast('Jelszó-visszaállító e-mail elküldve!', 'success');
    } catch (error) {
      showToast('Hiba az e-mail küldésekor.', 'error');
    }
  };

  const tabs = [
    { id: 'general', label: 'Általános', icon: <Layout className="w-4 h-4" /> },
    { id: 'notifications', label: 'Értesítések', icon: <Bell className="w-4 h-4" /> },
    { id: 'data', label: 'Adatkezelés', icon: <Database className="w-4 h-4" /> },
    { id: 'profile', label: 'Profil', icon: <User className="w-4 h-4" /> },
  ] as const;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-100">
            <SettingsIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Beállítások</h2>
            <p className="text-sm text-slate-500 font-medium">Rendszer és felhasználói konfiguráció</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => window.location.reload()} className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <RefreshCcw className="w-4 h-4 mr-2" />
            Alaphelyzet
          </Button>
          <Button onClick={handleSave} isLoading={loading} className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100">
            {success ? <ShieldCheck className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {success ? 'Mentve!' : 'Változtatások Mentése'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <div className="lg:w-64 shrink-0">
          <Card className="p-2 border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                    activeTab === tab.id 
                      ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-100 dark:border-slate-700" 
                      : "text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <span className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    activeTab === tab.id ? "bg-indigo-50 dark:bg-indigo-900/30" : "bg-slate-100 dark:bg-slate-800"
                  )}>
                    {tab.icon}
                  </span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </Card>

          {/* System Status Mini Card */}
          <Card className="mt-6 p-4 bg-slate-900 text-white border-none overflow-hidden relative">
            <div className="relative z-10">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Rendszer Állapot</h4>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold">Minden rendszer üzemkész</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
                  <span>Verzió</span>
                  <span className="text-white">v2.4.0-pro</span>
                </div>
                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div className="bg-indigo-500 h-full w-3/4" />
                </div>
              </div>
            </div>
            <SettingsIcon className="absolute -right-4 -bottom-4 w-24 h-24 text-white/5 rotate-12" />
          </Card>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'general' && (
                <div className="space-y-6">
                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-900/30">
                        <Globe className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Megjelenítés és Lokalizáció</h3>
                        <p className="text-xs text-slate-500">Alapvető nyelvi és pénzügyi beállítások</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Pénznem</label>
                        <p className="text-[10px] text-slate-400 mb-2">A rendszerben használt alapértelmezett valuta</p>
                        <Select 
                          value={settings.currency} 
                          onChange={(e) => setSettings({...settings, currency: e.target.value})}
                          className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                        >
                          <option value="HUF">HUF (Magyar Forint)</option>
                          <option value="EUR">EUR (Euro)</option>
                          <option value="USD">USD (USA Dollár)</option>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Nyelv</label>
                        <p className="text-[10px] text-slate-400 mb-2">A kezelőfelület nyelve</p>
                        <Select 
                          value={settings.language} 
                          onChange={(e) => setSettings({...settings, language: e.target.value})}
                          className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                        >
                          <option value="hu">Magyar (Hungarian)</option>
                          <option value="en">English (Angol)</option>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Alapértelmezett Platform</label>
                        <p className="text-[10px] text-slate-400 mb-2">Új eladás rögzítésekor ez lesz kiválasztva</p>
                        <Select 
                          value={settings.defaultPlatform} 
                          onChange={(e) => setSettings({...settings, defaultPlatform: e.target.value})}
                          className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                        >
                          <option value="Vatera">Vatera</option>
                          <option value="Jófogás">Jófogás</option>
                          <option value="Marketplace">Marketplace</option>
                          <option value="HardverApró">HardverApró</option>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Téma</label>
                        <p className="text-[10px] text-slate-400 mb-2">Válasszon a világos vagy sötét mód közül</p>
                        <div className="flex gap-2">
                          {['light', 'dark', 'system'].map((t) => (
                            <button
                              key={t}
                              onClick={() => setSettings({...settings, theme: t})}
                              className={cn(
                                "flex-1 py-2 rounded-xl text-xs font-bold border transition-all capitalize",
                                settings.theme === t 
                                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-md" 
                                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                              )}
                            >
                              {t === 'light' ? 'Világos' : t === 'dark' ? 'Sötét' : 'Rendszer'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                        <Smartphone className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Készletkezelési Szabályok</h3>
                        <p className="text-xs text-slate-500">Automatikus figyelmeztetések küszöbértékei</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Alacsony Készlet Küszöb</label>
                        <p className="text-[10px] text-slate-400 mb-2">Sárga jelzés, ha a készlet ez alá esik</p>
                        <div className="relative">
                          <Input 
                            type="number" 
                            value={settings.lowStockThreshold} 
                            onChange={(e) => setSettings({...settings, lowStockThreshold: Number(e.target.value)})}
                            className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 pl-10"
                          />
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-amber-400" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Kritikus Készlet Küszöb</label>
                        <p className="text-[10px] text-slate-400 mb-2">Piros jelzés, ha a készlet ez alá esik</p>
                        <div className="relative">
                          <Input 
                            type="number" 
                            value={settings.criticalStockThreshold} 
                            onChange={(e) => setSettings({...settings, criticalStockThreshold: Number(e.target.value)})}
                            className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 pl-10"
                          />
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-red-500" />
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {activeTab === 'notifications' && (
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-100 dark:border-rose-900/30">
                      <Bell className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">Értesítési Beállítások</h3>
                      <p className="text-xs text-slate-500">Hogyan és mikor szeretne tájékozódni</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {[
                      { id: 'notificationsEnabled', title: 'Rendszer Értesítések', desc: 'Értesítés alacsony készlet és fontos események esetén az alkalmazáson belül.' },
                      { id: 'autoBackup', title: 'Automatikus Biztonsági Mentés', desc: 'Napi rendszerességgel készítsen mentést az adatokról a felhőbe.' },
                      { id: 'compactMode', title: 'Kompakt Mód', desc: 'Sűrűbb adatelrendezés a listákban és táblázatokban.' }
                    ].map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 hover:shadow-md transition-all group">
                        <div className="max-w-md">
                          <p className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{item.title}</p>
                          <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={(settings as any)[item.id]}
                            onChange={(e) => setSettings({...settings, [item.id]: e.target.checked})}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {activeTab === 'data' && (
                <div className="space-y-6">
                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                        <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Biztonság és Mentés</h3>
                        <p className="text-xs text-slate-500">Adatbázis integritás és helyreállítás</p>
                      </div>
                    </div>
                    <SystemBackup />
                  </Card>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                          <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Exportálás</h3>
                      </div>
                      <DataExporter />
                    </Card>

                    <Card className="p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                          <Upload className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Importálás</h3>
                      </div>
                      <DataImporter />
                    </Card>
                  </div>

                  <Card className="p-6 border-dashed border-2 border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
                    <div className="flex items-center gap-3 mb-4">
                      <Lock className="w-5 h-5 text-slate-400" />
                      <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Haladó Adatkezelés</h3>
                    </div>
                    <p className="text-xs text-slate-500 mb-6">
                      Ezek a műveletek közvetlenül módosítják az adatbázis szerkezetét. Csak tapasztalt felhasználóknak ajánlott.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Button 
                        variant="secondary" 
                        onClick={handleClearLogs}
                        className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                      >
                        <History className="w-4 h-4 mr-2" />
                        Naplók Törlése
                      </Button>
                      <Button 
                        variant="secondary" 
                        onClick={handleDeleteAllData}
                        className="bg-white dark:bg-slate-800 border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Összes Adat Törlése
                      </Button>
                    </div>
                  </Card>
                </div>
              )}

              {activeTab === 'profile' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-1">
                    <Card className="p-8 text-center bg-indigo-600 text-white border-none shadow-2xl shadow-indigo-200 dark:shadow-none">
                      <div className="relative w-32 h-32 mx-auto mb-6">
                        <div className="w-full h-full bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border-4 border-white/30 shadow-inner">
                          <User className="w-16 h-16 text-white" />
                        </div>
                        <div className="absolute bottom-0 right-0 p-2 bg-emerald-400 rounded-full border-4 border-indigo-600 shadow-lg">
                          <ShieldCheck className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-black tracking-tight">{profile?.displayName || 'Felhasználó'}</h3>
                      <p className="text-indigo-100 text-sm font-medium mt-1 opacity-80">{profile?.email}</p>
                      
                      <div className="mt-8 pt-8 border-t border-white/10">
                        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-white/10 rounded-2xl text-xs font-black uppercase tracking-widest">
                          <Shield className="w-4 h-4" />
                          {profile?.role === 'admin' ? 'Rendszergazda' : 'Ügyfél'}
                        </div>
                      </div>
                    </Card>
                  </div>

                  <div className="lg:col-span-2 space-y-6">
                    <Card className="p-6">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Profil Szerkesztése</h3>
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Megjelenített Név</label>
                            <Input 
                              value={profile?.displayName || ''} 
                              disabled 
                              className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 cursor-not-allowed"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">E-mail Cím</label>
                            <Input 
                              value={profile?.email || ''} 
                              disabled 
                              className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 cursor-not-allowed"
                            />
                          </div>
                        </div>
                        
                        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex items-start gap-3">
                          <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-slate-500 leading-relaxed">
                            A profiladatok módosítása jelenleg a központi azonosító rendszeren keresztül érhető el. 
                            Ha meg szeretné változtatni az adatait, kérjük forduljon a rendszergazdához.
                          </p>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-6">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Biztonság</h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-white dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600">
                              <Lock className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">Jelszó Módosítása</p>
                              <p className="text-[10px] text-slate-500">Utoljára módosítva: 3 hónapja</p>
                            </div>
                          </div>
                          <Button 
                            variant="secondary" 
                            onClick={handlePasswordReset}
                            className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                          >
                            Módosítás
                          </Button>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-white dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600">
                              <ShieldCheck className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">Kétlépcsős Azonosítás</p>
                              <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Aktív</p>
                            </div>
                          </div>
                          <Button variant="secondary" className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">Beállítás</Button>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Settings;
