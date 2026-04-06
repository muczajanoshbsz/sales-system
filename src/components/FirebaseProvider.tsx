import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile, UserRole } from '../types';

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
    // For local development, we can bypass the real auth check
    // and provide a mock user if needed, but let's keep the listener
    // and just provide a default if it's not logged in.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          setProfile(userDoc.data() as UserProfile);
        } else {
          const isFirstAdmin = firebaseUser.email === 'csmucza@gmail.com';
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email!,
            role: isFirstAdmin ? 'admin' : 'client',
            displayName: firebaseUser.displayName || undefined,
          };
          await setDoc(userDocRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        // MOCK USER for Localhost/Bypass
        const mockUid = 'local-dev-user';
        setUser({
          uid: mockUid,
          email: 'admin@localhost',
          displayName: 'Local Admin',
          emailVerified: true,
        } as User);
        
        setProfile({
          uid: mockUid,
          email: 'admin@localhost',
          role: 'admin',
          displayName: 'Local Admin',
        });
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
