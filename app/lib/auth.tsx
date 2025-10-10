'use client';
import { createContext, ReactNode, useContext, useState } from 'react';
import Cookies from 'js-cookie';

const AuthContext = createContext({
  userName: Cookies.get('username') || '',
  setUserName: null,
});

function AuthProvider({ children }: { children: ReactNode }) {
  const storedUserName = Cookies.get('username') || '';
  const [userName, setUserName] = useState(storedUserName);
  const setUser = (newUserName: string) => {
    Cookies.set('username', newUserName);
    setUserName(newUserName);
  };
  return (
    <AuthContext.Provider value={{ userName, setUserName: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuthState = () => {
  const { userName, setUserName } = useContext(AuthContext);
  return { userName, setUserName };
};

export default AuthProvider;
