import React, { useEffect, useState } from 'react';
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
  const totalRevenue = sales.reduce((sum, s) => sum + s.sell_price, 0);
  const totalProfit = sales.reduce((sum, s) => sum + s.profit, 0);
  const totalSales = sales.length;
  const lowStockCount = stock.filter(item => item.quantity < 5).length;

  // Monthly Comparison
  const currentMonth = new Date();
  const lastMonth = subMonths(currentMonth, 1);
  
  const currentMonthSales = sales.filter(s => isSameMonth(parseISO(s.date), currentMonth));
  const lastMonthSales = sales.filter(s => isSameMonth(parseISO(s.date), lastMonth));
  
  const currentMonthProfit = currentMonthSales.reduce((sum, s) => sum + s.profit, 0);
  const lastMonthProfit = lastMonthSales.reduce((sum, s) => sum + s.profit, 0);
  const profitTrend = lastMonthProfit === 0 ? 100 : ((currentMonthProfit - lastMonthProfit) / lastMonthProfit) * 100;

  const currentMonthRevenue = currentMonthSales.reduce((sum, s) => sum + s.sell_price, 0);
  const lastMonthRevenue = lastMonthSales.reduce((sum, s) => sum + s.sell_price, 0);
  const revenueTrend = lastMonthRevenue === 0 ? 100 : ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;

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

  // Top Selling Models
  const modelPerformance = sales.reduce((acc: any[], sale) => {
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
  .slice(0, 5);

  // Recent Activity
  const recentActivity = [
    ...sales.map(s => ({ ...s, type: 'sale' as const })),
    ...pendingSales.map(p => ({ ...p, type: 'pending' as const }))
  ]
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  .slice(0, 5);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Vezetői Irányítópult</h1>
          <p className="text-slate-500 mt-1">Üdvözöljük újra! Itt a mai üzleti áttekintés.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => navigate('/inventory')}>
            <Package className="w-4 h-4 mr-2" />
            Készlet
          </Button>
          <Button onClick={() => navigate('/sales')}>
            <Plus className="w-4 h-4 mr-2" />
            Új Eladás
          </Button>
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Havi Bevétel" 
          value={formatCurrency(currentMonthRevenue)} 
          trend={revenueTrend}
          icon={DollarSign} 
          color="indigo" 
        />
        <StatCard 
          title="Havi Profit" 
          value={formatCurrency(currentMonthProfit)} 
          trend={profitTrend}
          icon={TrendingUp} 
          color="emerald" 
        />
        <StatCard 
          title="Függő Profit" 
          value={formatCurrency(potentialProfit)} 
          icon={Clock} 
          color="amber" 
        />
        <StatCard 
          title="Alacsony Készlet" 
          value={lowStockCount.toString()} 
          icon={AlertTriangle} 
          color="rose" 
          isWarning={lowStockCount > 0}
        />
      </div>

      {/* Main Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Revenue/Profit Chart - 8 cols */}
        <Card className="p-6 lg:col-span-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Pénzügyi Teljesítmény</h3>
              <p className="text-xs text-slate-500">Bevétel és profit alakulása havi bontásban</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-indigo-600"></div>
                <span className="text-slate-600">Bevétel</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-slate-600">Profit</span>
              </div>
            </div>
          </div>
          <div className="h-[350px]">
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProf)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Platform Distribution - 4 cols */}
        <Card className="p-6 lg:col-span-4">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Platform Eloszlás</h3>
          <p className="text-xs text-slate-500 mb-8">Értékesítési csatornák megoszlása</p>
          <div className="h-64">
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
                  <span className="text-sm text-slate-600">{item.name}</span>
                </div>
                <span className="text-sm font-bold text-slate-900">{item.value} eladás</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Top Models - 7 cols */}
        <Card className="p-6 lg:col-span-7">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-900">Legnépszerűbb Modellek</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate('/sales')}>
              Összes megtekintése <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100">
                  <th className="pb-4 font-medium">Modell</th>
                  <th className="pb-4 font-medium text-center">Mennyiség</th>
                  <th className="pb-4 font-medium text-right">Profit</th>
                  <th className="pb-4 font-medium text-right">Átlag Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {modelPerformance.map((item, idx) => (
                  <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 font-bold text-slate-900">{item.model}</td>
                    <td className="py-4 text-center">
                      <span className="px-2 py-1 bg-slate-100 rounded-md text-xs font-bold text-slate-600">
                        {item.quantity} db
                      </span>
                    </td>
                    <td className="py-4 text-right font-bold text-emerald-600">{formatCurrency(item.profit)}</td>
                    <td className="py-4 text-right text-slate-500">{formatCurrency(item.profit / item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent Activity - 5 cols */}
        <Card className="p-6 lg:col-span-5">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Legutóbbi Aktivitás</h3>
          <div className="space-y-6">
            {recentActivity.map((activity, idx) => (
              <div key={idx} className="flex items-start gap-4">
                <div className={cn(
                  "p-2 rounded-lg shrink-0",
                  activity.type === 'sale' ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                )}>
                  {activity.type === 'sale' ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-bold text-slate-900 truncate">{activity.model}</p>
                    <span className="text-[10px] text-slate-400 font-medium uppercase">{formatDate(activity.date)}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activity.type === 'sale' ? 'Sikeres eladás' : 'Függő eladás'} - {activity.platform}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs font-bold text-slate-900">{formatCurrency(activity.sell_price)}</span>
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                      activity.type === 'sale' ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    )}>
                      {activity.type === 'sale' ? `+${formatCurrency(activity.profit)} profit` : 'Várakozás'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button variant="secondary" className="w-full mt-8" onClick={() => navigate('/sales')}>
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
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, color, trend, isWarning }) => {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
  };

  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }}>
      <Card className={cn("p-6 relative overflow-hidden", isWarning && "ring-2 ring-rose-500 ring-offset-2")}>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
            
            {trend !== undefined && (
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  "flex items-center text-xs font-bold px-1.5 py-0.5 rounded-full",
                  trend >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                )}>
                  {trend >= 0 ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                  {Math.abs(Math.round(trend))}%
                </div>
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">múlt hónaphoz képest</span>
              </div>
            )}
          </div>
          <div className={cn('p-3 rounded-2xl ring-4', colors[color])}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
        
        {/* Subtle background decoration */}
        <div className={cn(
          "absolute -right-4 -bottom-4 w-24 h-24 rounded-full opacity-5",
          colors[color].split(' ')[0]
        )}></div>
      </Card>
    </motion.div>
  );
};

export default Dashboard;
