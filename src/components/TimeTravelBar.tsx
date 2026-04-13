import React from 'react';
import { motion } from 'motion/react';
import { Clock, LogOut, History, Zap } from 'lucide-react';
import { Button } from './ui/Base';
import { useFirebase } from './FirebaseProvider';

export const TimeTravelBar: React.FC = () => {
  const { timeTravel, exitTimeTravel } = useFirebase();

  if (!timeTravel.isActive) return null;

  return (
    <motion.div
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 left-0 right-0 z-[10001] pointer-events-none"
    >
      <div className="relative overflow-hidden bg-emerald-950/95 backdrop-blur-xl border-b border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.3)] pointer-events-auto">
        {/* Animated background gradient */}
        <motion.div 
          animate={{ 
            x: ['-100%', '100%'],
            opacity: [0.1, 0.2, 0.1]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent skew-x-12"
        />

        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <motion.div
                  animate={{ 
                    rotate: [0, 360]
                  }}
                  transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
                >
                  <Clock className="w-5 h-5 text-emerald-400" />
                </motion.div>
                <motion.div 
                  animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 bg-emerald-400 rounded-full blur-md"
                />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">
                Time Travel Aktív
              </span>
            </div>
            
            <div className="h-6 w-px bg-emerald-800/50" />
            
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-tighter leading-none mb-0.5">Mentés Időpontja</span>
                <span className="text-sm font-black text-white tracking-tight leading-none">
                  {new Date(timeTravel.backupDate!).toLocaleString('hu-HU')}
                </span>
              </div>
              
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                <History className="w-3 h-3" />
                Csak Olvasható
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-white/5 rounded-lg border border-white/10">
              <Zap className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span className="text-[9px] font-bold text-emerald-200 uppercase tracking-wider italic">Múltbéli adatok megtekintése</span>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={exitTimeTravel}
              className="h-8 bg-white/5 hover:bg-emerald-500/20 text-emerald-200 hover:text-white border border-white/10 hover:border-emerald-500/40 transition-all gap-2 px-4 group"
            >
              <LogOut className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Vissza a Jelenbe</span>
            </Button>
          </div>
        </div>
        
        {/* Scanning line effect */}
        <motion.div 
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-0 left-0 w-1/3 h-[1px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-50"
        />
      </div>
    </motion.div>
  );
};

export default TimeTravelBar;