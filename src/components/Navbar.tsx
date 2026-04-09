import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, TrendingUp, Brain, Search, LogOut, User, Map as MapIcon, Menu, X, Settings, Activity, MessageSquare, ShieldCheck } from 'lucide-react';
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
    { id: 'assistant', path: '/assistant', label: 'Asszisztens', icon: MessageSquare },
    { id: 'map', path: '/map', label: 'Térkép', icon: MapIcon },
    { id: 'search', path: '/search', label: 'Keresés', icon: Search },
    { id: 'audit', path: '/audit', label: 'Napló', icon: Activity },
    { id: 'settings', path: '/settings', label: 'Beállítások', icon: Settings },
  ];

  if (profile?.role === 'admin') {
    menuItems.push({ id: 'admin', path: '/admin', label: 'Rendszerfelügyelet', icon: ShieldCheck });
  }

  return (
    <nav className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          <div className="flex items-center gap-4 xl:gap-8 min-w-0 flex-1 mr-4">
            <NavLink to="/" className="flex-shrink-0 flex items-center gap-3 group">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform duration-300">
                <Package className="text-white w-6 h-6" />
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-white truncate hidden sm:inline">
                AirPods Manager
              </span>
            </NavLink>
            
            <div className="hidden md:flex items-center gap-0.5 xl:gap-1 overflow-x-auto no-scrollbar py-2 flex-1 min-w-0 mask-fade-right">
              {menuItems.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  className={({ isActive }) => cn(
                    "px-1.5 xl:px-3 py-2 rounded-xl text-[10px] xl:text-[11px] font-bold uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 shrink-0",
                    isActive 
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md" 
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
                  )}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0 ml-4">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase truncate max-w-[120px]">{profile?.displayName || profile?.email}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{profile?.role}</span>
            </div>
            <div className="hidden md:flex h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-900 items-center justify-center border border-slate-200/60 dark:border-slate-800 shadow-inner">
              <User className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="hidden md:flex text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-xl transition-all">
              <LogOut className="w-5 h-5" />
            </Button>
            
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
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
            className="md:hidden bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 overflow-hidden"
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
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"
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
              
              <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3 px-4 py-2 mb-4">
                  <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{profile?.displayName || profile?.email}</p>
                    <p className="text-xs text-slate-500 capitalize">{profile?.role}</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  onClick={logout} 
                  className="w-full justify-start text-red-500 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 font-bold gap-3"
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
