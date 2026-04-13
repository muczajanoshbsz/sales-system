import React, { useEffect, useState, useMemo } from 'react';
import { Sale, StockItem, PendingSale } from '../types';
import { Card, Button } from './ui/Base';
import { formatCurrency, cn, formatDate } from '../lib/utils';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart
} from 'recharts';
import { 
  ShoppingBag, TrendingUp, DollarSign, AlertTriangle, BarChart3, 
  LineChart as LineChartIcon, Sparkles, Clock, CheckCircle2, 
  ArrowUpRight, ArrowDownRight, Activity, Package, Users, 
  ChevronRight, Plus, RefreshCcw
} from 'lucide-react';
import { motion } from 'motion/react';
import { apiService } from '../services/apiService';
import { getProfitPrediction } from '../services/geminiService';
import { useFirebase } from './FirebaseProvider';
import { SEASONAL_ADJUSTMENTS } from '../constants';
import { subDays, format, startOfMonth, addMonths, isAfter, parseISO, isSameMonth, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Badge } from './ui/Base';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { profile, isAdmin } = useFirebase();
  const [sales, setSales] = useState<Sale[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [profitPrediction, setProfitPrediction] = useState<any>(null);
  const [predictionSource, setPredictionSource] = useState<'ai' | 'stat' | null>(null);
  const [viewMode, setViewMode] = useState<'personal' | 'global'>('personal');

  const getFallbackPrediction = (salesData: Sale[]) => {
    const monthlyProfit = salesData.reduce((acc: Record<string, number>, sale) => {
      const month = sale.date.substring(0, 7);
      acc[month] = (acc[month] || 0) + sale.profit;
      return acc;
    }, {});

    const months = Object.keys(monthlyProfit).sort();
    if (months.length === 0) return null;

    // Weighted average of last 3 months
    const last3Months = months.slice(-3);
    let totalWeight = 0;
    let weightedProfit = 0;
    last3Months.forEach((m, i) => {
      const weight = i + 1;
      weightedProfit += monthlyProfit[m] * weight;
      totalWeight += weight;
    });
    const baseProfit = weightedProfit / totalWeight;

    const predictions = [];
    const now = new Date();
    for (let i = 1; i <= 3; i++) {
      const futureDate = addMonths(now, i);
      const monthNum = futureDate.getMonth() + 1;
      const seasonalFactor = SEASONAL_ADJUSTMENTS[monthNum] || 1;
      
      const predicted = Math.round(baseProfit * seasonalFactor);
      predictions.push({
        date: format(futureDate, 'yyyy-MM'),
        predicted_profit: predicted,
        confidence_upper: Math.round(predicted * 1.15),
        confidence_lower: Math.round(predicted * 0.85)
      });
    }

    return {
      predictions,
      insights: [
        "A jóslat statisztikai adatok és szezonalitási szorzók alapján készült.",
        "Az AI elemzés jelenleg nem elérhető vagy frissítésre vár."
      ]
    };
  };

  const fetchPrediction = async (salesData: Sale[], force = false) => {
    const CACHE_KEY = `profit_prediction_${viewMode}`;
    const cached = localStorage.getItem(CACHE_KEY);
    const now = Date.now();
    const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

    if (!force && cached) {
      try {
        const { timestamp, salesCount, data, source } = JSON.parse(cached);
        const timeDiff = now - timestamp;
        const salesDiff = Math.abs(salesData.length - salesCount);

        if (timeDiff < FORTY_EIGHT_HOURS && salesDiff < 5) {
          setProfitPrediction(data);
          setPredictionSource(source || 'ai');
          return;
        }
      } catch (e) {
        console.warn('Failed to parse cached prediction');
      }
    }

    setAiLoading(true);
    try {
      const aiData = await getProfitPrediction(salesData);
      setProfitPrediction(aiData);
      setPredictionSource('ai');
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: now,
        salesCount: salesData.length,
        data: aiData,
        source: 'ai'
      }));
    } catch (error) {
      console.error('AI prediction failed, using fallback:', error);
      const fallback = getFallbackPrediction(salesData);
      setProfitPrediction(fallback);
      setPredictionSource('stat');
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let salesData, stockData, pendingData;
        
        if (isAdmin && viewMode === 'global') {
          const [s, st, p] = await Promise.all([
            apiService.getAdminSales(),
            apiService.getAdminStock(),
            apiService.getAdminPendingSales()
          ]);
          salesData = s;
          stockData = st;
          pendingData = p;
        } else {
          const [s, st, p] = await Promise.all([
            apiService.getSales(),
            apiService.getStock(),
            apiService.getPendingSales()
          ]);
          salesData = s;
          stockData = st;
          pendingData = p;
        }

        setSales(salesData);
        setStock(stockData);
        setPendingSales(pendingData);

        // Fetch AI prediction with caching logic
        if (salesData.length > 0) {
          fetchPrediction(salesData);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [viewMode, isAdmin]);

  // Stats Calculations
  const { totalRevenue, totalProfit, totalSales, lowStockCount } = useMemo(() => ({
    totalRevenue: sales.reduce((sum, s) => sum + s.sell_price, 0),
    totalProfit: sales.reduce((sum, s) => sum + s.profit, 0),
    totalSales: sales.length,
    lowStockCount: stock.filter(item => item.quantity < 5).length
  }), [sales, stock]);

  // Monthly Comparison
  const { currentMonthProfit, lastMonthProfit, profitTrend, currentMonthRevenue, lastMonthRevenue, revenueTrend } = useMemo(() => {
    const currentMonth = new Date();
    const lastMonth = subMonths(currentMonth, 1);
    
    const currentMonthSales = sales.filter(s => isSameMonth(parseISO(s.date), currentMonth));
    const lastMonthSales = sales.filter(s => isSameMonth(parseISO(s.date), lastMonth));
    
    const cProfit = currentMonthSales.reduce((sum, s) => sum + s.profit, 0);
    const lProfit = lastMonthSales.reduce((sum, s) => sum + s.profit, 0);
    const pTrend = lProfit === 0 ? 100 : ((cProfit - lProfit) / lProfit) * 100;

    const cRevenue = currentMonthSales.reduce((sum, s) => sum + s.sell_price, 0);
    const lRevenue = lastMonthSales.reduce((sum, s) => sum + s.sell_price, 0);
    const rTrend = lRevenue === 0 ? 100 : ((cRevenue - lRevenue) / lRevenue) * 100;

    return {
      currentMonthProfit: cProfit,
      lastMonthProfit: lProfit,
      profitTrend: pTrend,
      currentMonthRevenue: cRevenue,
      lastMonthRevenue: lRevenue,
      revenueTrend: rTrend
    };
  }, [sales]);

  // Pending Stats
  const { potentialRevenue, potentialProfit } = useMemo(() => {
    const activePending = pendingSales.filter(p => p.status === 'pending');
    return {
      potentialRevenue: activePending.reduce((sum, p) => sum + p.sell_price, 0),
      potentialProfit: activePending.reduce((sum, p) => sum + p.profit, 0)
    };
  }, [pendingSales]);

  const monthlyData = useMemo(() => sales.reduce((acc: any[], sale) => {
    const month = sale.date.substring(0, 7);
    const existing = acc.find(d => d.month === month);
    if (existing) {
      existing.profit += sale.profit;
      existing.revenue += sale.sell_price;
    } else {
      acc.push({ month, profit: sale.profit, revenue: sale.sell_price });
    }
    return acc;
  }, []).sort((a, b) => a.month.localeCompare(b.month)), [sales]);

  const platformData = useMemo(() => sales.reduce((acc: any[], sale) => {
    const existing = acc.find(d => d.name === sale.platform);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: sale.platform, value: 1 });
    }
    return acc;
  }, []), [sales]);

  // Top Selling Models
  const modelPerformance = useMemo(() => sales.reduce((acc: any[], sale) => {
    const existing = acc.find(d => d.model === sale.model);
    if (existing) {
      existing.profit += sale.profit;
      existing.quantity += sale.quantity;
      existing.revenue += sale.sell_price;
    } else {
      acc.push({ model: sale.model, profit: sale.profit, quantity: sale.quantity, revenue: sale.sell_price });
    }
    return acc;
  }, [])
  .sort((a, b) => b.profit - a.profit)
  .slice(0, 5), [sales]);

  // Recent Activity
  const recentActivity = useMemo(() => [
    ...sales.map(s => ({ ...s, type: 'sale' as const })),
    ...pendingSales.map(p => ({ ...p, type: 'pending' as const }))
  ]
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  .slice(0, 5), [sales, pendingSales]);

  const [debugInfo, setDebugInfo] = useState<any>(null);

  const fetchDebugInfo = async () => {
    try {
      const response = await fetch('/api/debug/migration');
      const data = await response.json();
      setDebugInfo(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleManualMigration = async () => {
    if (!window.confirm('Biztosan át szeretnéd mozgatni az összes gazdátlan adatot a saját fiókodba?')) return;
    try {
      const response = await fetch('/api/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: profile?.uid,
          email: profile?.email,
          displayName: profile?.displayName
        })
      });
      if (response.ok) {
        alert('Migráció sikeresen lefutott!');
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
      alert('Hiba a migráció során');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-12">
      {/* Header & Quick Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Vezetői Irányítópult</h1>
            {isAdmin && (
              <Badge variant={viewMode === 'global' ? 'info' : 'outline'} className="rounded-full px-3 py-1 text-[10px] sm:text-xs">
                {viewMode === 'global' ? 'Csapat Nézet' : 'Saját Nézet'}
              </Badge>
            )}
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm sm:text-base">
            {isAdmin && viewMode === 'global' 
              ? 'A teljes csapat összesített teljesítményét látod.' 
              : 'Üdvözöljük újra! Itt a mai üzleti áttekintés.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {isAdmin && (
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('personal')}
                className={cn(
                  "px-3 py-1.5 text-[10px] sm:text-xs font-bold rounded-lg transition-all",
                  viewMode === 'personal' 
                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                )}
              >
                Saját
              </button>
              <button
                onClick={() => setViewMode('global')}
                className={cn(
                  "px-3 py-1.5 text-[10px] sm:text-xs font-bold rounded-lg transition-all",
                  viewMode === 'global' 
                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                )}
              >
                Összes
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button 
              variant="secondary" 
              onClick={() => navigate('/inventory')} 
              className="flex-1 sm:flex-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 text-xs sm:text-sm py-2"
            >
              <Package className="w-4 h-4 mr-1.5 sm:mr-2" />
              <span className="hidden xs:inline">Készlet</span>
              <span className="xs:hidden">Készlet</span>
            </Button>
            <Button 
              onClick={() => navigate('/sales')}
              className="flex-1 sm:flex-none text-xs sm:text-sm py-2"
            >
              <Plus className="w-4 h-4 mr-1.5 sm:mr-2" />
              <span className="hidden xs:inline">Új Eladás</span>
              <span className="xs:hidden">Eladás</span>
            </Button>
          </div>
        </div>
      </div>

      {isAdmin && viewMode === 'personal' && sales.length === 0 && stock.length === 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/30 p-6 rounded-2xl flex items-start gap-4"
        >
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-300">A saját irányítópultod még üres</h3>
            <p className="text-sm text-indigo-700/70 dark:text-indigo-400/70 mt-1 max-w-2xl">
              Mivel bekapcsoltuk az adat-szétválasztást, itt csak a saját rögzítéseidet látod. 
              A korábbi vagy mások által rögzített adatokat a <strong>Rendszerfelügyelet</strong> fülön vagy az <strong>"Összes"</strong> nézetre váltva érheted el.
            </p>
            <div className="flex gap-4 mt-4">
              <Button size="sm" onClick={() => setViewMode('global')} className="bg-indigo-600 hover:bg-indigo-700">
                Váltás Összesített Nézetre
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate('/sales')} className="text-indigo-600 dark:text-indigo-400">
                Első saját eladás rögzítése
              </Button>
              <Button size="sm" variant="outline" onClick={fetchDebugInfo}>
                Debug Migráció
              </Button>
              <Button size="sm" variant="outline" onClick={handleManualMigration} className="text-amber-600 border-amber-200 hover:bg-amber-50">
                Kézi Kényszerített Migráció
              </Button>
            </div>
            {debugInfo && (
              <div className="mt-4 p-4 bg-slate-900 text-slate-100 rounded-xl text-[10px] font-mono overflow-auto max-h-64">
                <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* KPI Section - Grouped for better spacing */}
      <div className="space-y-6">
        {/* Row 1: Monthly Performance */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard 
            title="Havi Bevétel" 
            value={formatCurrency(currentMonthRevenue)} 
            trend={revenueTrend}
            icon={DollarSign} 
            color="indigo" 
            description="Aktuális hónap összesített bevétele"
          />
          <StatCard 
            title="Havi Profit" 
            value={formatCurrency(currentMonthProfit)} 
            trend={profitTrend}
            icon={TrendingUp} 
            color="emerald" 
            description="Aktuális hónap tiszta nyeresége"
          />
          <StatCard 
            title="Függő Profit" 
            value={formatCurrency(potentialProfit)} 
            icon={Clock} 
            color="amber" 
            description="Várakozó eladások várható haszna"
          />
        </div>

        {/* Row 2: Overall & Risk */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard 
            title="Összes Bevétel" 
            value={formatCurrency(totalRevenue)} 
            icon={Activity} 
            color="blue" 
            description="A rendszer indulása óta mért forgalom"
          />
          <StatCard 
            title="Összes Profit" 
            value={formatCurrency(totalProfit)} 
            icon={BarChart3} 
            color="violet" 
            description="A rendszer indulása óta mért nyereség"
          />
          <StatCard 
            title="Alacsony Készlet" 
            value={lowStockCount.toString()} 
            icon={AlertTriangle} 
            color="rose" 
            isWarning={lowStockCount > 0}
            description="5 darab alatti készleten lévő modellek"
          />
        </div>
      </div>

      {/* Main Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Revenue/Profit Chart - 8 cols */}
        <Card className="p-6 lg:col-span-8 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Pénzügyi Teljesítmény</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Bevétel és profit alakulása</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-indigo-600"></div>
                <span className="text-slate-500 dark:text-slate-400">Bevétel</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-slate-500 dark:text-slate-400">Profit</span>
              </div>
            </div>
          </div>
          <div className="h-[400px] -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--tw-color-slate-900)', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', color: 'white' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProf)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Platform Distribution - 4 cols */}
        <Card className="p-6 lg:col-span-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Platformok</h3>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-8">Értékesítési csatornák</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={platformData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {platformData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 mt-6">
            {platformData.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">{item.name}</span>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{item.value} eladás</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Profit Prediction - 12 cols */}
        <Card className="p-6 lg:col-span-12 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 overflow-hidden relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Profit Előrejelzés</h3>
                <div className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  predictionSource === 'ai' 
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                )}>
                  {predictionSource === 'ai' ? <Sparkles className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                  {predictionSource === 'ai' ? 'AI Becslés' : 'Statisztikai Modell'}
                </div>
              </div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Következő 3 hónap várható nyeresége</p>
            </div>
            <div className="flex items-center gap-3">
              {aiLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400 animate-pulse">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                  Elemzés...
                </div>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => fetchPrediction(sales, true)}
                disabled={aiLoading}
                className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                <RefreshCcw className={cn("w-3 h-3 mr-1.5", aiLoading && "animate-spin")} />
                Frissítés
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 h-[300px] -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={profitPrediction?.predictions || []}>
                  <defs>
                    <linearGradient id="colorPred" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v/1000}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--tw-color-slate-900)', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', color: 'white' }}
                    formatter={(value: number) => [formatCurrency(value), 'Várható Profit']}
                  />
                  <Area type="monotone" dataKey="confidence_upper" stroke="none" fill="#8b5cf6" fillOpacity={0.05} />
                  <Area type="monotone" dataKey="confidence_lower" stroke="none" fill="#8b5cf6" fillOpacity={0.05} />
                  <Line 
                    type="monotone" 
                    dataKey="predicted_profit" 
                    stroke="#8b5cf6" 
                    strokeWidth={3} 
                    strokeDasharray="5 5"
                    dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: '#fff' }} 
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">AI Megállapítások</h4>
              <div className="space-y-3">
                {profitPrediction?.insights?.map((insight: string, idx: number) => (
                  <div key={idx} className="flex gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{insight}</p>
                  </div>
                ))}
                {!profitPrediction && !aiLoading && (
                  <div className="py-8 text-center text-slate-400 text-xs italic">
                    Nincs elég adat az előrejelzéshez.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Top Models - 7 cols */}
        <Card className="p-6 lg:col-span-7 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Legjobb Modellek</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Profitabilitás alapján</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/sales')} className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">
              Összes <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-4 font-medium">Modell</th>
                  <th className="pb-4 font-medium text-center">Mennyiség</th>
                  <th className="pb-4 font-medium text-right">Profit</th>
                  <th className="pb-4 font-medium text-right">Átlag Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {modelPerformance.map((item, idx) => (
                  <tr key={idx} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 font-bold text-slate-900 dark:text-white">{item.model}</td>
                    <td className="py-4 text-center">
                      <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs font-bold text-slate-600 dark:text-slate-400">
                        {item.quantity} db
                      </span>
                    </td>
                    <td className="py-4 text-right font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(item.profit)}</td>
                    <td className="py-4 text-right text-slate-500 dark:text-slate-400">{formatCurrency(item.profit / item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent Activity - 5 cols */}
        <Card className="p-6 lg:col-span-5 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Aktivitás</h3>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-8">Legutóbbi események</p>
          <div className="space-y-8">
            {recentActivity.map((activity, idx) => (
              <div key={idx} className="flex items-start gap-4">
                <div className={cn(
                  "p-2 rounded-lg shrink-0",
                  activity.type === 'sale' ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                )}>
                  {activity.type === 'sale' ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{activity.model}</p>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase">{formatDate(activity.date)}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {activity.type === 'sale' ? 'Sikeres eladás' : 'Függő eladás'} - {activity.platform}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{formatCurrency(activity.sell_price)}</span>
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                      activity.type === 'sale' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                    )}>
                      {activity.type === 'sale' ? `+${formatCurrency(activity.profit)} profit` : 'Várakozás'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button variant="secondary" className="w-full mt-8 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300" onClick={() => navigate('/sales')}>
            Minden aktivitás megtekintése
          </Button>
        </Card>

      </div>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string;
  icon: any;
  color: string;
  trend?: number;
  isWarning?: boolean;
  description?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, color, trend, isWarning, description }) => {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 ring-indigo-100/50 dark:ring-indigo-900/30',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 ring-emerald-100/50 dark:ring-emerald-900/30',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 ring-amber-100/50 dark:ring-amber-900/30',
    rose: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 ring-rose-100/50 dark:ring-rose-900/30',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 ring-blue-100/50 dark:ring-blue-900/30',
    violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 ring-violet-100/50 dark:ring-violet-900/30',
  };

  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }}>
      <Card className={cn(
        "p-6 relative overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-300 bg-white dark:bg-slate-900",
        isWarning && "ring-2 ring-rose-500 ring-offset-2"
      )}>
        <div className="flex items-start justify-between relative z-10">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{title}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
            </div>
            
            {description && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium leading-relaxed max-w-[180px]">
                {description}
              </p>
            )}

            {trend !== undefined && (
              <div className="flex items-center gap-2">
                <div className={cn(
                  "flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full",
                  trend >= 0 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"
                )}>
                  {trend >= 0 ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                  {Math.abs(Math.round(trend))}%
                </div>
                <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-wider">vs előző hó</span>
              </div>
            )}
          </div>
          <div className={cn('p-3 rounded-xl transition-transform duration-500 group-hover:scale-110', colors[color])}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

export default Dashboard;
