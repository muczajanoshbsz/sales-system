import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, CheckCircle2, Sparkles, LayoutDashboard, Package, Bot, ArrowRight, ShoppingCart, TrendingUp, Settings, MessageSquare } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Button } from './ui/Base';
import { useNavigate, useLocation } from 'react-router-dom';

interface Step {
  id: string;
  targetId: string;
  title: string;
  content: string;
  icon: React.ReactNode;
  path: string;
}

interface OnboardingTourProps {
  userName: string;
  onComplete: () => void;
}

const steps: Step[] = [
  {
    id: 'dashboard',
    targetId: 'dashboard-main',
    title: 'A Dashboard',
    content: 'Itt látod a birodalmadat. A grafikonok és statisztikák valós időben mutatják az üzleted állapotát.',
    icon: <LayoutDashboard className="w-5 h-5" />,
    path: '/',
  },
  {
    id: 'sales',
    targetId: 'nav-sales',
    title: 'Eladások Kezelése',
    content: 'Minden tranzakciód itt szerepel. Átlátható, kereshető és bármikor rögzíthetsz új eladást.',
    icon: <ShoppingCart className="w-5 h-5" />,
    path: '/sales',
  },
  {
    id: 'inventory',
    targetId: 'nav-inventory',
    title: 'Készlet és Raktár',
    content: 'Figyeld a színeket! A sárga és piros jelzések szólnak, ha fogytán az áru. Itt töltheted fel az új készletet.',
    icon: <Package className="w-5 h-5" />,
    path: '/inventory',
  },
  {
    id: 'procurement',
    targetId: 'nav-procurement',
    title: 'Beszerzési Trendek',
    content: 'Kövesd nyomon, mikor és mennyiért szerezted be az árut, hogy optimalizálhasd a profitodat.',
    icon: <TrendingUp className="w-5 h-5" />,
    path: '/procurement',
  },
  {
    id: 'ai',
    targetId: 'nav-ai',
    title: 'AI Asszisztens',
    content: 'Ő a titkos fegyvered. Kérdezz tőle bármit a profitodról vagy kérj tőle üzleti tanácsokat.',
    icon: <Bot className="w-5 h-5" />,
    path: '/ai',
  },
  {
    id: 'assistant',
    targetId: 'nav-assistant',
    title: 'Személyes Segítő',
    content: 'Bármilyen kérdésed van a rendszer használatával kapcsolatban, itt azonnal választ kapsz.',
    icon: <MessageSquare className="w-5 h-5" />,
    path: '/assistant',
  },
  {
    id: 'settings',
    targetId: 'nav-settings',
    title: 'Testreszabás',
    content: 'Szabd saját igényeidre a rendszert! Itt állíthatod be a valutát, az értesítéseket vagy a sötét módot.',
    icon: <Settings className="w-5 h-5" />,
    path: '/settings',
  },
];

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ userName, onComplete }) => {
  const [currentStep, setCurrentStep] = useState<-1 | number>(-1); // -1 is welcome splash
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const updateSpotlight = useCallback(() => {
    if (currentStep >= 0 && currentStep < steps.length) {
      const step = steps[currentStep];
      
      // Special case for dropdown items: try to find the link, if not found, target the dropdown button
      let element = document.getElementById(step.targetId);
      
      if (!element) {
        // Check if it's in the tools dropdown
        const toolsDropdownIds = ['nav-ai', 'nav-assistant', 'nav-map', 'nav-search'];
        if (toolsDropdownIds.includes(step.targetId)) {
          element = document.getElementById('nav-tools-dropdown');
        }
      }

      if (element) {
        setSpotlightRect(element.getBoundingClientRect());
      }
    } else {
      setSpotlightRect(null);
    }
  }, [currentStep]);

  // Handle navigation when step changes
  useEffect(() => {
    if (currentStep >= 0 && currentStep < steps.length) {
      const step = steps[currentStep];
      if (location.pathname !== step.path) {
        navigate(step.path);
        // Reset spotlight while navigating
        setSpotlightRect(null);
      }
    }
  }, [currentStep, navigate, location.pathname]);

  // Update spotlight when location or step changes
  useEffect(() => {
    if (currentStep >= 0 && currentStep < steps.length) {
      const step = steps[currentStep];
      
      // Wait for navigation and rendering
      const timer = setTimeout(() => {
        let element = document.getElementById(step.targetId);
        
        // Fallback for dropdowns
        if (!element) {
          const toolsDropdownIds = ['nav-ai', 'nav-assistant', 'nav-map', 'nav-search'];
          if (toolsDropdownIds.includes(step.targetId)) {
            element = document.getElementById('nav-tools-dropdown');
          }
        }

        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Final spotlight update after scroll
          setTimeout(updateSpotlight, 300);
        }
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [currentStep, location.pathname, updateSpotlight]);

  useEffect(() => {
    updateSpotlight();
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight);
    return () => {
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight);
    };
  }, [updateSpotlight]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      finishTour();
    }
  };

  const skipTour = () => {
    onComplete();
  };

  const finishTour = () => {
    setIsFinished(true);
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#4f46e5', '#818cf8', '#c7d2fe']
    });
    setTimeout(() => {
      onComplete();
    }, 3000);
  };

  // Calculate card position
  const getCardStyle = () => {
    if (!spotlightRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    const cardWidth = 320;
    const cardHeight = 220; // estimated
    const margin = 24;

    let top = spotlightRect.bottom + margin;
    let left = spotlightRect.left + spotlightRect.width / 2 - cardWidth / 2;

    // Adjust if off-screen bottom
    if (top + cardHeight > window.innerHeight) {
      top = spotlightRect.top - cardHeight - margin;
    }

    // Adjust if off-screen top
    if (top < margin) {
      top = margin;
    }

    // Adjust if off-screen left/right
    left = Math.max(margin, Math.min(window.innerWidth - cardWidth - margin, left));

    return { top, left, transform: 'none' };
  };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {/* Overlay with Spotlight */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-[3px] pointer-events-auto"
        onClick={skipTour}
        style={{
          maskImage: spotlightRect 
            ? `radial-gradient(circle ${Math.max(spotlightRect.width, spotlightRect.height) / 2 + 15}px at ${spotlightRect.left + spotlightRect.width / 2}px ${spotlightRect.top + spotlightRect.height / 2}px, transparent 99%, black 100%)`
            : 'none',
          WebkitMaskImage: spotlightRect 
            ? `radial-gradient(circle ${Math.max(spotlightRect.width, spotlightRect.height) / 2 + 15}px at ${spotlightRect.left + spotlightRect.width / 2}px ${spotlightRect.top + spotlightRect.height / 2}px, transparent 99%, black 100%)`
            : 'none',
        }}
      />

      <AnimatePresence mode="wait">
        {currentStep === -1 && !isFinished && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 pointer-events-auto relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
              
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Sparkles className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-3">
                Üdvözlünk a csapatban, <span className="text-indigo-600 dark:text-indigo-400">{userName}</span>!
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-center mb-8 leading-relaxed">
                Készen állsz, hogy profi szinten kezeld a készletet? Hadd mutassuk meg a legfontosabb funkciókat egy interaktív túra keretében.
              </p>
              
              <div className="flex flex-col gap-3">
                <Button 
                  onClick={() => setCurrentStep(0)}
                  className="w-full h-12 text-lg font-semibold group relative overflow-hidden"
                >
                  <motion.div
                    animate={{ scale: [1, 1.02, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="flex items-center justify-center gap-2"
                  >
                    Indítsuk el a túrát
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </motion.div>
                </Button>
                <button 
                  onClick={skipTour}
                  className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors py-2"
                >
                  Kihagyom a túrát
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {currentStep >= 0 && currentStep < steps.length && !isFinished && (
          <motion.div
            key={steps[currentStep].id}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            className="absolute pointer-events-none"
            style={getCardStyle()}
          >
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-[320px] shadow-2xl border border-indigo-200 dark:border-indigo-900/50 pointer-events-auto relative">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                  {steps[currentStep].icon}
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">
                  {steps[currentStep].title}
                </h3>
              </div>
              
              <div className="min-h-[60px]">
                <motion.p 
                  key={steps[currentStep].content}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6"
                >
                  {steps[currentStep].content}
                </motion.p>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {steps.map((_, i) => (
                    <div 
                      key={i}
                      className={`h-1 rounded-full transition-all duration-300 ${
                        i === currentStep ? 'w-4 bg-indigo-600' : 'w-1 bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    size="sm"
                    variant="ghost"
                    onClick={skipTour}
                    className="text-xs text-slate-400"
                  >
                    Kihagyás
                  </Button>
                  <Button 
                    size="sm"
                    onClick={handleNext}
                    className="gap-2"
                  >
                    {currentStep === steps.length - 1 ? 'Befejezés' : 'Következő'}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {isFinished && (
          <motion.div
            key="finished"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 max-w-sm w-full shadow-2xl border border-green-200 dark:border-green-900/30 text-center pointer-events-auto">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.2 }}
                className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6 mx-auto"
              >
                <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
              </motion.div>
              
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Készen állsz!</h2>
              <p className="text-slate-500 dark:text-slate-400">
                Sikeresen elvégezted a teljes körutat. Most már minden eszközöd megvan a sikerhez!
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
