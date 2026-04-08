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
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('🔐 Auth state changed:', firebaseUser?.email);
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          console.log('🔄 Syncing user with backend...');
          // Sync with backend and get profile (including role)
          const syncedProfile = await apiService.syncUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email!,
            displayName: firebaseUser.displayName || undefined
          });
          console.log('✅ User synced successfully:', syncedProfile.role);
          setProfile(syncedProfile);
        } catch (error) {
          console.error('❌ Error syncing user:', error);
          // Fallback profile if sync fails
          setProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email!,
            role: 'client',
            displayName: firebaseUser.displayName || undefined
          });
        }
      } else {
        console.log('👋 User logged out');
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
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
