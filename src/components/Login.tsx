import React, { useState } from 'react';
import { signInWithGoogle, createUserWithEmailAndPassword, signInWithEmailAndPassword, auth, updateProfile } from '../firebase';
import { Button, Card, Input } from './ui/Base';
import { Package, LogIn, Mail, Lock, UserPlus, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from './ToastContext';

const Login: React.FC = () => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });
        showToast('Sikeres regisztráció! Üdvözöljük a rendszerben.', 'success');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Sikeres belépés! Üdvözöljük újra.', 'success');
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      let message = error.message;
      if (error.code === 'auth/unauthorized-domain') {
        message = 'Ez a tartomány nincs engedélyezve a Firebase konzolban. Kérjük, adja hozzá a következő címet az "Authorized domains" listához: ' + window.location.hostname;
      } else if (error.code === 'auth/operation-not-allowed') {
        message = 'A választott bejelentkezési mód nincs engedélyezve a Firebase konzolban.';
      }
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      showToast('Sikeres belépés Google fiókkal!', 'success');
    } catch (error: any) {
      console.error('Google Auth error:', error);
      let message = error.message;
      if (error.code === 'auth/unauthorized-domain') {
        message = 'Ez a tartomány nincs engedélyezve a Firebase konzolban. Kérjük, adja hozzá a következő címet az "Authorized domains" listához: ' + window.location.hostname;
      }
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="p-8 space-y-8 shadow-2xl shadow-slate-200 dark:shadow-none border-slate-200 dark:border-slate-800">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-200 dark:shadow-none">
              <Package className="text-white w-10 h-10" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">AirPods Pro Manager</h1>
            <p className="text-slate-500 dark:text-slate-400">Professzionális készlet és eladás kezelő rendszer</p>
          </div>

          <div className="space-y-6">
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                onClick={() => setIsRegistering(false)}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${!isRegistering ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Belépés
              </button>
              <button
                onClick={() => setIsRegistering(true)}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${isRegistering ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Regisztráció
              </button>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-4">
              <AnimatePresence mode="wait">
                {isRegistering && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-1"
                  >
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Név</label>
                    <div className="relative">
                      <LogIn className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        type="text"
                        placeholder="Teljes név"
                        className="pl-10"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        required={isRegistering}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="pelda@email.hu"
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Jelszó</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    className="pl-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full h-12 text-lg font-bold" isLoading={loading}>
                {isRegistering ? <UserPlus className="w-5 h-5 mr-2" /> : <LogIn className="w-5 h-5 mr-2" />}
                {isRegistering ? 'Fiók létrehozása' : 'Belépés'}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-slate-900 px-2 text-slate-500 font-bold">Vagy</span>
              </div>
            </div>

            <Button 
              variant="outline"
              onClick={handleGoogleSignIn} 
              className="w-full h-12 text-base font-bold border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              isLoading={loading}
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 mr-3" alt="Google" />
              Belépés Google fiókkal
            </Button>
          </div>

          <div className="pt-6 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-4">
            <Feature icon="🤖" label="AI Árazás" />
            <Feature icon="📊" label="Analitika" />
            <Feature icon="📦" label="Készlet" />
          </div>
        </Card>
      </motion.div>
    </div>
  );
};

const Feature: React.FC<{ icon: string; label: string }> = ({ icon, label }) => (
  <div className="space-y-1 text-center">
    <div className="text-xl">{icon}</div>
    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
  </div>
);

export default Login;
