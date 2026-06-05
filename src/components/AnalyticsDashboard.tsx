/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Sale } from '../types';
import { Card, Button, Badge, LoadingSpinner } from './ui/Base';
import { formatCurrency, cn } from '../lib/utils';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart
} from 'recharts';
import { 
  TrendingUp, BarChart3, PieChart as PieChartIcon, ArrowUpRight, Percent, 
  Sparkles, Layers, Award, Zap, Calendar, DollarSign, Building, 
  RefreshCw, RefreshCcw, Landmark, ShieldAlert, ArrowDownRight, Scale,
  Mail, Target, CheckCircle, AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { apiService } from '../services/apiService';
import { useFirebase } from './FirebaseProvider';
import { subDays, format, parseISO, isAfter, startOfMonth, subMonths } from 'date-fns';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444'];

interface PlatformStat {
  platform: string;
  revenue: number;
  cogs: number;
  fees: number;
  profit: number;
  quantity: number;
  avgMargin: number;
  roi: number;
  feeRatio: number;
}

interface ModelStat {
  model: string;
  profit: number;
  revenue: number;
  quantity: number;
  avgSellPrice: number;
  margin: number;
  roi: number;
  salesCount: number;
}

const AnalyticsDashboard: React.FC = () => {
  const { profile, isAdmin } = useFirebase();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'personal' | 'global'>('personal');
  const [timeRange, setTimeRange] = useState<'30days' | '90days' | 'thisyear' | 'all'>('90days');
  const [sortByModel, setSortByModel] = useState<'profit' | 'quantity' | 'margin' | 'roi'>('profit');

  // Monthly Goal Tracker additions
  const [currentGoalMonth, setCurrentGoalMonth] = useState<string>(() => new Date().toISOString().substring(0, 7));
  const [goalData, setGoalData] = useState<any>(null);
  const [predictions, setPredictions] = useState<any>(null);
  const [loadingGoal, setLoadingGoal] = useState<boolean>(false);
  const [goalInput, setGoalInput] = useState<string>('');
  const [savingGoal, setSavingGoal] = useState<boolean>(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<boolean>(false);
  const [emailStatus, setEmailStatus] = useState<{ success?: boolean; error?: string } | null>(null);

  const fetchSalesData = async () => {
    setLoading(true);
    try {
      let salesData: Sale[] = [];
      if (isAdmin && viewMode === 'global') {
        salesData = await apiService.getAdminSales();
      } else {
        salesData = await apiService.getSales();
      }
      setSales(salesData);
    } catch (error) {
      console.error('Sikertelen adatelérés az elemzőben:', error);
    } finally {
      setLoading(false);
    }
  };

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
    fetchSalesData();
  }, [viewMode]);

  useEffect(() => {
    fetchGoalInfo(currentGoalMonth);
  }, [currentGoalMonth]);

  // Handle active time filter
  const filteredSales = useMemo(() => {
    const now = new Date();
    let filterDate: Date | null = null;

    if (timeRange === '30days') {
      filterDate = subDays(now, 30);
    } else if (timeRange === '90days') {
      filterDate = subDays(now, 90);
    } else if (timeRange === 'thisyear') {
      filterDate = new Date(now.getFullYear(), 0, 1);
    }

    if (!filterDate) return sales;

    return sales.filter((sale) => {
      const saleDate = parseISO(sale.date);
      return isAfter(saleDate, filterDate!);
    });
  }, [sales, timeRange]);

  // Overall calculations
  const summaryMetrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalFees = 0;
    let totalProfit = 0;
    let totalQty = 0;

    filteredSales.forEach((sale) => {
      totalRevenue += sale.sell_price;
      totalCogs += (sale.buy_price * sale.quantity);
      totalFees += sale.fees;
      totalProfit += sale.profit;
      totalQty += sale.quantity;
    });

    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const roi = totalCogs > 0 ? (totalProfit / totalCogs) * 100 : 0;
    const avgFeePercentage = totalRevenue > 0 ? (totalFees / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCogs,
      totalFees,
      totalProfit,
      totalQty,
      profitMargin,
      roi,
      avgFeePercentage
    };
  }, [filteredSales]);

  // Calculations by platform
  const platformStats = useMemo(() => {
    const rawStats: Record<string, { revenue: number; cogs: number; fees: number; profit: number; quantity: number }> = {};

    filteredSales.forEach((sale) => {
      const platformName = sale.platform || 'Egyéb';
      if (!rawStats[platformName]) {
        rawStats[platformName] = { revenue: 0, cogs: 0, fees: 0, profit: 0, quantity: 0 };
      }
      rawStats[platformName].revenue += sale.sell_price;
      rawStats[platformName].cogs += (sale.buy_price * sale.quantity);
      rawStats[platformName].fees += sale.fees;
      rawStats[platformName].profit += sale.profit;
      rawStats[platformName].quantity += sale.quantity;
    });

    return Object.entries(rawStats).map(([platform, data]) => {
      const avgMargin = data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0;
      const roi = data.cogs > 0 ? (data.profit / data.cogs) * 100 : 0;
      const feeRatio = data.revenue > 0 ? (data.fees / data.revenue) * 100 : 0;

      return {
        platform,
        ...data,
        avgMargin,
        roi,
        feeRatio
      } as PlatformStat;
    }).sort((a, b) => b.profit - a.profit);
  }, [filteredSales]);

  // Top/lowest platform callouts
  const platformInsights = useMemo(() => {
    if (platformStats.length === 0) return { bestMargin: null, lowestFees: null };

    const sortedByMargin = [...platformStats].sort((a, b) => b.avgMargin - a.avgMargin);
    const sortedByFees = [...platformStats].filter(p => p.fees > 0).sort((a, b) => a.feeRatio - b.feeRatio);

    return {
      bestMargin: sortedByMargin[0] || null,
      lowestFees: sortedByFees[0] || sortedByMargin[sortedByMargin.length - 1] || null
    };
  }, [platformStats]);

  // Calculations by AirPods models
  const modelStats = useMemo(() => {
    const rawStats: Record<string, { profit: number; revenue: number; quantity: number; cogs: number; count: number }> = {};

    filteredSales.forEach((sale) => {
      const modelName = sale.model || 'Ismeretlen Modell';
      if (!rawStats[modelName]) {
        rawStats[modelName] = { profit: 0, revenue: 0, quantity: 0, cogs: 0, count: 0 };
      }
      rawStats[modelName].profit += sale.profit;
      rawStats[modelName].revenue += sale.sell_price;
      rawStats[modelName].quantity += sale.quantity;
      rawStats[modelName].cogs += (sale.buy_price * sale.quantity);
      rawStats[modelName].count += 1;
    });

    const formatted = Object.entries(rawStats).map(([model, data]) => {
      const margin = data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0;
      const roi = data.cogs > 0 ? (data.profit / data.cogs) * 100 : 0;
      const avgSellPrice = data.quantity > 0 ? (data.revenue / data.quantity) : 0;

      return {
        model,
        profit: data.profit,
        revenue: data.revenue,
        quantity: data.quantity,
        avgSellPrice,
        margin,
        roi,
        salesCount: data.count
      } as ModelStat;
    });

    return formatted.sort((a, b) => {
      if (sortByModel === 'profit') return b.profit - a.profit;
      if (sortByModel === 'quantity') return b.quantity - a.quantity;
      if (sortByModel === 'margin') return b.margin - a.margin;
      if (sortByModel === 'roi') return b.roi - a.roi;
      return b.profit - a.profit;
    });
  }, [filteredSales, sortByModel]);

  // Historical Timeline trends (Monthly group / Daily group)
  const timelineData = useMemo(() => {
    const isDaily = timeRange === '30days';
    const groups: Record<string, { date: string; profit: number; revenue: number; fees: number; cogs: number; formattedDate: string }> = {};

    filteredSales.forEach((sale) => {
      const parsed = parseISO(sale.date);
      const key = isDaily ? sale.date : format(parsed, 'yyyy-MM');
      const formattedDate = isDaily ? format(parsed, 'MMM dd.') : format(parsed, 'yyyy. MMM');

      if (!groups[key]) {
        groups[key] = { date: key, profit: 0, revenue: 0, fees: 0, cogs: 0, formattedDate };
      }
      groups[key].profit += sale.profit;
      groups[key].revenue += sale.sell_price;
      groups[key].fees += sale.fees;
      groups[key].cogs += (sale.buy_price * sale.quantity);
    });

    const sortedGroups = Object.keys(groups).sort().map((key) => {
      const data = groups[key];
      const margin = data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0;
      const roi = data.cogs > 0 ? (data.profit / data.cogs) * 100 : 0;
      return {
        ...data,
        margin: parseFloat(margin.toFixed(1)),
        roi: parseFloat(roi.toFixed(1)),
      };
    });

    return sortedGroups;
  }, [filteredSales, timeRange]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            <span>Profit & Árrés Elemző</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm">
            Hálózat és platform szerinti jövedelmezőségi elemzések, árrések (margin), megtérülések (ROI) és cash-flow minták.
          </p>
        </div>

        {/* View mode toggle for admin & Time filter & Refresh */}
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <div className="bg-slate-100 dark:bg-slate-900 p-1 rounded-xl flex items-center border border-slate-200/50 dark:border-slate-800">
              <button
                onClick={() => setViewMode('personal')}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                  viewMode === 'personal'
                    ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                Saját
              </button>
              <button
                onClick={() => setViewMode('global')}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                  viewMode === 'global'
                    ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                Globális (Admin)
              </button>
            </div>
          )}

          <div className="bg-slate-100 dark:bg-slate-900 p-1 rounded-xl flex items-center border border-slate-200/50 dark:border-slate-800">
            {(['30days', '90days', 'thisyear', 'all'] as const).map((range) => {
              const labels = {
                '30days': '30 Nap',
                '90days': '90 Nap',
                'thisyear': 'Ez az Év',
                'all': 'Összes'
              };
              return (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                    timeRange === range
                      ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  {labels[range]}
                </button>
              );
            })}
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchSalesData}
            className="rounded-xl h-10 w-10 p-0 border-slate-200/50 dark:border-slate-800"
            aria-label="Adatok frissítése"
          >
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-96 flex flex-col items-center justify-center gap-4">
          <LoadingSpinner size="lg" />
          <p className="text-slate-400 font-medium">Analitikai adatok feldolgozása...</p>
        </div>
      ) : filteredSales.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="max-w-md mx-auto flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight">Nincs értékesítési adat</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              A választott időintervallumban vagy a saját fiókodhoz jelenleg nincsenek rögzített eladások. Rögzíts eladásokat az "Eladások" menüpontban!
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Top Indicator KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Total Profit Card */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-colors" />
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Összesített Haszon</span>
                  <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-950/30 rounded-xl flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {formatCurrency(summaryMetrics.totalProfit)}
                </h3>
                <div className="flex items-center gap-1.5 mt-2.5">
                  <Badge variant="success" className="px-1.5 py-0">
                    {summaryMetrics.profitMargin.toFixed(1)}% Haszonkulcs
                  </Badge>
                  <span className="text-[10px] text-slate-400 uppercase font-black">Árrés</span>
                </div>
              </Card>
            </motion.div>

            {/* Margin (Árrés) Card */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <Card className="p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-colors" />
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Megtérülés (ROI)</span>
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-950/30 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {summaryMetrics.roi.toFixed(1)}%
                </h3>
                <div className="flex items-center gap-1.5 mt-2.5">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    COGS érteke: <span className="font-bold text-slate-700 dark:text-slate-300">{formatCurrency(summaryMetrics.totalCogs)}</span>
                  </span>
                </div>
              </Card>
            </motion.div>

            {/* Fees percentage card */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <Card className="p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-colors" />
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Jutalékok (Fees)</span>
                  <div className="w-10 h-10 bg-amber-100 dark:bg-amber-950/30 rounded-xl flex items-center justify-center">
                    <Percent className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {formatCurrency(summaryMetrics.totalFees)}
                </h3>
                <div className="flex items-center gap-1.5 mt-2.5">
                  <Badge variant="warning" className="px-1.5 py-0">
                    {summaryMetrics.avgFeePercentage.toFixed(1)}% átlag
                  </Badge>
                  <span className="text-[10px] text-slate-400 uppercase font-black">Bevételre vetítve</span>
                </div>
              </Card>
            </motion.div>

            {/* Net revenue and sales volume */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              <Card className="p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-colors" />
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Összes Értékesítés</span>
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-950/30 rounded-xl flex items-center justify-center">
                    <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {formatCurrency(summaryMetrics.totalRevenue)}
                </h3>
                <div className="flex items-center gap-1.5 mt-2.5">
                  <Badge variant="info" className="px-1.5 py-0">
                    {summaryMetrics.totalQty} db termék
                  </Badge>
                  <span className="text-[10px] text-slate-400 uppercase font-black">Eladva</span>
                </div>
              </Card>
            </motion.div>
          </div>

          {/* Havi Profit Cél & AI Előrejelzés Interfész */}
          <div className="my-8">
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
                <div className="h-48 flex flex-col items-center justify-center gap-3">
                  <LoadingSpinner size="md" />
                  <p className="text-xs text-slate-400 font-medium tracking-tight">Célelemzés betöltése az AI Vaultból...</p>
                </div>
              ) : !goalData?.currentGoal ? (
                <div className="flex flex-col lg:flex-row items-center gap-8 py-4">
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
                    
                    <div className="lg:col-span-5 space-y-6 p-5 bg-slate-50 dark:bg-slate-950/30 rounded-3xl border border-slate-200/40 dark:border-slate-800/60">
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
                        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-xs">
                          <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-black leading-none mb-1">Hátralévő táv</span>
                          <span className="text-sm font-extrabold text-red-650 dark:text-red-400 font-mono">
                            {formatCurrency(predictions?.remainingGap || 0)}
                          </span>
                        </div>
                        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-xs">
                          <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-black leading-none mb-1">Várható Profit</span>
                          <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                            {formatCurrency(predictions?.projectedProfit || 0)}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/50 space-y-3">
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

          {/* Graphical Trends and Main analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Trend Graph Area (2/3 size) */}
            <div className="lg:col-span-2 space-y-8">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-indigo-500" />
                      Profit és Árrés (Margin) Alakulása
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">Az időrendi jövedelmezőség és a százalékos megtérülés folyamatos vetülete.</p>
                  </div>
                </div>

                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={timelineData}>
                      <defs>
                        <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-800" />
                      <XAxis 
                        dataKey="formattedDate" 
                        className="text-[10px] font-bold text-slate-400 fill-slate-400"
                        tickLine={false}
                      />
                      <YAxis 
                        yAxisId="left"
                        className="text-[10px] font-bold text-slate-400 fill-slate-400"
                        tickFormatter={(value) => `${value / 1000}k`}
                        tickLine={false}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        className="text-[10px] font-bold text-indigo-400 fill-indigo-400"
                        tickFormatter={(value) => `${value}%`}
                        tickLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                          border: 'none', 
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 'bold',
                        }}
                        formatter={(value: any, name: any) => {
                          if (name === 'profit' || name === 'revenue') return [formatCurrency(Number(value)), name === 'profit' ? 'Tiszta Haszon' : 'Bevétel'];
                          if (name === 'margin') return [`${value}%`, 'Haszonkulcs %'];
                          return [value, name];
                        }}
                      />
                      <Area yAxisId="left" type="monotone" dataKey="profit" name="profit" fill="url(#colorProfit)" stroke="#10b981" strokeWidth={2.5} />
                      <Bar yAxisId="left" dataKey="revenue" name="revenue" fill="#6366f1" opacity={0.15} radius={[4, 4, 0, 0]} barSize={32} />
                      <Line yAxisId="right" type="monotone" dataKey="margin" name="margin" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Platform analytics metrics chart & insights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Platform Sales & Profits Bar Chart */}
                <Card className="p-6">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight mb-4 flex items-center gap-2">
                    <Building className="w-4.5 h-4.5 text-slate-400" />
                    Értékesítési Felületek Megoszlása
                  </h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={platformStats} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-800" horizontal={false} />
                        <XAxis type="number" className="text-[10px] font-bold text-slate-400" tickFormatter={(v) => `${v / 1000}k`} tickLine={false} />
                        <YAxis dataKey="platform" type="category" className="text-[10px] font-bold text-slate-500 fill-slate-500 dark:text-slate-400" width={110} tickLine={false} />
                        <Tooltip
                          contentStyle={{ 
                            backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                            border: 'none', 
                            borderRadius: '12px',
                            color: '#fff',
                            fontSize: '11px',
                          }}
                          formatter={(v) => [formatCurrency(Number(v)), 'Nemzetközi Ár']}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }} />
                        <Bar dataKey="revenue" name="Bevétel" fill="#6366f1" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Platform Fee & Margin efficiency insight card */}
                <Card className="p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight mb-4 flex items-center gap-2">
                      <Scale className="w-4.5 h-4.5 text-slate-400" />
                      Platform-Hatékonysági Insights
                    </h3>
                    
                    <div className="space-y-4">
                      {platformInsights.bestMargin && (
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                          <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest block mb-1">
                            Legmagasabb Árrésü Felület
                          </span>
                          <div className="flex items-baseline justify-between">
                            <span className="text-base font-black text-slate-900 dark:text-white">
                              {platformInsights.bestMargin.platform}
                            </span>
                            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                              {platformInsights.bestMargin.avgMargin.toFixed(1)}% Árrés
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 mt-1 block">
                            Ez a felület generálja a legnagyobb százalékos nyereséget eladásonként.
                          </span>
                        </div>
                      )}

                      {platformInsights.lowestFees && (
                        <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                          <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest block mb-1">
                            Legkedvezőbb Jutalékarány
                          </span>
                          <div className="flex items-baseline justify-between">
                            <span className="text-base font-black text-slate-900 dark:text-white">
                              {platformInsights.lowestFees.platform}
                            </span>
                            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                              {platformInsights.lowestFees.feeRatio.toFixed(1)}% Jutalék
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 mt-1 block">
                            Ez a csatorna tartja a legszűkebben a platform levonásokat a bevételekhez képest.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 italic">
                    💡 Használj kevesebb jutalékot levonó felületeket a globális profitráták maximalizálásához.
                  </div>
                </Card>
              </div>
            </div>

            {/* Platform detailed breakdown table (1/3 size) */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="p-6">
                <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight mb-4 flex items-center gap-2">
                  <Landmark className="w-4.5 h-4.5 text-slate-400" />
                  Csatornák Részletes Lebontása
                </h3>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {platformStats.map((item, idx) => (
                    <div 
                      key={item.platform} 
                      className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          {item.platform}
                        </span>
                        <Badge variant={item.avgMargin > 30 ? 'success' : 'info'}>
                          {item.avgMargin.toFixed(0)}% árrés
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                        <div>
                          <span className="text-slate-400 block">Bevétel:</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{formatCurrency(item.revenue)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Jutalék:</span>
                          <span className="font-bold text-amber-600">
                            {formatCurrency(item.fees)} ({item.feeRatio.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-slate-200/50 dark:border-slate-800/50 flex justify-between items-center text-xs">
                          <span className="text-slate-500 font-bold">Tiszta profit:</span>
                          <span className="font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(item.profit)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          {/* Model Rankings & Cash-Flow Velocity Section */}
          <Card className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                  <Award className="w-5 h-5 text-indigo-500" />
                  Modellek Cash-Flow & Forgási Sebessége
                </h3>
                <p className="text-xs text-slate-400 mt-1">Az AirPods eszközök rangsora nyereségesség, eladott mennyiség és tőkepörgés szerint.</p>
              </div>

              {/* Sorting selectors */}
              <div className="bg-slate-100 dark:bg-slate-900 p-1 rounded-xl flex items-center border border-slate-200/50 dark:border-slate-800">
                {(['profit', 'quantity', 'margin', 'roi'] as const).map((criteria) => {
                  const labels = {
                    profit: 'Profit',
                    quantity: 'Eladott db',
                    margin: 'Árrés %',
                    roi: 'Megtérülés %'
                  };
                  return (
                    <button
                      key={criteria}
                      onClick={() => setSortByModel(criteria)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                        sortByModel === criteria
                          ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                          : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                      )}
                    >
                      {labels[criteria]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Model stats structured grid list */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {modelStats.map((item, index) => {
                const getRankingIconStyle = (idx: number) => {
                  if (idx === 0) return 'bg-amber-150 border-amber-300 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400';
                  if (idx === 1) return 'bg-slate-150 border-slate-300 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300';
                  return 'bg-amber-50 border-slate-200 text-slate-500 dark:bg-slate-900/40 dark:text-slate-400';
                };

                return (
                  <motion.div
                    key={item.model}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden flex flex-col justify-between hover:border-indigo-250 dark:hover:border-indigo-900 transition-all group"
                  >
                    <div>
                      {/* Ranked Crown badge */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <span className={cn(
                            "w-6 h-6 rounded-lg text-xs font-black border flex items-center justify-center shadow-sm",
                            getRankingIconStyle(index)
                          )}>
                            #{index + 1}
                          </span>
                          <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight truncate max-w-[150px]">
                            {item.model}
                          </span>
                        </div>

                        <Badge variant={index === 0 ? 'success' : 'outline'} className="text-[10px] font-bold py-0.5">
                          {item.salesCount} Tranzakció
                        </Badge>
                      </div>

                      <div className="space-y-3 pt-1">
                        {/* Quick cash stats */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">Generált árbevétel:</span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{formatCurrency(item.revenue)}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">Átlagos beszerzett db:</span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.quantity} db eladva</span>
                        </div>

                        {/* Visual bar measuring Margin vs ROI */}
                        <div className="space-y-1.5 pt-1">
                          <div className="flex justify-between text-[11px] text-slate-400">
                            <span>Árrés: <strong className="text-slate-600 dark:text-slate-300">{item.margin.toFixed(0)}%</strong></span>
                            <span>Megtérülés (ROI): <strong className="text-indigo-600 dark:text-indigo-400">{item.roi.toFixed(0)}%</strong></span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                            <div className="bg-emerald-500" style={{ width: `${Math.min(item.margin, 100)}%` }} />
                            <div className="bg-indigo-500" style={{ width: `${Math.min(item.roi - item.margin, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest leading-none">Generált tiszta profit</span>
                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                          {formatCurrency(item.profit)}
                        </span>
                      </div>
                      
                      <div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950 transition-colors">
                        <Zap className="w-4 h-4 text-slate-450 dark:text-slate-500 group-hover:text-indigo-500 group-hover:animate-pulse" />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
