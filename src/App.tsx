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
import ErrorBoundary from './components/ErrorBoundary';
import { OnboardingTour } from './components/OnBoardingTour';
import { logout } from './firebase';
import { Button } from './components/ui/Base';
import { Loader2, Lock } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import React, { useEffect } from 'react';

const AppContent: React.FC = () => {
  const { user, profile, loading, isSuspended, completeOnboarding } = useFirebase();

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
    <Layout>
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
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={profile?.role === 'admin' ? <AdminPanel /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
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

