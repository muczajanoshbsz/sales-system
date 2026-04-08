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
  ChevronRight, Plus
} from 'lucide-react';
import { motion } from 'motion/react';
import { apiService } from '../services/apiService';
import { subDays, format, startOfMonth, addMonths, isAfter, parseISO, isSameMonth, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-12">
      {/* Header & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Vezetői Irányítópult</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Üdvözöljük újra! Itt a mai üzleti áttekintés.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => navigate('/inventory')} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
            <Package className="w-4 h-4 mr-2" />
            Készlet
          </Button>
          <Button onClick={() => navigate('/sales')}>
            <Plus className="w-4 h-4 mr-2" />
            Új Eladás
          </Button>
        </div>
      </div>

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
                <span className="text-slate-500">Bevétel</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-slate-500">Profit</span>
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
                    <span className="text-[10px] text-slate-400 font-medium uppercase">{formatDate(activity.date)}</span>
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
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</p>
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
