import React, { useEffect, useState } from 'react';
import { Sale, StockItem } from '../types';
import { Button, Card } from './ui/Base';
import { formatCurrency, cn } from '../lib/utils';
import { APP_CONFIG } from '../constants';
import { TrendingUp, AlertCircle, ShoppingCart, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { apiService } from '../services/apiService';

interface ProcurementAdvice {
  model: string;
  condition: string;
  currentStock: number;
  dailyDemand: number;
  daysRemaining: number;
  recommendedOrder: number;
  priority: 'urgent' | 'normal' | 'low';
}

const ProcurementManager: React.FC = () => {
  const [advice, setAdvice] = useState<ProcurementAdvice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const calculateAdvice = async () => {
      try {
        const [sales, stock] = await Promise.all([
          apiService.getSales(),
          apiService.getStock()
        ]);
        
        const newAdvice: ProcurementAdvice[] = stock.map(item => {
          const itemSales = sales.filter(s => s.model === item.model && s.condition === item.condition);
          
          // Calculate average daily demand over last 30 days
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          const recentSalesCount = itemSales
            .filter(s => new Date(s.date) >= thirtyDaysAgo)
            .reduce((sum, s) => sum + s.quantity, 0);
          
          const dailyDemand = recentSalesCount / 30;
          const daysRemaining = dailyDemand > 0 ? item.quantity / dailyDemand : 999;
          
          let priority: 'urgent' | 'normal' | 'low' = 'low';
          if (daysRemaining < 7 || item.quantity === 0) priority = 'urgent';
          else if (daysRemaining < 14) priority = 'normal';

          const recommendedOrder = Math.ceil(dailyDemand * 14) - item.quantity;

          return {
            model: item.model,
            condition: item.condition,
            currentStock: item.quantity,
            dailyDemand: Number(dailyDemand.toFixed(2)),
            daysRemaining: Math.round(daysRemaining),
            recommendedOrder: Math.max(0, recommendedOrder),
            priority,
          };
        }).sort((a, b) => {
          const priorityMap = { urgent: 0, normal: 1, low: 2 };
          return priorityMap[a.priority] - priorityMap[b.priority];
        });

        setAdvice(newAdvice);
      } catch (error) {
        console.error('Error calculating procurement advice:', error);
      } finally {
        setLoading(false);
      }
    };

    calculateAdvice();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Beszerzés</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Automatikus készlet-utánpótlási javaslatok</p>
        </div>
        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm">
          <Info className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          Az elmúlt 30 nap eladásai alapján
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {advice.map((item, index) => (
          <motion.div
            key={`${item.model}-${item.condition}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className={cn(
              "p-6 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all duration-300 rounded-2xl overflow-hidden relative group",
              item.priority === 'urgent' ? "border-l-4 border-l-red-500" :
              item.priority === 'normal' ? "border-l-4 border-l-amber-500" :
              "border-l-4 border-l-emerald-500"
            )}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm",
                    item.priority === 'urgent' ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" :
                    item.priority === 'normal' ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
                    "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                  )}>
                    <ShoppingCart className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{item.model}</h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{item.condition}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 flex-1 max-w-2xl px-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Készlet</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{item.currentStock} db</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Napi Igény</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{item.dailyDemand}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Kitart</p>
                    <p className={cn(
                      "text-lg font-bold",
                      item.daysRemaining < 7 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"
                    )}>
                      {item.daysRemaining > 365 ? '∞' : `${item.daysRemaining} nap`}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Javasolt</p>
                    <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">+{item.recommendedOrder} db</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                    item.priority === 'urgent' ? "bg-red-600 text-white" :
                    item.priority === 'normal' ? "bg-amber-500 text-white" :
                    "bg-emerald-500 text-white"
                  )}>
                    {item.priority === 'urgent' ? 'Sürgős' : item.priority === 'normal' ? 'Tervezett' : 'Rendben'}
                  </span>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default ProcurementManager;
