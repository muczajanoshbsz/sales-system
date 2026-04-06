import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, TrendingUp, Brain, Search, LogOut, User, Map as MapIcon } from 'lucide-react';
import { Button } from './ui/Base';
import { useFirebase } from './FirebaseProvider';
import { logout } from '../firebase';
import { cn } from '../lib/utils';

const Navbar: React.FC = () => {
  const { profile } = useFirebase();

  const menuItems = [
    { id: 'dashboard', path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sales', path: '/sales', label: 'Eladások', icon: ShoppingCart },
    { id: 'inventory', path: '/inventory', label: 'Készlet', icon: Package },
    { id: 'procurement', path: '/procurement', label: 'Beszerzés', icon: TrendingUp },
    { id: 'ai', path: '/ai', label: 'AI Elemzés', icon: Brain },
    { id: 'map', path: '/map', label: 'Térkép', icon: MapIcon },
    { id: 'search', path: '/search', label: 'Keresés', icon: Search },
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
              <span className="text-xl font-bold text-slate-900 tracking-tight">AirPods Pro Manager</span>
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

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold text-slate-900">{profile?.displayName || profile?.email}</span>
              <span className="text-xs text-slate-500 capitalize">{profile?.role}</span>
            </div>
            <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
              <User className="w-4 h-4 text-slate-600" />
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="text-slate-500">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
