import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { AuthContext } from "./AuthContext";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [dbUser, setDbUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken();
          const res = await fetch("http://localhost:3000/users/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          setDbUser(data);
          // Merge DB photoURL into Firebase user
          setUser({ ...currentUser, photoURL: data.photoURL || currentUser.photoURL });
        } catch {
          setUser(currentUser);
        }
      } else {
        setUser(null);
        setDbUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const emailVerified = user?.emailVerified ?? false;

  return (
    <AuthContext.Provider value={{ user, dbUser, loading, emailVerified }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}