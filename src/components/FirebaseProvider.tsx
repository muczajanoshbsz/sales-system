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
  completeOnboarding: () => Promise<void>;
  ghostMode: {
    isActive: boolean;
    targetUser: { uid: string; displayName?: string; email: string } | null;
    readOnly: boolean;
  };
  enterGhostMode: (targetUser: { uid: string; displayName?: string; email: string }, readOnly?: boolean) => void;
  exitGhostMode: () => void;
  timeTravel: {
    isActive: boolean;
    backupId: string | null;
    backupDate: string | null;
  };
  enterTimeTravel: (backupId: string, backupDate: string) => void;
  exitTimeTravel: () => void;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);
  const [ghostMode, setGhostMode] = useState<{
    isActive: boolean;
    targetUser: { uid: string; displayName?: string; email: string } | null;
    readOnly: boolean;
  }>({
    isActive: !!sessionStorage.getItem('ghost_user_id'),
    targetUser: sessionStorage.getItem('ghost_user_data') ? JSON.parse(sessionStorage.getItem('ghost_user_data')!) : null,
    readOnly: sessionStorage.getItem('ghost_mode_readonly') === 'true',
  });

  const [timeTravel, setTimeTravel] = useState<{
    isActive: boolean;
    backupId: string | null;
    backupDate: string | null;
  }>({
    isActive: !!sessionStorage.getItem('time_travel_backup_id'),
    backupId: sessionStorage.getItem('time_travel_backup_id'),
    backupDate: sessionStorage.getItem('time_travel_backup_date'),
  });

  const enterTimeTravel = (backupId: string, backupDate: string) => {
    sessionStorage.setItem('time_travel_backup_id', backupId);
    sessionStorage.setItem('time_travel_backup_date', backupDate);
    setTimeTravel({
      isActive: true,
      backupId,
      backupDate,
    });
    window.location.reload();
  };

  const exitTimeTravel = () => {
    sessionStorage.removeItem('time_travel_backup_id');
    sessionStorage.removeItem('time_travel_backup_date');
    setTimeTravel({
      isActive: false,
      backupId: null,
      backupDate: null,
    });
    window.location.reload();
  };

  const enterGhostMode = (targetUser: { uid: string; displayName?: string; email: string }, readOnly: boolean = true) => {
    sessionStorage.setItem('ghost_user_id', targetUser.uid);
    sessionStorage.setItem('ghost_user_data', JSON.stringify(targetUser));
    sessionStorage.setItem('ghost_mode_readonly', String(readOnly));
    setGhostMode({
      isActive: true,
      targetUser,
      readOnly,
    });
    // Reload to apply headers across all components and reset state
    window.location.reload();
  };

  const exitGhostMode = () => {
    sessionStorage.removeItem('ghost_user_id');
    sessionStorage.removeItem('ghost_user_data');
    sessionStorage.removeItem('ghost_mode_readonly');
    setGhostMode({
      isActive: false,
      targetUser: null,
      readOnly: true,
    });
    window.location.reload();
  };

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

  const completeOnboarding = async () => {
    try {
      await apiService.completeOnboarding();
      if (profile) {
        setProfile({ ...profile, has_seen_onboarding: true });
      }
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    }
  };

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    isSuspended,
    completeOnboarding,
    ghostMode,
    enterGhostMode,
    exitGhostMode,
    timeTravel,
    enterTimeTravel,
    exitTimeTravel,
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
