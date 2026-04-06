import React, { useEffect, useState, useMemo } from 'react';
import { Card, Button } from './ui/Base';
import { Activity, Clock, User, Info, Search, Filter, RefreshCcw, Download, FileText, Trash2, PlusCircle, Edit3, ShieldAlert } from 'lucide-react';
import { apiService } from '../services/apiService';
import { formatDate, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'CREATE' | 'UPDATE' | 'DELETE' | 'SYSTEM'>('ALL');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await apiService.getAuditLogs();
      setLogs(data);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = 
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.userEmail?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = activeFilter === 'ALL' || log.action.includes(activeFilter);
      
      return matchesSearch && matchesFilter;
    });
  }, [logs, searchTerm, activeFilter]);

  const getActionInfo = (action: string) => {
    if (action.includes('CREATE')) return { color: 'text-emerald-600 bg-emerald-50 border-emerald-100', icon: <PlusCircle className="w-4 h-4" />, label: 'Létrehozás' };
    if (action.includes('DELETE')) return { color: 'text-rose-600 bg-rose-50 border-rose-100', icon: <Trash2 className="w-4 h-4" />, label: 'Törlés' };
    if (action.includes('UPDATE')) return { color: 'text-amber-600 bg-amber-50 border-amber-100', icon: <Edit3 className="w-4 h-4" />, label: 'Módosítás' };
    if (action.includes('SYSTEM')) return { color: 'text-indigo-600 bg-indigo-50 border-indigo-100', icon: <ShieldAlert className="w-4 h-4" />, label: 'Rendszer' };
    return { color: 'text-slate-600 bg-slate-50 border-slate-100', icon: <Activity className="w-4 h-4" />, label: 'Egyéb' };
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Időpont', 'Felhasználó', 'Művelet', 'Részletek'];
    const csvContent = [
      headers.join(','),
      ...filteredLogs.map(log => [
        log.id,
        formatDate(log.timestamp),
        log.userEmail || 'Ismeretlen',
        log.action,
        `"${log.details.replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rendszernaplo_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 rounded-2xl shadow-xl shadow-slate-200">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Rendszernapló</h2>
            <p className="text-sm text-slate-500 font-medium">Audit és műveleti előzmények</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportToCSV} disabled={filteredLogs.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Exportálás
          </Button>
          <Button variant="secondary" onClick={fetchLogs} isLoading={loading}>
            <RefreshCcw className="w-4 h-4 mr-2" />
            Frissítés
          </Button>
        </div>
      </div>

      <Card className="p-2 bg-slate-50/50 border-slate-200">
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Keresés művelet, részlet vagy felhasználó alapján..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 overflow-x-auto no-scrollbar">
            {(['ALL', 'CREATE', 'UPDATE', 'DELETE', 'SYSTEM'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                  activeFilter === filter 
                    ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                {filter === 'ALL' ? 'Összes' : filter === 'CREATE' ? 'Új' : filter === 'UPDATE' ? 'Módosítás' : filter === 'DELETE' ? 'Törlés' : 'Rendszer'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="relative">
        <div className="absolute left-8 top-0 bottom-0 w-px bg-slate-200 hidden md:block" />
        
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="relative">
                  <RefreshCcw className="w-12 h-12 text-slate-200 animate-spin" />
                  <Activity className="absolute inset-0 m-auto w-5 h-5 text-slate-400" />
                </div>
                <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Adatok betöltése...</p>
              </div>
            ) : filteredLogs.length > 0 ? (
              filteredLogs.map((log, idx) => {
                const info = getActionInfo(log.action);
                return (
                  <motion.div 
                    key={log.id} 
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2, delay: idx * 0.02 }}
                    className="relative"
                  >
                    <div className="hidden md:block absolute left-8 top-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-slate-300 z-10" />
                    
                    <Card className="ml-0 md:ml-16 p-5 hover:shadow-xl hover:shadow-slate-100 transition-all border-l-4 border-l-slate-900 group">
                      <div className="flex flex-col sm:flex-row items-start gap-4">
                        <div className={cn("p-3 rounded-2xl shrink-0 border transition-transform group-hover:scale-110", info.color)}>
                          {info.icon}
                        </div>
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn("text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest border shadow-sm", info.color)}>
                                {info.label}
                              </span>
                              <div className="flex items-center gap-1.5 text-slate-400">
                                <Clock className="w-3.5 h-3.5" />
                                <span className="text-xs font-bold font-mono">{formatDate(log.timestamp)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center border border-slate-200">
                                <User className="w-3 h-3 text-slate-500" />
                              </div>
                              <span className="text-xs font-bold text-slate-600">{log.userEmail || 'Ismeretlen'}</span>
                            </div>
                          </div>
                          
                          <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                            <p className="text-sm text-slate-800 leading-relaxed font-medium">
                              {log.details}
                            </p>
                          </div>

                          <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              ID: {log.id}
                            </span>
                            <span className="flex items-center gap-1">
                              <Info className="w-3 h-3" />
                              Action: {log.action}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-24 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200"
              >
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100">
                  <Search className="w-10 h-10 text-slate-200" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Nincs találat</h3>
                <p className="text-slate-500 mt-2 max-w-xs mx-auto text-sm">
                  Nem találtunk a keresési feltételeknek megfelelő naplóbejegyzést. Próbáljon más kulcsszót vagy szűrőt.
                </p>
                <Button 
                  variant="ghost" 
                  className="mt-6 text-indigo-600 font-bold"
                  onClick={() => { setSearchTerm(''); setActiveFilter('ALL'); }}
                >
                  Szűrők törlése
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;
