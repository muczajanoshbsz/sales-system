import React, { useEffect, useState } from 'react';
import { Sale, StockItem, PendingSale } from '../types';
import { Card } from './ui/Base';
import { formatCurrency, cn } from '../lib/utils';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart
} from 'recharts';
import { ShoppingBag, TrendingUp, DollarSign, AlertTriangle, BarChart3, LineChart as LineChartIcon, Sparkles, Clock, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { apiService } from '../services/apiService';
import { subDays, format, startOfMonth, addMonths, isAfter, parseISO } from 'date-fns';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const Dashboard: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [salesData, stockData, pendingData] = await Promise.all([
          apiService.getSales(),
          apiService.getStock(),
          apiService.getPendingSales()
        ]);
        setSales(salesData);
        setStock(stockData);
        setPendingSales(pendingData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const totalRevenue = sales.reduce((sum, s) => sum + s.sell_price, 0);
  const totalProfit = sales.reduce((sum, s) => sum + s.profit, 0);
  const totalSales = sales.length;
  const lowStockCount = stock.filter(item => item.quantity < 5).length;

  // Pending Stats
  const activePending = pendingSales.filter(p => p.status === 'pending');
  const potentialRevenue = activePending.reduce((sum, p) => sum + p.sell_price, 0);
  const potentialProfit = activePending.reduce((sum, p) => sum + p.profit, 0);

  const monthlyData = sales.reduce((acc: any[], sale) => {
    const month = sale.date.substring(0, 7);
    const existing = acc.find(d => d.month === month);
    if (existing) {
      existing.profit += sale.profit;
      existing.revenue += sale.sell_price;
    } else {
      acc.push({ month, profit: sale.profit, revenue: sale.sell_price });
    }
    return acc;
  }, []).sort((a, b) => a.month.localeCompare(b.month));

  const platformData = sales.reduce((acc: any[], sale) => {
    const existing = acc.find(d => d.name === sale.platform);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: sale.platform, value: 1 });
    }
    return acc;
  }, []);

  // Pipeline Data
  const pipelineData = [
    { name: 'Lezárt', value: totalRevenue, color: '#6366f1' },
    { name: 'Függő', value: potentialRevenue, color: '#94a3b8' }
  ];

  // Low Stock Over Time (7-day trend)
  const lowStockTrend = Array.from({ length: 7 }).map((_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // Calculate virtual stock for each item on this date
    // Stock(date) = CurrentStock + Sales(since date)
    const count = stock.filter(item => {
      const salesSinceDate = sales
        .filter(s => s.model === item.model && s.condition === item.condition && isAfter(parseISO(s.date), date))
        .reduce((sum, s) => sum + s.quantity, 0);
      return (item.quantity + salesSinceDate) < 5;
    }).length;

    return { date: format(date, 'MMM dd'), count };
  });

  // Profit Prediction for Next Month
  const lastThreeMonths = Array.from({ length: 3 }).map((_, i) => {
    const monthDate = startOfMonth(subDays(new Date(), (2 - i) * 30));
    const monthStr = format(monthDate, 'yyyy-MM');
    const monthlyProfit = sales
      .filter(s => s.date.startsWith(monthStr))
      .reduce((sum, s) => sum + s.profit, 0);
    return { month: format(monthDate, 'MMM'), profit: monthlyProfit, type: 'actual' };
  });

  const avgProfit = lastThreeMonths.reduce((sum, m) => sum + m.profit, 0) / lastThreeMonths.length;
  const predictedMonth = startOfMonth(addMonths(new Date(), 1));
  const predictionData = [
    ...lastThreeMonths,
    { 
      month: format(predictedMonth, 'MMM'), 
      profit: Math.round(avgProfit * 1.1) + potentialProfit, // Include pending profit in prediction
      type: 'predicted' 
    }
  ];

  // Top Selling Models by Profit
  const modelPerformance = sales.reduce((acc: any[], sale) => {
    const existing = acc.find(d => d.model === sale.model);
    if (existing) {
      existing.profit += sale.profit;
      existing.quantity += sale.quantity;
    } else {
      acc.push({ model: sale.model, profit: sale.profit, quantity: sale.quantity });
    }
    return acc;
  }, [])
  .sort((a, b) => b.profit - a.profit)
  .slice(0, 5);

  // Daily Sales Activity (Last 30 Days)
  const dailyActivity = Array.from({ length: 30 }).map((_, i) => {
    const date = subDays(new Date(), 29 - i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const daySales = sales.filter(s => s.date.startsWith(dateStr));
    return {
      date: format(date, 'MMM dd'),
      revenue: daySales.reduce((sum, s) => sum + s.sell_price, 0),
      count: daySales.length
    };
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Összes Bevétel" value={formatCurrency(totalRevenue)} icon={DollarSign} color="indigo" />
        <StatCard title="Összes Profit" value={formatCurrency(totalProfit)} icon={TrendingUp} color="emerald" />
        <StatCard title="Függő Profit" value={formatCurrency(potentialProfit)} icon={Clock} color="amber" />
        <StatCard title="Alacsony Készlet" value={lowStockCount.toString()} icon={AlertTriangle} color="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Havi Profit Trend</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(v: number) => [formatCurrency(v), 'Profit']}
                />
                <Area type="monotone" dataKey="profit" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900">Pipeline Állapot</h3>
            <Clock className="w-5 h-5 text-slate-400" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pipelineData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pipelineData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-4 mt-4">
            <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-xl">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-medium text-indigo-900">Lezárt</span>
              </div>
              <span className="font-bold text-indigo-900">{formatCurrency(totalRevenue)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-900">Függő</span>
              </div>
              <span className="font-bold text-slate-900">{formatCurrency(potentialRevenue)}</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            <h3 className="text-lg font-semibold text-slate-900">Alacsony Készlet Trend (7 nap)</h3>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lowStockTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
                <Line type="stepAfter" dataKey="count" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4, fill: '#f43f5e' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-indigo-500" />
            <h3 className="text-lg font-semibold text-slate-900">Profit Előrejelzés (Következő Hónap)</h3>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={predictionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  formatter={(v: number) => [formatCurrency(v), 'Profit']}
                />
                <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                  {predictionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.type === 'predicted' ? '#818cf8' : '#6366f1'} fillOpacity={entry.type === 'predicted' ? 0.6 : 1} />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="profit" stroke="#4f46e5" strokeWidth={2} dot={false} strokeDasharray={5} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100 flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <p className="text-sm text-indigo-900">
              A következő hónapra várható profit: <span className="font-bold">{formatCurrency(predictionData[3].profit)}</span> 
              <span className="text-xs ml-1 opacity-70">(+10% becsült növekedés + függő tételek)</span>
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-6">
            <LineChartIcon className="w-5 h-5 text-emerald-500" />
            <h3 className="text-lg font-semibold text-slate-900">Napi Értékesítési Pulzus (Utolsó 30 nap)</h3>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyActivity}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} interval={4} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  formatter={(v: number) => [formatCurrency(v), 'Bevétel']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Platform Eloszlás</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={platformData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {platformData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string; icon: any; color: string }> = ({ title, value, icon: Icon, color }) => {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  };

  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }}>
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className={cn('p-3 rounded-xl', colors[color])}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

export default Dashboard;
