import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../firebase';
import { UserProfile } from '../types';
import { apiService } from '../services/apiService';

interface FirebaseContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSuspended: boolean;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    const handleSuspended = () => {
      console.log('🚫 User suspended event received');
      setIsSuspended(true);
      setProfile(null);
    };

    window.addEventListener('user-suspended', handleSuspended);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('🔐 Auth state changed:', firebaseUser?.email);
      setLoading(true);
      setIsSuspended(false);
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          console.log('🔄 Syncing user with backend...');
          const syncedProfile = await apiService.syncUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email!,
            displayName: firebaseUser.displayName || undefined
          });
          console.log('✅ User synced successfully:', syncedProfile.role);
          if (syncedProfile.is_suspended) {
            setIsSuspended(true);
            setProfile(null);
          } else {
            setProfile(syncedProfile);
          }
        } catch (error: any) {
          console.error('❌ Error syncing user:', error);
          
          if (error.message === 'Account suspended') {
            setIsSuspended(true);
            setProfile(null);
          } else {
            // Fallback profile for other errors
            setProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email!,
              role: 'client',
              displayName: firebaseUser.displayName || undefined
            });
          }
        }
      } else {
        console.log('👋 User logged out');
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      window.removeEventListener('user-suspended', handleSuspended);
    };
  }, []);

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    isSuspended,
  };

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
