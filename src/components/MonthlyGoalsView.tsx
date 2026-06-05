import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, LoadingSpinner } from './ui/Base';
import { formatCurrency, cn } from '../lib/utils';
import { 
  Sparkles, Target, CheckCircle, AlertCircle, Mail, DollarSign
} from 'lucide-react';
import { motion } from 'motion/react';
import { apiService } from '../services/apiService';

const MonthlyGoalsView: React.FC = () => {
  const [currentGoalMonth, setCurrentGoalMonth] = useState<string>(() => new Date().toISOString().substring(0, 7));
  const [goalData, setGoalData] = useState<any>(null);
  const [predictions, setPredictions] = useState<any>(null);
  const [loadingGoal, setLoadingGoal] = useState<boolean>(false);
  const [goalInput, setGoalInput] = useState<string>('');
  const [savingGoal, setSavingGoal] = useState<boolean>(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<boolean>(false);
  const [emailStatus, setEmailStatus] = useState<{ success?: boolean; error?: string } | null>(null);

  const fetchGoalInfo = async (month: string) => {
    setLoadingGoal(true);
    setGoalError(null);
    try {
      const resGoal = await apiService.getMonthlyGoals(month);
      setGoalData(resGoal);
      if (resGoal.currentGoal) {
        setGoalInput(String(Math.round(parseFloat(resGoal.currentGoal.target_profit))));
        const resPred = await apiService.getGoalPredictions(month);
        setPredictions(resPred);
      } else {
        setGoalInput('');
        setPredictions(null);
      }
    } catch (err) {
      console.error('Hiba a havi cél betöltésekor:', err);
    } finally {
      setLoadingGoal(false);
    }
  };

  const handleSaveGoal = async () => {
    setGoalError(null);
    const profitVal = parseFloat(goalInput);
    if (!goalInput || isNaN(profitVal) || profitVal <= 0) {
      setGoalError('Kérlek adj meg egy érvényes célozott profit összeget!');
      return;
    }
    setSavingGoal(true);
    try {
      await apiService.saveMonthlyGoal(currentGoalMonth, profitVal);
      await fetchGoalInfo(currentGoalMonth);
    } catch (err) {
      console.error('Sikertelen havi cél mentés:', err);
      setGoalError('Sikertelen havi cél mentés!');
    } finally {
      setSavingGoal(false);
    }
  };

  const handleSendGoalEmail = async () => {
    if (!predictions || !goalData) return;
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      await apiService.sendGoalEmailReport({
        month: currentGoalMonth,
        profit: predictions.currentProfit,
        target: predictions.targetProfit,
        textAnalysis: predictions.textAnalysis,
        recommendations: predictions.recommendedSales
      });
      setEmailStatus({ success: true });
      setTimeout(() => setEmailStatus(null), 5000);
    } catch (err) {
      console.error('Sikertelen e-mail jelentés küldés:', err);
      setEmailStatus({ error: (err as Error).message });
    } finally {
      setSendingEmail(false);
    }
  };

  useEffect(() => {
    fetchGoalInfo(currentGoalMonth);
  }, [currentGoalMonth]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3 animate-pulse">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200 shrink-0">
              <Target className="w-6 h-6 text-white" />
            </div>
            Havi Profit Célok & Predictor
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1 uppercase tracking-wider">
            Állíts be profit célokat, kövesd nyomon az eladásokat és használd a gép tanulású termék ajánlásokat a célok gyors elérésére.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <Card className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-150 dark:border-slate-800 pb-5 mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-950 dark:text-white uppercase tracking-tight flex items-center gap-2.5">
                <Target className="w-5 h-5 text-indigo-500 animate-pulse" />
                Célkitűzés & AI-Alapú Előrejelzések
              </h3>
              <p className="text-xs text-slate-400 mt-1">Havi profit terv rögzítése, teljesítési statisztika és gép tanulás támogatású termék ajánlások.</p>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-bold">Vizsgált hónap:</span>
              <input
                type="month"
                value={currentGoalMonth}
                onChange={(e) => setCurrentGoalMonth(e.target.value)}
                className="bg-slate-50 dark:bg-slate-850 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-850 px-3 py-1.5 rounded-xl text-xs font-black uppercase outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          {loadingGoal ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3">
              <LoadingSpinner size="md" />
              <p className="text-xs text-slate-400 font-medium tracking-tight">Célelemzés betöltése az AI Vaultból...</p>
            </div>
          ) : !goalData?.currentGoal ? (
            <div className="flex flex-col lg:flex-row items-center gap-8 py-8 px-4">
              <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/35 rounded-2xl flex items-center justify-center text-indigo-500 shrink-0">
                <Target className="w-7 h-7" />
              </div>
              <div className="flex-1 text-center lg:text-left">
                <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Nincs beállítva profit cél a(z) {currentGoalMonth} hónapra</h4>
                <p className="text-xs text-slate-400 mt-1.5 max-w-xl">
                  Ha beállítod a kívánt profit célt, a rendszerünk a raktárkészleted, beszerzési áraid és a korábbi értékesítési rátáid alapján kiszámolja a teljesülés valószínűségét és konkrét értékesítési javaslatokat ad.
                </p>
              </div>
              <div className="w-full lg:w-auto shrink-0 flex items-center gap-2 bg-slate-50 dark:bg-slate-950/30 p-2.5 rounded-2xl border border-slate-200/50 dark:border-slate-800">
                <div className="relative">
                  <input
                    type="number"
                    placeholder="Pl. 250,000"
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm tracking-tight border border-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl outline-none focus:border-indigo-500 w-36 transition-colors"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-bold">Ft</span>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveGoal}
                  disabled={savingGoal}
                  className="rounded-xl font-bold uppercase transition-shadow"
                >
                  {savingGoal ? 'Mentés...' : 'Mentés'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {goalError && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-2xl text-xs font-bold border border-red-100 dark:border-red-950/20 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {goalError}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                <div className="lg:col-span-5 space-y-6 p-5 bg-slate-50 dark:bg-slate-950/30 rounded-3xl border border-slate-200/40 dark:border-slate-800/60 font-sans">
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-black tracking-widest leading-none">Havi Cél állása</span>
                    <div className="flex items-baseline justify-between mt-2 font-mono">
                      <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {formatCurrency(predictions?.currentProfit || 0)}
                      </span>
                      <span className="text-sm text-slate-400">
                        / {formatCurrency(predictions?.targetProfit || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-600 dark:text-slate-300">Haladás mértéke</span>
                      <span className={cn(
                        "font-black px-2 py-0.5 rounded-lg text-[11px]",
                        (predictions?.progressPercent || 0) >= 100 
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                          : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400"
                      )}>
                        {(predictions?.progressPercent || 0).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          (predictions?.progressPercent || 0) >= 100 ? "bg-emerald-500" : "bg-indigo-500"
                        )}
                        style={{ width: `${Math.min(predictions?.progressPercent || 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm">
                      <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-black leading-none mb-1">Hátralévő táv</span>
                      <span className="text-sm font-extrabold text-red-650 dark:text-red-400 font-mono">
                        {formatCurrency(predictions?.remainingGap || 0)}
                      </span>
                    </div>
                    <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm">
                      <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-black leading-none mb-1">Várható Profit</span>
                      <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                        {formatCurrency(predictions?.projectedProfit || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/50 space-y-3 font-sans">
                    <label className="text-[10px] text-slate-400 uppercase font-black block leading-none">Cél profit módosítása</label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={goalInput}
                          onChange={(e) => setGoalInput(e.target.value)}
                          className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-xs tracking-tight border border-slate-200/80 dark:border-slate-850 px-3 py-1.5 rounded-xl outline-none focus:border-indigo-500 w-full transition-colors"
                        />
                        <span className="absolute right-3.5 top-1.5 text-xs text-slate-400 font-bold font-mono">Ft</span>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleSaveGoal}
                        disabled={savingGoal}
                        className="rounded-xl px-3 font-bold py-1.5 text-xs uppercase"
                      >
                        {savingGoal ? 'Mentés...' : 'Frissít'}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-7 space-y-5">
                  
                  <div className="p-5 bg-indigo-50/50 dark:bg-indigo-950/15 rounded-3xl border border-indigo-100/40 dark:border-indigo-900/20 relative space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                        <span className="text-[11px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">AI Business Advisor elemzés</span>
                      </div>
                      
                      <Badge 
                        variant={predictions?.probability === 'high' ? 'success' : predictions?.probability === 'medium' ? 'warning' : 'danger'}
                        className="text-[9px] font-bold py-0.5"
                      >
                        Elérési esély: {predictions?.probabilityLabel || 'Nincs adat'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-normal whitespace-pre-line">
                      {predictions?.textAnalysis || 'Adatok elemzése...'}
                    </p>
                  </div>

                  {predictions?.recommendedSales && predictions.recommendedSales.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-[10px] text-slate-450 uppercase font-black block tracking-wider leading-none">
                        Cél eléréséhez javasolt kiemelt eladások (Raktár alapján)
                      </span>
                      <div className="overflow-hidden border border-slate-200/50 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/60 shadow-xs max-h-48 overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 font-bold uppercase">
                              <th className="py-2.5 px-4 animate-pulse">Termék & Állapot</th>
                              <th className="py-2.5 px-3 text-center">Javasolt eladás</th>
                              <th className="py-2.5 px-3 text-right">Raktáron</th>
                              <th className="py-2.5 px-4 text-right">Átlagos profit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs text-slate-600 dark:text-slate-300 font-medium">
                            {predictions.recommendedSales.map((item: any, i: number) => (
                              <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                <td className="py-2.5 px-4 font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">{item.model} <span className="text-[10px] font-medium text-slate-400">({item.condition})</span></td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg text-[10px] font-black">
                                    +{item.suggestedQty} db
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-slate-700 dark:text-slate-300">{item.stockQty} db</td>
                                <td className="py-2.5 px-4 text-right font-bold text-slate-800 dark:text-slate-200 font-mono">{formatCurrency(item.avgProfit)}/db</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                </div>

              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-150 dark:border-slate-800">
                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 matches-glow">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  Aktív célkövetés folyamatban. A mérföldköveknél (50%, 80%, 100%) rendszerszintű e-mailt is küldünk.
                </span>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  {emailStatus?.success && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Jelentés e-mailben elküldve!
                    </span>
                  )}
                  {emailStatus?.error && (
                    <span className="text-xs text-red-500 font-bold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Hiba: {emailStatus.error}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSendGoalEmail}
                    disabled={sendingEmail || !predictions}
                    className="rounded-xl font-bold uppercase flex items-center gap-2 text-xs border-slate-200/60"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {sendingEmail ? 'Küldés...' : 'Aktuális jelentés küldése e-mailben'}
                  </Button>
                </div>
              </div>

            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default MonthlyGoalsView;
