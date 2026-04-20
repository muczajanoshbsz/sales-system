import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Clock, LogOut, RefreshCw, Lock } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { apiService } from '../services/apiService';
import { Button } from './ui/Base';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { cn } from '../lib/utils';

// Cross-tab communication channel
export const sessionChannel = new BroadcastChannel('airpods_vault_session');

export const SessionMonitor: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useFirebase();
  const [isWarning, setIsWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [isBlurred, setIsBlurred] = useState(false);
  const [timeoutDuration, setTimeoutDuration] = useState(15 * 60 * 1000); 
  
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const blurTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Load configuration 
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const { value } = await apiService.getSessionTimeout();
        if (value && !isNaN(parseInt(value))) {
          const mins = Math.max(5, Math.min(60, parseInt(value)));
          setTimeoutDuration(mins * 60 * 1000);
        }
      } catch (error) {
        // Silently fail, use default 15 mins
        console.error('Failed to load session timeout config:', error);
      }
    };
    if (user) loadConfig();
  }, [user]);

  const handleLogout = useCallback(async () => {
    console.log('🔒 Security Auto-Logout triggered');
    
    sessionStorage.setItem('last_logout_reason', 'timeout');
    sessionStorage.setItem('logout_timestamp', new Date().toISOString());
    
    try {
      await signOut(auth);
      window.location.href = '/login';
    } catch (e) {
      console.error('Logout error:', e);
      window.location.reload(); // Force reload as fallback
    }
  }, []);

  const resetTimers = useCallback((broadcastNotification = true) => {
    if (!user) return;

    lastActivityRef.current = Date.now();
    
    if (broadcastNotification) {
      sessionChannel.postMessage({ type: 'ACTIVITY', timestamp: Date.now() });
    }

    setIsWarning(false);
    setIsBlurred(false);
    setCountdown(60);

    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    // Safety fallback for duration
    const duration = isNaN(timeoutDuration) || timeoutDuration <= 0 ? 15 * 60 * 1000 : timeoutDuration;

    // Timing calculations:
    // 1. Privacy Blur activates at 2/3 of the total time (but max 5 mins before warning)
    const blurDelay = Math.max(2 * 60 * 1000, duration - 5 * 60 * 1000);
    // 2. Warning Modal at Total Time - 60 seconds
    const warningDelay = Math.max(1 * 60 * 1000, duration - 60 * 1000);
    
    blurTimerRef.current = setTimeout(() => {
      setIsBlurred(true);
    }, blurDelay);

    timeoutTimerRef.current = setTimeout(() => {
      setIsWarning(true);
      startCountdown();
    }, warningDelay);
  }, [user, timeoutDuration]);

  const startCountdown = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(60);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current!);
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Activity Listeners
  useEffect(() => {
    if (!user) return;

    const activities = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const onActivity = () => {
      // Throttle reset to once every 1 second
      if (Date.now() - lastActivityRef.current > 1000) {
        resetTimers();
      }
    };

    activities.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    
    // Initial start
    resetTimers(false);

    // Listen for messages from other tabs
    const onMessage = (event: MessageEvent) => {
      if (event.data.type === 'ACTIVITY') {
        resetTimers(false);
      } else if (event.data.type === 'CONFIG_UPDATED' && event.data.key === 'SESSION_TIMEOUT_MINUTES') {
        const mins = Math.max(5, Math.min(60, parseInt(event.data.value)));
        if (!isNaN(mins)) {
          setTimeoutDuration(mins * 60 * 1000);
        }
      }
    };
    sessionChannel.addEventListener('message', onMessage);

    return () => {
      activities.forEach(e => window.removeEventListener(e, onActivity));
      sessionChannel.removeEventListener('message', onMessage);
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [user, resetTimers]);

  return (
    <div className="relative min-h-screen">
      {/* Main Content with conditional blurring - MUST NOT blur overlays! */}
      <div 
        className={cn(
          "min-h-screen transition-all duration-1000 will-change-[filter]",
          isBlurred && "blur-2xl grayscale brightness-50 select-none pointer-events-none"
        )}
      >
        {children}
      </div>
      
      {/* Privacy Overlay Message - MOVED OUTSIDE THE BLURRED DIV */}
      <AnimatePresence>
        {isBlurred && !isWarning && (
          <motion.div 
            key="privacy-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm cursor-pointer"
            onClick={() => resetTimers()}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white/10 dark:bg-slate-900/40 p-10 rounded-[3rem] shadow-2xl border border-white/20 flex flex-col items-center gap-6 text-center backdrop-blur-xl"
            >
              <div className="w-20 h-20 bg-indigo-500/20 rounded-3xl flex items-center justify-center animate-bounce border border-indigo-500/30">
                <Lock className="w-10 h-10 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Privacy Shield Aktív</h2>
                <p className="text-sm text-indigo-200/70 max-w-[240px] font-medium leading-relaxed">
                  Inaktivitás miatt elrejtettük az érzékeny adatokat. Kattints bárhová a feloldáshoz.
                </p>
              </div>
              <motion.div 
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="mt-4 px-6 py-2 bg-white/5 rounded-full border border-white/10 text-[10px] font-black text-white uppercase tracking-widest"
              >
                Biztonsági Figyelés Aktív
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Security Warning Modal - MOVED OUTSIDE THE BLURRED DIV */}
      <AnimatePresence>
        {isWarning && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-xl">
            <motion.div
              key="warning-modal"
              initial={{ opacity: 0, scale: 0.8, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 40 }}
              className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-[0_32px_64px_-12px_rgba(220,38,38,0.4)] border border-red-500/30 w-full max-w-md overflow-hidden pointer-events-auto"
            >
              <div className="p-10 text-center">
                <div className="relative w-28 h-28 mx-auto mb-8">
                  <div className="absolute inset-0 bg-red-100 dark:bg-red-900/30 rounded-full animate-ping opacity-30"></div>
                  <div className="relative w-28 h-28 bg-red-50 dark:bg-red-900/40 rounded-full flex items-center justify-center border-4 border-red-500/30">
                    <ShieldAlert className="w-14 h-14 text-red-600" />
                  </div>
                </div>

                <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4 uppercase tracking-tighter leading-tight">
                  Biztonsági <br/>Kijelentkezés
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-10 leading-relaxed font-medium">
                  Huzamosabb ideje nem észleltünk aktivitást. A védelem <span className="font-black text-red-600 dark:text-red-400 tabular-nums text-xl inline-block px-2 bg-red-50 dark:bg-red-900/20 rounded-lg">{countdown}</span> másodperc múlva élesedik.
                </p>

                <div className="space-y-4">
                  <Button 
                    variant="primary" 
                    className="w-full py-6 rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl shadow-indigo-200 dark:shadow-none hover:scale-[1.02] active:scale-[0.98] transition-all bg-indigo-600 border-none"
                    onClick={() => resetTimers()}
                  >
                    <RefreshCw className="w-4 h-4 mr-3" />
                    Aktív maradok
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full py-4 text-slate-400 hover:text-red-500 font-bold uppercase tracking-widest text-[11px] transition-colors"
                    onClick={handleLogout}
                  >
                    <LogOut className="w-4 h-4 mr-3" />
                    Kilépés azonnal
                  </Button>
                </div>

                <div className="mt-10 pt-8 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-3 text-[10px] text-slate-400 font-black uppercase tracking-widest">
                  <Lock className="w-3.5 h-3.5 text-indigo-500" />
                  Munkamenet védelem aktív
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
