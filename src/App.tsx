/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { FirebaseProvider, useFirebase } from './components/FirebaseProvider';
import { ToastProvider } from './components/ToastContext';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import SalesManager from './components/SalesManager';
import InventoryManager from './components/InventoryManager';
import ProcurementManager from './components/ProcurementManager';
import AIDashboard from './components/AIDashboard';
import BusinessAssistant from './components/BusinessAssistant';
import SearchAnalytics from './components/SearchAnalytics';
import SalesMap from './components/SalesMap';
import Settings from './components/Settings';
import AuditLogs from './components/AuditLogs';
import AdminPanel from './components/AdminPanel';
import Login from './components/Login';
import Calculator from './components/Calculator';
import ErrorBoundary from './components/ErrorBoundary';
import { OnboardingTour } from './components/OnBoardingtour.tsx';
import { GhostBar } from './components/GhostBar';
import { TimeTravelBar } from './components/TimeTravelBar';
import { SessionMonitor } from './components/SessionMonitor.tsx';
import { logout } from './firebase';
import { Ghost } from 'lucide-react';
import { Button } from './components/ui/Base';
import { Loader2, Lock } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from './lib/utils';
import React, { useEffect } from 'react';

const AppContent: React.FC = () => {
  const { user, profile, loading, isSuspended, completeOnboarding, ghostMode, timeTravel } = useFirebase();
  const [showTeleport, setShowTeleport] = React.useState(false);

  React.useEffect(() => {
    if (ghostMode.isActive && !sessionStorage.getItem('ghost_teleported')) {
      setShowTeleport(true);
      sessionStorage.setItem('ghost_teleported', 'true');
      const timer = setTimeout(() => setShowTeleport(false), 1500);
      return () => clearTimeout(timer);
    }
    
    if (!ghostMode.isActive) {
      sessionStorage.removeItem('ghost_teleported');
    }
  }, [ghostMode.isActive]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('🔥 Global Error:', event.error);
    };
    window.addEventListener('error', handleError);
    
    const applySettings = () => {
      const saved = localStorage.getItem('app_settings');
      let theme = 'system';
      let compactMode = false;

      if (saved) {
        const settings = JSON.parse(saved);
        theme = settings.theme || 'system';
        compactMode = settings.compactMode || false;
      }

      // Theme logic
      const root = document.documentElement;
      if (theme === 'dark') {
        root.classList.add('dark');
      } else if (theme === 'light') {
        root.classList.remove('dark');
      } else {
        // System
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.toggle('dark', isDark);
      }

      // Compact Mode
      if (compactMode) {
        document.body.classList.add('compact-mode');
      } else {
        document.body.classList.remove('compact-mode');
      }
    };

    applySettings();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      const saved = localStorage.getItem('app_settings');
      const theme = saved ? JSON.parse(saved).theme : 'system';
      if (theme === 'system') {
        applySettings();
      }
    };
    mediaQuery.addEventListener('change', handleSystemThemeChange);

    window.addEventListener('storage', applySettings);
    window.addEventListener('settings-updated', applySettings);
    
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('storage', applySettings);
      window.removeEventListener('settings-updated', applySettings);
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-4 transition-colors duration-300">
        <Loader2 className="w-10 h-10 text-indigo-600 dark:text-indigo-400 animate-spin" />
        <p className="text-slate-500 dark:text-slate-400 font-medium animate-pulse">Rendszer betöltése...</p>
      </div>
    );
  }

  if (isSuspended) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
          <Lock className="w-10 h-10 text-red-600 dark:text-red-400" />
        </div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Fiók felfüggesztve</h1>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8">
          Sajnáljuk, de a fiókodat adminisztrátori döntés alapján felfüggesztettük. 
          Ha úgy gondolod, hogy ez hiba, vedd fel a kapcsolatot a rendszergazdával.
        </p>
        <Button onClick={() => logout()} variant="outline">
          Kijelentkezés
        </Button>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <SessionMonitor>
      <div className={cn(
        "min-h-screen transition-all duration-500",
        (ghostMode.isActive || timeTravel.isActive) && "ring-4 ring-indigo-500/30 ring-inset pt-12"
      )}>
        <AnimatePresence>
          {showTeleport && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10001] bg-indigo-950 flex flex-col items-center justify-center overflow-hidden"
            >
              <motion.div
                animate={{ 
                  scale: [1, 2, 1],
                  rotate: [0, 180, 360],
                  opacity: [0.1, 0.3, 0.1]
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute w-[800px] h-[800px] bg-indigo-500/20 rounded-full blur-[120px]"
              />
              
              <div className="relative flex flex-col items-center gap-8">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 12 }}
                  className="w-24 h-24 bg-indigo-500/20 rounded-3xl border border-indigo-500/30 flex items-center justify-center backdrop-blur-xl"
                >
                  <Ghost className="w-12 h-12 text-indigo-400 animate-pulse" />
                </motion.div>
                
                <div className="flex flex-col items-center gap-2">
                  <motion.h2 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-4xl font-black text-white tracking-tighter italic"
                  >
                    TELEPORTÁLÁS...
                  </motion.h2>
                  <motion.p
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-indigo-400 font-bold uppercase tracking-[0.3em] text-xs"
                  >
                    Szellem Mód Aktiválása
                  </motion.p>
                </div>
              </div>

              {/* Scanning line effect */}
              <motion.div 
                animate={{ y: ['-100%', '200%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent blur-sm"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <GhostBar />
        <TimeTravelBar />
        <Layout>
          {(ghostMode.isActive || timeTravel.isActive) && (
            <div className="fixed inset-0 pointer-events-none z-[9999] bg-indigo-500/5 mix-blend-overlay" />
          )}
          <AnimatePresence>
          {profile && !profile.has_seen_onboarding && (
            <OnboardingTour 
              userName={profile.displayName || profile.email.split('@')[0]} 
              onComplete={completeOnboarding}
            />
          )}
        </AnimatePresence>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sales" element={<SalesManager />} />
          <Route path="/inventory" element={<InventoryManager />} />
          <Route path="/procurement" element={<ProcurementManager />} />
          <Route path="/ai" element={<ErrorBoundary><AIDashboard /></ErrorBoundary>} />
          <Route path="/assistant" element={<BusinessAssistant />} />
          <Route path="/map" element={<SalesMap />} />
          <Route path="/search" element={<SearchAnalytics />} />
          <Route path="/audit" element={<AuditLogs />} />
          <Route path="/calculator" element={<Calculator />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={profile?.role === 'admin' ? <AdminPanel /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      </div>
    </SessionMonitor>
  );
};

export default function App() {
  return (
    <FirebaseProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </ToastProvider>
    </FirebaseProvider>
  );
}

