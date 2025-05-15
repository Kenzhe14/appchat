import React, { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { UserContext } from '../App';

// MUI компоненты
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import ChatIcon from '@mui/icons-material/Chat';

const Register = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Проверяем валидность данных
      if (password.length < 6) {
        throw new Error('Пароль должен содержать не менее 6 символов');
      }
      if (!email.includes('@')) {
        throw new Error('Введите корректный email');
      }

      // Регистрируем пользователя
      console.log('Отправка запроса на регистрацию:', { username, email });
      const response = await authAPI.register(username, email, password);
      console.log('Ответ регистрации:', response.data);
      
      // Автоматически входим после регистрации
      console.log('Отправка запроса на вход');
      const loginResponse = await authAPI.login(username, password);
      console.log('Ответ входа:', loginResponse.data);

      // Проверяем наличие данных пользователя
      if (!loginResponse.data || !loginResponse.data.id) {
        throw new Error('Неверный ответ от сервера: отсутствуют данные пользователя');
      }
      
      // Добавляем дополнительную информацию если её нет
      const userData = {
        ...loginResponse.data,
        // Убедимся что есть статус и токен
        status: loginResponse.data.status || 'online',
        token: loginResponse.data.token || 'default-token'
      };
      
      // Сохраняем данные пользователя
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      
      // Перенаправляем на главную
      navigate('/home');
    } catch (error) {
      console.error('Ошибка регистрации:', error);
      setError(error.response?.data?.error || error.message || 'Ошибка при регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
      }}
    >
      <Card sx={{ maxWidth: 400, width: '100%' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <ChatIcon sx={{ fontSize: 50, color: 'primary.main' }} />
          </Box>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            Регистрация
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label="Имя пользователя"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email"
              name="email"
              autoComplete="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Пароль"
              type="password"
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              helperText="Минимум 6 символов"
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Зарегистрироваться'}
            </Button>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2">
                Уже есть аккаунт?{' '}
                <Link to="/login" style={{ color: 'inherit' }}>
                  Войти
                </Link>
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Register; 