import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, TrendingUp, Brain, Search, LogOut, User, Map as MapIcon, Menu, X, Settings, Activity } from 'lucide-react';
import { Button } from './ui/Base';
import { useFirebase } from './FirebaseProvider';
import { logout } from '../firebase';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const Navbar: React.FC = () => {
  const { profile } = useFirebase();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sales', path: '/sales', label: 'Eladások', icon: ShoppingCart },
    { id: 'inventory', path: '/inventory', label: 'Készlet', icon: Package },
    { id: 'procurement', path: '/procurement', label: 'Beszerzés', icon: TrendingUp },
    { id: 'ai', path: '/ai', label: 'AI Elemzés', icon: Brain },
    { id: 'map', path: '/map', label: 'Térkép', icon: MapIcon },
    { id: 'search', path: '/search', label: 'Keresés', icon: Search },
    { id: 'audit', path: '/audit', label: 'Napló', icon: Activity },
    { id: 'settings', path: '/settings', label: 'Beállítások', icon: Settings },
  ];

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-8">
            <NavLink to="/" className="flex-shrink-0 flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Package className="text-white w-5 h-5" />
              </div>
              <span className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate max-w-[150px] sm:max-w-none">
                AirPods Manager
              </span>
            </NavLink>
            
            <div className="hidden md:flex items-center gap-1">
              {menuItems.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  className={({ isActive }) => cn(
                    "px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                    isActive 
                      ? "bg-indigo-50 text-indigo-700" 
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold text-slate-900">{profile?.displayName || profile?.email}</span>
              <span className="text-xs text-slate-500 capitalize">{profile?.role}</span>
            </div>
            <div className="hidden sm:flex h-8 w-8 rounded-full bg-slate-100 items-center justify-center border border-slate-200">
              <User className="w-4 h-4 text-slate-600" />
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="hidden sm:flex text-slate-500">
              <LogOut className="w-4 h-4" />
            </Button>
            
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-t border-slate-100 overflow-hidden"
          >
            <div className="px-4 py-4 space-y-1">
              {menuItems.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) => cn(
                    "px-4 py-3 rounded-xl text-base font-bold transition-all flex items-center gap-3",
                    isActive 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" 
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={cn("w-5 h-5", isActive ? "text-white" : "text-slate-400")} />
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
              
              <div className="pt-4 mt-4 border-t border-slate-100">
                <div className="flex items-center gap-3 px-4 py-2 mb-4">
                  <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{profile?.displayName || profile?.email}</p>
                    <p className="text-xs text-slate-500 capitalize">{profile?.role}</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  onClick={logout} 
                  className="w-full justify-start text-red-500 hover:bg-red-50 hover:text-red-600 font-bold gap-3"
                >
                  <LogOut className="w-5 h-5" />
                  Kijelentkezés
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
