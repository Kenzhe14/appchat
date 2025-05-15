import React, { useState, useEffect, createContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Chat from './pages/Chat';
import { Container } from '@mui/material';
import Home from './pages/Home';

// Создаем контекст для пользователя
export const UserContext = createContext(null);

function App() {
  // Состояние пользователя
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Загружаем пользователя из localStorage при запуске
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error('Ошибка при загрузке пользователя:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Сохраняем пользователя в localStorage при изменении
  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
      } else {
        localStorage.removeItem('user');
      }
    } catch (error) {
      console.error('Ошибка при сохранении пользователя:', error);
    }
  }, [user]);

  // Пока загружаем пользователя, ничего не показываем
  if (loading) {
    return <div>Загрузка...</div>;
  }

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <Container maxWidth={false} disableGutters sx={{ height: '100vh', overflow: 'hidden' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/register" />} />
          <Route path="/home" element={user ? <Home /> : <Navigate to="/login" />} />
          <Route path="/login" element={user ? <Navigate to="/home" /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/home" /> : <Register />} />
          <Route path="/chat/:roomId" element={user ? <Chat /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to="/register" />} />
        </Routes>
      </Container>
    </UserContext.Provider>
  );
}

export default App; 