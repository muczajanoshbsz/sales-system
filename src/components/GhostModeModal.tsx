import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Ghost, ShieldCheck, ShieldAlert, X, Zap } from 'lucide-react';
import { Button } from './ui/Base';

interface GhostModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (readOnly: boolean) => void;
  targetUser: {
    displayName?: string;
    email: string;
  };
}

export const GhostModeModal: React.FC<GhostModeModalProps> = ({ isOpen, onClose, onConfirm, targetUser }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
          >
            {/* Header with Ghostly Gradient */}
            <div className="h-32 bg-gradient-to-br from-indigo-600 to-purple-700 relative flex items-center justify-center">
              <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
              <motion.div
                animate={{ 
                  y: [0, -10, 0],
                  filter: ['drop-shadow(0 0 0px rgba(255,255,255,0))', 'drop-shadow(0 0 15px rgba(255,255,255,0.5))', 'drop-shadow(0 0 0px rgba(255,255,255,0))']
                }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <Ghost className="w-16 h-16 text-white" />
              </motion.div>
              
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/20 text-white hover:bg-black/40 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-8">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
                  Ghost Mode Aktiválása
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  Biztosan be szeretnél lépni <span className="font-bold text-indigo-600 dark:text-indigo-400">{targetUser.displayName || targetUser.email}</span> fiókjába?
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={() => onConfirm(true)}
                  className="group relative flex items-center gap-4 p-4 rounded-2xl border-2 border-amber-500/20 hover:border-amber-500 bg-amber-500/5 hover:bg-amber-500/10 transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <ShieldAlert className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Betekintés (Írásvédett)</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Biztonságos nézet, nem tudsz módosítani semmit.</div>
                  </div>
                  <Zap className="absolute top-4 right-4 w-4 h-4 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>

                <button
                  onClick={() => onConfirm(false)}
                  className="group relative flex items-center gap-4 p-4 rounded-2xl border-2 border-indigo-500/20 hover:border-indigo-500 bg-indigo-500/5 hover:bg-indigo-500/10 transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Teljes Hozzáférés</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Minden műveletet elvégezhetsz a felhasználó nevében.</div>
                  </div>
                  <Zap className="absolute top-4 right-4 w-4 h-4 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                    <Zap className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed italic">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 uppercase">Audit Figyelmeztetés:</span> Minden Ghost Mode-ban végzett műveletet rögzítünk a neveddel és az időponttal az elszámoltathatóság érdekében.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
