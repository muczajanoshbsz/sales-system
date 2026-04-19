import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, TrendingUp, Brain, Search, LogOut, User, Map as MapIcon, Menu, X, Settings, Activity, MessageSquare, ShieldCheck, ChevronDown, Sparkles, Cpu, Database, Bell } from 'lucide-react';
import { Button } from './ui/Base';
import { useFirebase } from './FirebaseProvider';
import { logout } from '../firebase';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { NotificationCenter } from './NotificationCenter';

const Navbar: React.FC = () => {
  const { profile, user, ghostMode, timeTravel } = useFirebase();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const mainItems = [
    { id: 'dashboard', path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sales', path: '/sales', label: 'Eladások', icon: ShoppingCart },
    { id: 'inventory', path: '/inventory', label: 'Készlet', icon: Package },
    { id: 'procurement', path: '/procurement', label: 'Beszerzés', icon: TrendingUp },
  ];

  const toolItems = [
    { id: 'ai', path: '/ai', label: 'AI Elemzés', icon: Brain },
    { id: 'assistant', path: '/assistant', label: 'Asszisztens', icon: MessageSquare },
    { id: 'calculator', path: '/calculator', label: 'Számológép', icon: Sparkles },
    { id: 'map', path: '/map', label: 'Térkép', icon: MapIcon },
    { id: 'search', path: '/search', label: 'Keresés', icon: Search },
  ];

  const systemItems = [
    { id: 'audit', path: '/audit', label: 'Napló', icon: Activity },
    { id: 'settings', path: '/settings', label: 'Beállítások', icon: Settings },
  ];

  if (profile?.role === 'admin') {
    systemItems.push({ id: 'admin', path: '/admin', label: 'Rendszerfelügyelet', icon: ShieldCheck });
    systemItems.push({ id: 'backups', path: '/admin?tab=backups', label: 'Mentés', icon: Database });
  }

  const allItems = [...mainItems, ...toolItems, ...systemItems];

  const isDropdownActive = (items: any[]) => {
    return items.some(item => location.pathname === item.path);
  };

  return (
    <nav className={cn(
      "bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky z-40 transition-all duration-300",
      (ghostMode.isActive || timeTravel.isActive) ? "top-12" : "top-0"
    )}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          <div className="flex items-center gap-4 xl:gap-8 min-w-0 flex-1">
            <NavLink to="/" className="flex-shrink-0 flex items-center gap-3 group">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform duration-300">
                <Package className="text-white w-6 h-6" />
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-white truncate hidden sm:inline">
                AirPods Manager
              </span>
            </NavLink>
            
            <div className="hidden md:flex items-center gap-0.5 xl:gap-1 py-2 min-w-0">
              {mainItems.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  id={`nav-${item.id}`}
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

              {/* Tools Dropdown */}
              <div 
                className="relative"
                onMouseEnter={() => setOpenDropdown('tools')}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                <button
                  id="nav-tools-dropdown"
                  className={cn(
                    "px-1.5 xl:px-3 py-2 rounded-xl text-[10px] xl:text-[11px] font-bold uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 shrink-0",
                    isDropdownActive(toolItems)
                      ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Eszközök</span>
                  <ChevronDown className={cn("w-3 h-3 transition-transform", openDropdown === 'tools' && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {openDropdown === 'tools' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-2 z-50"
                    >
                      {toolItems.map((item) => (
                        <NavLink
                          key={item.id}
                          to={item.path}
                          id={`nav-${item.id}`}
                          className={({ isActive }) => cn(
                            "px-4 py-2 text-[11px] font-bold uppercase tracking-wider flex items-center gap-3 transition-colors",
                            isActive 
                              ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20" 
                              : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                          )}
                        >
                          <item.icon className="w-4 h-4" />
                          {item.label}
                        </NavLink>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* System Dropdown */}
              <div 
                className="relative"
                onMouseEnter={() => setOpenDropdown('system')}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                <button
                  className={cn(
                    "px-1.5 xl:px-3 py-2 rounded-xl text-[10px] xl:text-[11px] font-bold uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 shrink-0",
                    isDropdownActive(systemItems)
                      ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
                  )}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Rendszer</span>
                  <ChevronDown className={cn("w-3 h-3 transition-transform", openDropdown === 'system' && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {openDropdown === 'system' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full right-0 mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-2 z-50"
                    >
                      {systemItems.map((item) => (
                        <NavLink
                          key={item.id}
                          to={item.path}
                          className={({ isActive }) => cn(
                            "px-4 py-2 text-[11px] font-bold uppercase tracking-wider flex items-center gap-3 transition-colors",
                            isActive 
                              ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20" 
                              : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                          )}
                        >
                          <item.icon className="w-4 h-4" />
                          {item.label}
                        </NavLink>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-8">
            <NotificationCenter />
            <div className="hidden md:flex flex-col items-end">
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase truncate max-w-[120px]">
                {profile?.displayName || profile?.email || user?.displayName || user?.email || 'Felhasználó'}
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{profile?.role || 'Betöltés...'}</span>
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
              <div className="px-4 py-3 mb-2 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                    <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Értesítések</span>
                </div>
                <NotificationCenter />
              </div>
              {allItems.map((item) => (
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
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {profile?.displayName || profile?.email || user?.displayName || user?.email || 'Felhasználó'}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">{profile?.role || 'Betöltés...'}</p>
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
