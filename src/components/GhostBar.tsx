import React from 'react';
import { motion } from 'motion/react';
import { Ghost, LogOut, ShieldAlert } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { Button } from './ui/Base';

export const GhostBar: React.FC = () => {
  const { ghostMode, exitGhostMode } = useFirebase();

  if (!ghostMode.isActive) return null;

  return (
    <motion.div
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 left-0 right-0 z-[10000] pointer-events-none"
    >
      <div className="relative overflow-hidden bg-indigo-950/95 backdrop-blur-xl border-b border-indigo-500/40 shadow-[0_0_30px_rgba(79,70,229,0.3)] pointer-events-auto">
        {/* Animated background gradient */}
        <motion.div 
          animate={{ 
            x: ['-100%', '100%'],
            opacity: [0.1, 0.3, 0.1]
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent skew-x-12"
        />

        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <motion.div
                  animate={{ 
                    opacity: [0.4, 1, 0.4],
                    scale: [0.9, 1.1, 0.9],
                    filter: ['blur(0px)', 'blur(2px)', 'blur(0px)']
                  }}
                  transition={{ repeat: Infinity, duration: 2.5 }}
                >
                  <Ghost className="w-5 h-5 text-indigo-400" />
                </motion.div>
                <motion.div 
                  animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 bg-indigo-400 rounded-full blur-md"
                />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-300 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]">
                Ghost Mode Aktív
              </span>
            </div>
            
            <div className="h-6 w-px bg-indigo-800/50" />
            
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-tighter leading-none mb-0.5">Célfelhasználó</span>
                <span className="text-sm font-black text-white tracking-tight leading-none">
                  {ghostMode.targetUser?.displayName || ghostMode.targetUser?.email}
                </span>
              </div>
              
              {ghostMode.readOnly && (
                <motion.div 
                  animate={{ 
                    boxShadow: ['0 0 0px rgba(245,158,11,0)', '0 0 10px rgba(245,158,11,0.4)', '0 0 0px rgba(245,158,11,0)']
                  }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-[9px] font-black text-amber-400 uppercase tracking-widest"
                >
                  <ShieldAlert className="w-3 h-3" />
                  Írásvédett
                </motion.div>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={exitGhostMode}
            className="h-8 bg-white/5 hover:bg-red-500/20 text-indigo-200 hover:text-red-400 border border-white/10 hover:border-red-500/40 transition-all gap-2 px-4 group"
          >
            <LogOut className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">Kilépés</span>
          </Button>
        </div>
        
        {/* Scanning line effect */}
        <motion.div 
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-0 left-0 w-1/3 h-[1px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent opacity-50"
        />
      </div>
    </motion.div>
  );
};
