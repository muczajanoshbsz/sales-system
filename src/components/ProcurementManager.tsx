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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">Beszerzési Javaslatok</h2>
        <div className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full flex items-center gap-2">
          <Info className="w-4 h-4" />
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
              "p-5 border-l-4",
              item.priority === 'urgent' ? "border-l-red-500 bg-red-50/30" :
              item.priority === 'normal' ? "border-l-amber-500 bg-amber-50/30" :
              "border-l-emerald-500 bg-emerald-50/30"
            )}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    item.priority === 'urgent' ? "bg-red-100 text-red-600" :
                    item.priority === 'normal' ? "bg-amber-100 text-amber-600" :
                    "bg-emerald-100 text-emerald-600"
                  )}>
                    <ShoppingCart className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{item.model}</h3>
                    <span className="text-xs font-semibold text-slate-500 uppercase">{item.condition}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 flex-1 max-w-2xl px-4">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Készlet</p>
                    <p className="text-lg font-bold text-slate-900">{item.currentStock} db</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Napi Igény</p>
                    <p className="text-lg font-bold text-slate-900">{item.dailyDemand}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Kitart</p>
                    <p className={cn(
                      "text-lg font-bold",
                      item.daysRemaining < 7 ? "text-red-600" : "text-slate-900"
                    )}>
                      {item.daysRemaining > 365 ? '∞' : `${item.daysRemaining} nap`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Javasolt</p>
                    <p className="text-lg font-bold text-indigo-600">+{item.recommendedOrder} db</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
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