/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { FirebaseProvider, useFirebase } from './components/FirebaseProvider';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import SalesManager from './components/SalesManager';
import InventoryManager from './components/InventoryManager';
import ProcurementManager from './components/ProcurementManager';
import AIDashboard from './components/AIDashboard';
import SearchAnalytics from './components/SearchAnalytics';
import SalesMap from './components/SalesMap';
import DataManagement from './components/DataManagement';
import Login from './components/Login';
import { Loader2 } from 'lucide-react';

const AppContent: React.FC = () => {
  const { user, loading } = useFirebase();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        <p className="text-slate-500 font-medium animate-pulse">Rendszer betöltése...</p>
      </div>
    );
  }

  // if (!user) {
  //   return <Login />;
  // }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sales" element={<SalesManager />} />
          <Route path="/inventory" element={<InventoryManager />} />
          <Route path="/procurement" element={<ProcurementManager />} />
          <Route path="/ai" element={<AIDashboard />} />
          <Route path="/map" element={<SalesMap />} />
          <Route path="/search" element={<SearchAnalytics />} />
          <Route path="/data" element={<DataManagement />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default function App() {
  return (
    <FirebaseProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </FirebaseProvider>
  );
}

