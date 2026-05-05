import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Calendar, 
  TrendingUp, 
  Brain, 
  Target, 
  Zap,
  Award,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Info
} from 'lucide-react';
import { apiService } from '../services/apiService';
import { Card, Button, Badge, LoadingSpinner } from './ui/Base';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, cn } from '../lib/utils';

const UserReports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [report, setReport] = useState<any>(null);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const data = await apiService.getUserWeeklyReport();
      setReport(data);
    } catch (error) {
      console.error('Error fetching personal report:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualRequest = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      await apiService.requestPersonalReport();
      await fetchReport();
    } catch (error) {
      console.error('Error requesting report:', error);
      alert('Hiba történt az elemzés generálása során.');
    } finally {
      setRequesting(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="relative">
          <LoadingSpinner size="lg" />
          <motion.div 
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute -inset-4 bg-indigo-500/20 rounded-full blur-xl"
          />
        </div>
        <p className="text-slate-500 font-black uppercase tracking-widest text-xs animate-pulse">Személyes elemzés összeállítása...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-4xl mx-auto py-20 px-4">
        <Card className="p-16 text-center space-y-8 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[3rem] shadow-none">
          <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 transform rotate-3">
            <Sparkles className="w-12 h-12 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="space-y-3">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Még nincs jelentésed</h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm leading-relaxed font-medium">
              Az AI minden héten elemzi a teljesítményedet, de ha most azonnal szeretnél egy friss elemzést látni, kérhetsz egyet gombnyomásra!
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
                onClick={handleManualRequest} 
                className="rounded-2xl px-10 h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest shadow-xl shadow-indigo-200 dark:shadow-none"
                disabled={requesting}
            >
              <Zap className={cn("w-5 h-5 mr-2", requesting && "animate-spin")} />
              {requesting ? "Generálás..." : "Elemzés kérése most"}
            </Button>
            <Button onClick={fetchReport} variant="outline" className="rounded-2xl px-8 h-14 border-slate-200 dark:border-slate-800 font-bold">
              <RefreshCw className="w-4 h-4 mr-2" />
              Frissítés
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const data = report.report_json;

  return (
    <div className="max-w-6xl mx-auto py-12 px-6 space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-slate-100 dark:border-slate-800 pb-12">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant="info" className="px-4 py-1.5 rounded-full text-[10px] uppercase font-black tracking-widest bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-none">
                Heti Teljesítmény jelentés
            </Badge>
            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                <Calendar className="w-3 h-3" />
                <span>{new Date(report.start_date).toLocaleDateString('hu-HU')} - {new Date(report.end_date).toLocaleDateString('hu-HU')}</span>
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-tight italic">
            Személyes<br/>
            <span className="text-indigo-600">Elemzés.</span>
          </h1>
        </div>
        
        <div className="flex flex-col items-end gap-6 text-right">
            <div className="flex items-center gap-4">
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Index</p>
                   <p className="text-4xl font-black text-slate-900 dark:text-white">{data.efficiency}%</p>
                </div>
                <div className="w-20 h-20 rounded-3xl bg-slate-900 dark:bg-white flex items-center justify-center shadow-2xl">
                    <Target className="text-white dark:text-slate-900 w-10 h-10" />
                </div>
            </div>
            
            <Button 
                onClick={handleManualRequest} 
                disabled={requesting}
                size="sm"
                variant="outline"
                className="rounded-xl px-6 h-11 border-indigo-200 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
            >
                <Zap className={cn("w-3.5 h-3.5 mr-2", requesting && "animate-spin")} />
                {requesting ? "Kérés folyamatban..." : "Friss elemzés kérése"}
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left Stats Rail */}
        <div className="lg:col-span-4 space-y-8">
          <Card className="p-8 bg-slate-900 dark:bg-white border-none text-white dark:text-slate-900 shadow-2xl relative overflow-hidden group rounded-[2.5rem]">
            <div className="absolute -top-12 -right-12 p-8 opacity-5 group-hover:opacity-10 transition-opacity duration-700">
              <TrendingUp className="w-64 h-64" />
            </div>
            
            <div className="space-y-10 relative z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 dark:bg-slate-100 rounded-xl">
                  <Award className="w-5 h-5 text-indigo-400 dark:text-indigo-600" />
                </div>
                <h3 className="font-black uppercase tracking-widest text-[10px]">Eredményjelző</h3>
              </div>

              <div className="space-y-8">
                <div>
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Profit Hozzájárulás</p>
                  <p className="text-4xl font-black leading-none">{formatCurrency(data.totalProfit)}</p>
                </div>
                
                <div>
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Lezárt Eladások</p>
                  <p className="text-4xl font-black leading-none">{data.salesCount} <span className="text-lg font-bold text-slate-500">db</span></p>
                </div>

                <div className="pt-8 border-t border-white/10 dark:border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Húzómodell</p>
                  <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 dark:bg-slate-50 rounded-xl border border-white/10 dark:border-slate-100">
                    <Zap className="w-4 h-4 text-emerald-400 dark:text-emerald-500" />
                    <span className="text-sm font-black uppercase tracking-tight">{data.starProduct}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-8 bg-indigo-50 dark:bg-indigo-900/10 border-indigo-100/50 dark:border-indigo-900/20 rounded-[2rem]">
            <h4 className="text-[10px] font-black text-indigo-900/40 dark:text-indigo-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Hatékonysági Mutató
            </h4>
            <div className="relative h-3 bg-indigo-200 dark:bg-indigo-900/50 rounded-full overflow-hidden mb-4">
                <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${data.efficiency}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="absolute h-full bg-indigo-600 shadow-lg shadow-indigo-400"
                />
            </div>
            <div className="flex items-center justify-between">
                <p className="text-[11px] text-indigo-900 dark:text-indigo-300 font-black uppercase tracking-tight italic">
                    Státusz: {data.efficiency > 80 ? 'Kimagasló' : 'Fejlődő'}
                </p>
                <div className="p-2 bg-indigo-600 rounded-lg">
                    <TrendingUp className="w-3 h-3 text-white" />
                </div>
            </div>
          </Card>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                <Info className="w-5 h-5 text-slate-500" />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed uppercase tracking-tight">
                A jelentések minden vasárnap automatikusan frissülnek.
              </p>
          </div>
        </div>

        {/* Right Insight Column */}
        <div className="lg:col-span-8 space-y-8">
          <Card className="p-10 bg-white dark:bg-slate-900 border-none shadow-none ring-1 ring-slate-100 dark:ring-slate-800 rounded-[3rem] relative overflow-hidden">
            <div className="flex items-center gap-5 mb-10">
              <div className="p-4 bg-indigo-600 rounded-3xl shadow-xl shadow-indigo-100 dark:shadow-none rotate-3">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">AI Teljesítmény Elemzés</h3>
                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-black uppercase tracking-widest">Személyre szabott visszajelzés</p>
              </div>
            </div>

            <div className="relative">
                <div className="absolute -left-4 top-0 bottom-0 w-1 bg-indigo-100 dark:bg-indigo-900/30 rounded-full" />
                <div className="pl-6 prose dark:prose-invert max-w-none">
                    <div className="text-slate-700 dark:text-slate-300 leading-relaxed text-base font-medium whitespace-pre-wrap italic">
                        {report.report_text}
                    </div>
                </div>
            </div>

            <div className="mt-12 group">
                <div className="p-8 bg-slate-900 rounded-[2.5rem] text-white relative h-full flex flex-col justify-between overflow-hidden">
                    <div className="absolute right-0 bottom-0 opacity-10 group-hover:scale-110 transition-transform duration-700 -mb-8 -mr-8">
                        <Sparkles className="w-48 h-48" />
                    </div>
                    <div className="relative z-10">
                         <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 bg-indigo-500 rounded-xl flex items-center justify-center">
                                <Zap className="w-4 h-4 text-white" />
                            </div>
                            <h4 className="font-black uppercase tracking-widest text-xs text-indigo-400">AI Tanács a következő hétre</h4>
                        </div>
                        <p className="text-lg font-black tracking-tight leading-relaxed max-w-lg italic">
                            Fókuszálj a {data.starProduct} modellekre, mert kimagasló az érdeklődés. Javaslom a többplatformos aktivitást a készlet hatékony kivezetése érdekében!
                        </p>
                    </div>
                    <div className="mt-8 flex items-center justify-between relative z-10 pt-6 border-t border-white/10">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Heti stratégia v1.02</span>
                        <ChevronRight className="w-5 h-5 text-indigo-500" />
                    </div>
                </div>
            </div>
          </Card>

          <Card className="p-8 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-[2rem] flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
              <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-slate-400" />
                  </div>
                  <div>
                    <h5 className="font-black text-slate-900 dark:text-white uppercase text-xs tracking-tight">Dokumentum verzió</h5>
                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Azonosító: WR-{report.id}</p>
                  </div>
              </div>
              <Button variant="ghost" onClick={() => window.print()} className="gap-2 text-slate-500 hover:text-indigo-600 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-indigo-50 transition-colors h-12 px-6">
                  <FileText className="w-4 h-4" />
                  Mentés PDF-ként
              </Button>
          </Card>
        </div>
      </div>

      {/* Actionable Footer */}
      <div className="flex flex-col items-center text-center space-y-6 pt-12">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest italic max-w-md">
              A jelentés a {new Date(report.start_date).toLocaleDateString('hu-HU')} és {new Date(report.end_date).toLocaleDateString('hu-HU')} közötti rögzített eladásaid alapján készült.
          </p>
          <div className="h-px w-24 bg-slate-200 dark:bg-slate-800" />
      </div>
    </div>
  );
};

export default UserReports;
