import React, { useState, useEffect } from 'react';
import { Calculator as CalcIcon, RefreshCw, Copy, Check, DollarSign, Truck, ShieldAlert, BadgePercent, AlertCircle, Info } from 'lucide-react';
import { Card, Button, Input } from './ui/Base';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useToast } from './ToastContext';

const Calculator: React.FC = () => {
  const { showToast } = useToast();
  const [balance, setBalance] = useState<number>(3000);
  const [shipping, setShipping] = useState<number>(890);
  const [protectionFix, setProtectionFix] = useState<number>(280);
  const [protectionPercent, setProtectionPercent] = useState<number>(5);
  const [targetPrice, setTargetPrice] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // ar = (egyenleg - (SZALLITAS + VEVOVEDELEM_FIX)) / SZORZO
    const fixedCosts = shipping + protectionFix;
    const multiplier = 1 + (protectionPercent / 100);
    
    if (balance > fixedCosts) {
      const price = (balance - fixedCosts) / multiplier;
      setTargetPrice(Math.floor(price));
    } else {
      setTargetPrice(0);
    }
  }, [balance, shipping, protectionFix, protectionPercent]);

  const handleCopy = () => {
    navigator.clipboard.writeText(targetPrice.toString());
    setCopied(true);
    showToast('Ár vágólapra másolva!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const calculatedTotal = targetPrice + shipping + (targetPrice * (protectionPercent / 100) + protectionFix);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200">
              <CalcIcon className="w-6 h-6 text-white" />
            </div>
            Vinted Számológép
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1 uppercase tracking-wider">Határozd meg a maximális termékárat az egyenleged alapján</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Section */}
        <Card className="p-8 space-y-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none rounded-[2rem]">
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block ml-1">Vinted Egyenleg (Ft)</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500 group-focus-within:scale-110 transition-transform">
                  <DollarSign className="w-5 h-5" />
                </div>
                <input
                  type="number"
                  value={balance || ''}
                  onChange={(e) => setBalance(Number(e.target.value))}
                  className="w-full h-14 pl-12 pr-4 bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl text-lg font-bold focus:border-indigo-500 focus:outline-none transition-all"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block ml-1">Szállítás (Ft)</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Truck className="w-4 h-4" />
                  </div>
                  <input
                    type="number"
                    value={shipping || ''}
                    onChange={(e) => setShipping(Number(e.target.value))}
                    className="w-full h-12 pl-12 pr-4 bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl text-sm font-bold focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block ml-1">Fix Vevővédelem (Ft)</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <input
                    type="number"
                    value={protectionFix || ''}
                    onChange={(e) => setProtectionFix(Number(e.target.value))}
                    className="w-full h-12 pl-12 pr-4 bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl text-sm font-bold focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block ml-1">Vevővédelem (%)</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <BadgePercent className="w-4 h-4" />
                </div>
                <input
                  type="number"
                  value={protectionPercent || ''}
                  onChange={(e) => setProtectionPercent(Number(e.target.value))}
                  className="w-full h-12 pl-12 pr-4 bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl text-sm font-bold focus:border-indigo-500 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-900/20">
              <Info className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed font-medium">
                Az adatok alapértelmezés szerint a Vinted aktuális magyarországi díjait mutatják (890 Ft Futárszolgálat, 280 Ft + 5% vevővédelem).
              </p>
            </div>
          </div>
        </Card>

        {/* Result Section */}
        <div className="space-y-6">
          <Card className="p-8 bg-indigo-600 text-white border-none shadow-2xl shadow-indigo-500/30 rounded-[2rem] relative overflow-hidden">
            <motion.div
              animate={{ rotate: [0, 10, 0] }}
              transition={{ duration: 5, repeat: Infinity }}
              className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl"
            />
            
            <div className="relative space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-indigo-100">Javasolt Termékár</span>
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <RefreshCw className="w-4 h-4 text-white animate-spin-slow" />
                </div>
              </div>

              <div className="flex flex-col items-center justify-center py-6">
                <motion.span 
                  key={targetPrice}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-7xl font-black tracking-tighter"
                >
                  {targetPrice.toLocaleString()} <span className="text-3xl font-medium">Ft</span>
                </motion.span>
                <p className="text-indigo-100/70 text-sm font-bold mt-2 uppercase tracking-widest">Ez a maximális beállítható ár</p>
              </div>

              <Button 
                onClick={handleCopy}
                variant="ghost" 
                className={cn(
                  "w-full h-14 bg-white text-indigo-600 hover:bg-indigo-50 font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-3",
                  copied && "bg-emerald-500 text-white hover:bg-emerald-600"
                )}
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copied ? 'MÁSOLVA!' : 'ÁR MÁSOLÁSA'}
              </Button>
            </div>
          </Card>

          <Card className="p-8 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-[2rem]">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Tételes Lebontás (Keret: {balance} Ft)</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Termék nettó ára</span>
                <span className="font-bold text-slate-900 dark:text-white">{targetPrice.toLocaleString()} Ft</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Vevővédelem ({protectionPercent}%)</span>
                <span className="font-bold text-slate-900 dark:text-white">{(targetPrice * (protectionPercent / 100)).toLocaleString()} Ft</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Fix Vevővédelem díj</span>
                <span className="font-bold text-slate-900 dark:text-white">{protectionFix.toLocaleString()} Ft</span>
              </div>
              <div className="flex justify-between items-center text-sm pb-4 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 font-medium">Szállítási költség</span>
                <span className="font-bold text-slate-900 dark:text-white">{shipping.toLocaleString()} Ft</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-sm font-black uppercase tracking-widest text-indigo-600">Végösszeg</span>
                <div className="text-right">
                  <span className={cn(
                    "text-xl font-black",
                    calculatedTotal > balance ? "text-red-500" : "text-emerald-500"
                  )}>
                    {Math.round(calculatedTotal).toLocaleString()} Ft
                  </span>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    {calculatedTotal <= balance ? 'Belefér a keretbe' : 'Túllépi az egyenget'}
                  </p>
                </div>
              </div>
            </div>
            
            {calculatedTotal > balance && (
              <div className="mt-6 flex gap-3 p-4 bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/20 items-center">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-xs text-red-700 dark:text-red-400 font-bold">VIGYÁZAT: A jelenlegi beállításokkal a keret nem elegendő!</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Calculator;
