import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  TrendingUp,
  Brain,
  Search,
  LogOut,
  User,
  Map as MapIcon,
  Menu,
  X,
  Settings,
  Activity,
  MessageSquare,
  ShieldCheck,
  ChevronDown,
  Sparkles,
  Cpu,
  Database,
  Bell,
  FileText,
} from "lucide-react";
import { Button } from "./ui/Base";
import { useFirebase } from "./FirebaseProvider";
import { logout } from "../firebase";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { useLocation } from "react-router-dom";
import { NotificationCenter } from "./NotificationCenter";

const Navbar: React.FC = () => {
  const { profile, user, ghostMode, timeTravel } = useFirebase();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const mainItems = [
    { id: "dashboard", path: "/", label: "Dashboard", icon: LayoutDashboard },
    { id: "sales", path: "/sales", label: "Eladások", icon: ShoppingCart },
    { id: "inventory", path: "/inventory", label: "Készlet", icon: Package },
    {
      id: "procurement",
      path: "/procurement",
      label: "Beszerzés",
      icon: TrendingUp,
    },
  ];

  const toolItems = [
    { id: "reports", path: "/reports", label: "Hírlevél", icon: FileText },
    { id: "ai", path: "/ai", label: "AI Elemzés", icon: Brain },
    {
      id: "assistant",
      path: "/assistant",
      label: "Asszisztens",
      icon: MessageSquare,
    },
    {
      id: "calculator",
      path: "/calculator",
      label: "Számológép",
      icon: Sparkles,
    },
    { id: "map", path: "/map", label: "Térkép", icon: MapIcon },
    { id: "search", path: "/search", label: "Keresés", icon: Search },
  ];

  const systemItems = [
    { id: "audit", path: "/audit", label: "Napló", icon: Activity },
    { id: "settings", path: "/settings", label: "Beállítások", icon: Settings },
  ];

  if (profile?.role === "admin") {
    systemItems.push({
      id: "admin",
      path: "/admin",
      label: "Rendszerfelügyelet",
      icon: ShieldCheck,
    });
    systemItems.push({
      id: "backups",
      path: "/admin?tab=backups",
      label: "Mentés",
      icon: Database,
    });
  }

  const allItems = [...mainItems, ...toolItems, ...systemItems];

  const isDropdownActive = (items: any[]) => {
    return items.some((item) => location.pathname === item.path);
  };

  return (
    <nav
      className={cn(
        "bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky z-40 transition-all duration-300",
        ghostMode.isActive || timeTravel.isActive ? "top-12" : "top-0",
      )}
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-3 xl:gap-4">
          <div className="flex items-center gap-4 2xl:gap-8 min-w-0 flex-1">
            <NavLink to="/" className="shrink-0 flex items-center gap-3 group">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform duration-300">
                <Package className="text-white w-6 h-6" />
              </div>
              <span className="text-xl font-black text-slate-900 dark:text-white truncate hidden sm:inline tracking-tighter">
                AirPods Manager
              </span>
            </NavLink>

            <div className="hidden 2xl:flex items-center justify-center gap-2 2xl:gap-3 py-2 min-w-0 flex-1">
              <div className="flex items-center gap-1 2xl:gap-2 min-w-0 shrink-0">
                {mainItems.map((item) => (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    id={`nav-${item.id}`}
                    className={({ isActive }) =>
                      cn(
                        "px-3 2xl:px-4 py-2.5 rounded-xl text-[10px] 2xl:text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 2xl:gap-2.5 shrink-0 border border-transparent whitespace-nowrap",
                        isActive
                          ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xl shadow-slate-200 dark:shadow-none"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900",
                      )
                    }
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span className="hidden 2xl:inline">{item.label}</span>
                  </NavLink>
                ))}
              </div>

              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1 2xl:mx-2 opacity-50 shrink-0" />

              <div className="flex items-center gap-2 ml-1 2xl:ml-2 shrink-0">
                {/* Tools Dropdown */}
                <div
                  className="relative shrink-0"
                  onMouseEnter={() => setOpenDropdown("tools")}
                  onMouseLeave={() => setOpenDropdown(null)}
                >
                  <button
                    id="nav-tools-dropdown"
                    className={cn(
                      "px-3 2xl:px-4 py-2.5 rounded-xl text-[10px] 2xl:text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 2xl:gap-2.5 shrink-0 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-900/30 whitespace-nowrap",
                      isDropdownActive(toolItems)
                        ? "text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-500/20"
                        : "text-indigo-600/70 dark:text-indigo-400/70 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/20",
                    )}
                  >
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span className="hidden 2xl:inline">AI Eszközök</span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 transition-transform duration-300",
                        openDropdown === "tools" && "rotate-180",
                      )}
                    />
                  </button>

                  <AnimatePresence>
                    {openDropdown === "tools" && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 py-3 z-[60] overflow-hidden"
                      >
                        {toolItems.map((item) => (
                          <NavLink
                            key={item.id}
                            to={item.path}
                            className={({ isActive }) =>
                              cn(
                                "flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-widest transition-colors",
                                isActive
                                  ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
                                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400",
                              )
                            }
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
                  className="relative shrink-0"
                  onMouseEnter={() => setOpenDropdown("system")}
                  onMouseLeave={() => setOpenDropdown(null)}
                >
                  <button
                    className={cn(
                      "px-3 2xl:px-4 py-2.5 rounded-xl text-[10px] 2xl:text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 2xl:gap-2.5 shrink-0 bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 whitespace-nowrap",
                      isDropdownActive(systemItems)
                        ? "text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-500/20"
                        : "text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800",
                    )}
                  >
                    <Cpu className="w-4 h-4 shrink-0" />
                    <span className="hidden 2xl:inline">Rendszer</span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 transition-transform duration-300",
                        openDropdown === "system" && "rotate-180",
                      )}
                    />
                  </button>

                  <AnimatePresence>
                    {openDropdown === "system" && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 py-3 z-[60] overflow-hidden"
                      >
                        {systemItems.map((item) => (
                          <NavLink
                            key={item.id}
                            to={item.path}
                            className={({ isActive }) =>
                              cn(
                                "flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-widest transition-colors",
                                isActive
                                  ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
                                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400",
                              )
                            }
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
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2">
            <NotificationCenter />

            <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 hidden xl:block" />

            <div className="hidden xl:flex items-center gap-3 2xl:gap-4 group cursor-pointer shrink-0 min-w-0">
              <div className="flex flex-col items-end hidden 2xl:flex">
                <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight truncate max-w-[120px] whitespace-nowrap">
                  {profile?.displayName ||
                    profile?.email ||
                    user?.displayName ||
                    user?.email ||
                    "Felhasználó"}
                </span>
                <span className="text-[9px] text-indigo-500 font-black uppercase tracking-widest leading-none">
                  {profile?.role || "Betöltés..."}
                </span>
              </div>
              <div className="relative group-hover:scale-105 transition-transform shrink-0">
                <div className="h-10 w-10 rounded-2xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center border border-slate-200 dark:border-slate-800 shadow-sm group-hover:border-indigo-200 dark:group-hover:border-indigo-900/50">
                  <User className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-950 rounded-full" />
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="hidden xl:flex text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all h-10 w-10 p-0 shrink-0"
            >
              <LogOut className="w-5 h-5" />
            </Button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="2xl:hidden p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="2xl:hidden bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 overflow-hidden"
          >
            <div className="px-4 py-4 space-y-1">
              <div className="px-4 py-3 mb-2 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                    <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    Értesítések
                  </span>
                </div>
                <NotificationCenter />
              </div>
              {allItems.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "px-4 py-3 rounded-xl text-base font-bold transition-all flex items-center gap-3",
                      isActive
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={cn(
                          "w-5 h-5",
                          isActive ? "text-white" : "text-slate-400",
                        )}
                      />
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
                      {profile?.displayName ||
                        profile?.email ||
                        user?.displayName ||
                        user?.email ||
                        "Felhasználó"}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">
                      {profile?.role || "Betöltés..."}
                    </p>
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
