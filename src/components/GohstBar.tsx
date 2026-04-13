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
      <div className="bg-indigo-950/90 backdrop-blur-md border-b border-indigo-500/30 shadow-2xl pointer-events-auto">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ 
                  opacity: [0.4, 1, 0.4],
                  scale: [0.95, 1.05, 0.95]
                }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Ghost className="w-5 h-5 text-indigo-400" />
              </motion.div>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">
                Ghost Mode Aktív
              </span>
            </div>
            
            <div className="h-4 w-px bg-indigo-800" />
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-indigo-400">Betekintés:</span>
              <span className="text-sm font-bold text-white">
                {ghostMode.targetUser?.displayName || ghostMode.targetUser?.email}
              </span>
              {ghostMode.readOnly && (
                <div className="flex items-center gap-1 ml-2 px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                  <ShieldAlert className="w-3 h-3" />
                  Írásvédett
                </div>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={exitGhostMode}
            className="h-8 bg-indigo-500/10 hover:bg-red-500/20 text-indigo-300 hover:text-red-400 border border-indigo-500/20 hover:border-red-500/30 transition-all gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Kilépés</span>
          </Button>
        </div>
        
        {/* Pulsing bottom border for extra visibility */}
        <motion.div 
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ repeat: Infinity, duration: 3 }}
          className="h-0.5 w-full bg-gradient-to-r from-transparent via-indigo-500 to-transparent"
        />
      </div>
    </motion.div>
  );
};
