import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Container, TextField, Button, Typography, AppBar, Toolbar,
  List, ListItem, ListItemText, Divider, Paper, IconButton, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle,
  Drawer, Grid, Chip, Avatar, ListItemAvatar,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { messagesAPI, roomsAPI, WebSocketService } from '../services/api';

// Компонент сообщения
const MessageItem = ({ message, currentUser }) => {
  console.log('[DEBUG] Rendering message:', message);
  
  // Обработка системных сообщений
  if (message.is_system) {
    // Выбираем цвет и иконку в зависимости от типа системного сообщения
    let chipColor = 'default';
    let bgColor = 'rgba(0, 0, 0, 0.04)';
    let textColor = 'text.secondary';
    
    if (message.is_error) {
      chipColor = 'error';
      bgColor = 'rgba(211, 47, 47, 0.04)';
      textColor = 'error.main';
    } else if (message.content && message.content.includes('получено')) {
      chipColor = 'success';
      bgColor = 'rgba(46, 125, 50, 0.04)';
      textColor = 'success.main';
    }
    
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          mb: 2,
          mt: 2,
        }}
      >
        <Chip
          label={message.content}
          color={chipColor}
          variant="outlined"
          sx={{ 
            color: textColor, 
            fontStyle: 'italic',
            bgcolor: bgColor,
            padding: '8px 4px',
            border: message.is_error ? '1px solid currentColor' : 'none'
          }}
        />
      </Box>
    );
  }
  
  // Проверка наличия user объекта перед рендерингом
  if (!message.user) {
    console.error('[DEBUG] Message missing user object:', message);
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          mb: 2,
        }}
      >
        <Chip
          label={`Сообщение: ${message.content}`}
          color="error"
          variant="outlined"
          sx={{ fontStyle: 'italic' }}
        />
      </Box>
    );
  }

  const isOwnMessage = message.user.id === currentUser.id;
  
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isOwnMessage ? 'flex-end' : 'flex-start',
        mb: 2,
      }}
    >
      <Paper
        sx={{
          p: 2,
          maxWidth: '70%',
          bgcolor: isOwnMessage ? 'primary.light' : 'background.paper',
          color: isOwnMessage ? 'primary.contrastText' : 'text.primary',
          borderRadius: '10px',
          opacity: message.is_pending ? 0.7 : 1,
          border: message.is_error ? '1px solid red' : 'none',
        }}
      >
        {!isOwnMessage && (
          <Typography variant="subtitle2" color="textSecondary">
            {message.user.username}
          </Typography>
        )}
        <Typography variant="body1">{message.content}</Typography>
        <Typography variant="caption" color={isOwnMessage ? 'rgba(255,255,255,0.7)' : 'textSecondary'} sx={{ display: 'block', mt: 1 }}>
          {new Date(message.created_at).toLocaleTimeString()}
          {message.is_pending && ' (Отправляется...)'}
          {message.is_error && ' (Ошибка отправки)'}
        </Typography>
      </Paper>
    </Box>
  );
};

// Компонент для добавления участника
const AddMemberDialog = ({ open, handleClose, addMember }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!email) {
      setError('Поле email не может быть пустым');
      return;
    }
    
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Введите корректный email');
      return;
    }
    
    addMember(email);
    setEmail('');
    setError('');
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogTitle>Добавить участника</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Введите email пользователя, которого хотите добавить в чат
        </DialogContentText>
        <TextField
          autoFocus
          margin="dense"
          label="Email"
          type="email"
          fullWidth
          variant="outlined"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={!!error}
          helperText={error}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Отмена</Button>
        <Button onClick={handleSubmit} variant="contained">Добавить</Button>
      </DialogActions>
    </Dialog>
  );
};

// Основной компонент чата
const Chat = () => {
  const navigate = useNavigate();
  const { roomId } = useParams(); // Получаем ID комнаты из URL
  const currentUser = JSON.parse(localStorage.getItem('user'));
  const messageListRef = useRef(null);
  const webSocketRef = useRef(null);

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [members, setMembers] = useState([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [rooms, setRooms] = useState([]);

  // Создаем ref для хранения последнего состояния сообщений
  const messagesRef = useRef([]);
  
  // Обновляем ref при каждом изменении messages
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Проверка авторизации
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  // Загрузка списка комнат пользователя
  useEffect(() => {
    if (currentUser) {
      roomsAPI.getUserRooms()
        .then(response => {
          setRooms(response.data);
        })
        .catch(error => {
          console.error('Ошибка при загрузке комнат:', error);
        });
    }
  }, [currentUser]);

  // Загрузка информации о комнате
  useEffect(() => {
    if (roomId) {
      roomsAPI.getRoom(roomId)
        .then(response => {
          setRoom(response.data);
        })
        .catch(error => {
          console.error('Ошибка при загрузке комнаты:', error);
          navigate('/');
        });
    }
  }, [roomId, navigate]);

  // Загрузка участников комнаты
  useEffect(() => {
    if (roomId) {
      roomsAPI.getRoomMembers(roomId)
        .then(response => {
          setMembers(response.data);
        })
        .catch(error => {
          console.error('Ошибка при загрузке участников:', error);
        });
    }
  }, [roomId]);

  // Загрузка сообщений комнаты
  useEffect(() => {
    if (roomId) {
      messagesAPI.getMessages(roomId)
        .then(response => {
          setMessages(response.data);
          scrollToBottom();
        })
        .catch(error => {
          console.error('Ошибка при загрузке сообщений:', error);
        });
    }
  }, [roomId]);

  // Настройка WebSocket соединения
  useEffect(() => {
    console.log('[DEBUG] Setting up WebSocket connection. Room ID:', roomId, 'User:', currentUser?.id);
    
    // Создаем функцию-обработчик, которая не зависит от замыкания на переменную messages
    const handleWebSocketMessageStable = (message) => {
      console.log('[DEBUG] handleWebSocketMessage called with:', message);
      
      if (message.type === 'polling_update' && message.messages) {
        console.log('[DEBUG] Handling polling update with', message.messages.length, 'messages');
        
        // Обновляем сообщения из результатов опроса
        setMessages(prevMessages => {
          // Находим новые сообщения, которых нет в текущем списке
          const existingIds = new Set(prevMessages.map(m => m.id));
          const newMessages = message.messages.filter(m => !existingIds.has(m.id));
          
          console.log('[DEBUG] Found', newMessages.length, 'new messages from polling');
          
          if (newMessages.length > 0) {
            setTimeout(scrollToBottom, 100);
            return [...prevMessages, ...newMessages];
          }
          return prevMessages;
        });
        
        return;
      }
      
      if (message.type === 'new_message' || message.type === 'message') {
        console.log('[DEBUG] Processing message type:', message.type);
        
        // Проверяем, что сообщение содержит необходимые данные
        if (message.content) {
          console.log('[DEBUG] Message has content:', message.content);
          
          let newMessage;
          
          // Если сообщение содержит все данные, используем их как есть
          if (message.id && message.user) {
            console.log('[DEBUG] Message has complete data with ID and user');
            newMessage = message;
          } else {
            // Если сообщение не полное, пытаемся восстановить недостающие поля
            console.log('[DEBUG] Reconstructing incomplete message. User ID:', message.user_id);
            
            setMessages(prevMessages => {
              // Используем текущие members из замыкания внутри функции обновления состояния
              const userObject = message.user_id === currentUser.id 
                ? currentUser 
                : members.find(m => m.id === message.user_id);
              
              console.log('[DEBUG] Found user object:', userObject);
                
              const reconstructedMessage = {
                id: message.id || `ws-${Date.now()}`,
                content: message.content,
                room_id: parseInt(roomId),
                user_id: message.user_id,
                // Если отправитель - текущий пользователь, используем его данные
                user: userObject || { id: message.user_id, username: 'Пользователь' },
                created_at: message.timestamp || new Date().toISOString(),
                is_from_ws: true
              };
              
              console.log('[DEBUG] Reconstructed message:', reconstructedMessage);
              
              // Проверяем, не дублируется ли сообщение
              console.log('[DEBUG] Checking for duplicate against', prevMessages.length, 'existing messages');
              const messageExists = prevMessages.some(m => {
                const idMatch = m.id === reconstructedMessage.id;
                const contentMatch = m.content === reconstructedMessage.content && 
                  m.user?.id === reconstructedMessage.user?.id && 
                  Math.abs(new Date(m.created_at) - new Date(reconstructedMessage.created_at)) < 2000;
                  
                if (idMatch) console.log('[DEBUG] Found duplicate by ID');
                if (contentMatch) console.log('[DEBUG] Found duplicate by content+user+time');
                
                return idMatch || contentMatch;
              });
              
              if (!messageExists) {
                console.log('[DEBUG] Adding new message to chat:', reconstructedMessage);
                console.log('[DEBUG] Previous messages count:', prevMessages.length);
                setTimeout(scrollToBottom, 100);
                return [...prevMessages, reconstructedMessage];
              } else {
                console.log('[DEBUG] Skipping duplicate message');
                return prevMessages;
              }
            });

            return; // Прерываем выполнение, так как уже обновили state
          }
          
          // Для полных сообщений обрабатываем здесь
          setMessages(prevMessages => {
            // Проверяем, не дублируется ли сообщение
            console.log('[DEBUG] Checking for duplicate against', prevMessages.length, 'existing messages');
            const messageExists = prevMessages.some(m => {
              const idMatch = m.id === newMessage.id;
              const contentMatch = m.content === newMessage.content && 
                m.user?.id === newMessage.user?.id && 
                Math.abs(new Date(m.created_at) - new Date(newMessage.created_at)) < 2000;
                
              if (idMatch) console.log('[DEBUG] Found duplicate by ID');
              if (contentMatch) console.log('[DEBUG] Found duplicate by content+user+time');
              
              return idMatch || contentMatch;
            });
            
            if (!messageExists) {
              console.log('[DEBUG] Adding new message to chat:', newMessage);
              console.log('[DEBUG] Previous messages count:', prevMessages.length);
              setTimeout(scrollToBottom, 100);
              return [...prevMessages, newMessage];
            } else {
              console.log('[DEBUG] Skipping duplicate message');
              return prevMessages;
            }
          });
        } else if (message.message_id || message.event === 'message_created') {
          console.log('[DEBUG] Message notification without content, fetching from API');
          // Если получили уведомление о создании сообщения без содержимого,
          // запрашиваем обновление с сервера
          messagesAPI.getMessages(roomId)
            .then(response => {
              console.log('[DEBUG] API response received:', response.data);
              if (response.data && Array.isArray(response.data)) {
                // Обновляем только новые сообщения, сохраняя существующие
                setMessages(prevMessages => {
                  const existingIds = new Set(prevMessages.map(m => m.id));
                  const newMessages = response.data.filter(m => !existingIds.has(m.id));
                  
                  console.log('[DEBUG] Found', newMessages.length, 'new messages from API');
                  
                  if (newMessages.length > 0) {
                    setTimeout(scrollToBottom, 100);
                    return [...prevMessages, ...newMessages];
                  }
                  return prevMessages;
                });
              }
            })
            .catch(error => {
              console.error('[DEBUG] Error fetching messages:', error);
            });
        }
      } else if (message.type === 'user_connected' || message.type === 'user_disconnected' || message.type === 'user_status_changed') {
        console.log('[DEBUG] Processing user status message:', message.type);
        
        // Обновляем список участников
        console.log('[DEBUG] Updating room members');
        roomsAPI.getRoomMembers(roomId)
          .then(response => {
            console.log('[DEBUG] New members list received:', response.data);
            setMembers(response.data);
          })
          .catch(error => {
            console.error('[DEBUG] Error updating members:', error);
          });
      }
    };
    
    if (roomId && currentUser) {
      // Закрываем предыдущее соединение, если оно существует
      if (webSocketRef.current) {
        console.log('[DEBUG] Existing WebSocket connection found, checking if we need to reconnect');
        // Only disconnect and reconnect if the room or user has changed
        if (webSocketRef.current.roomId !== roomId || webSocketRef.current.userId !== currentUser.id) {
          console.log('[DEBUG] Room or user changed, disconnecting old WebSocket connection');
          webSocketRef.current.disconnect();
          webSocketRef.current = null;
        } else {
          console.log('[DEBUG] Same room and user, reusing existing WebSocket connection');
          // Update the callback if needed
          if (webSocketRef.current.onMessageCallback !== handleWebSocketMessageStable) {
            console.log('[DEBUG] Updating WebSocket callback');
            webSocketRef.current.onMessageCallback = handleWebSocketMessageStable;
          }
          return; // Skip creating a new connection
        }
      }
      
      // Create a new WebSocket connection only if needed
      console.log('[DEBUG] Creating new WebSocket connection');
      const webSocketService = new WebSocketService(
        roomId,
        currentUser.id,
        handleWebSocketMessageStable
      );
      
      console.log('[DEBUG] Created new WebSocket service, connecting...');
      webSocketService.connect();
      webSocketRef.current = webSocketService;

      // Закрываем соединение при размонтировании компонента
      return () => {
        console.log('[DEBUG] Component unmounting, disconnecting WebSocket');
        if (webSocketRef.current) {
          webSocketRef.current.disconnect();
        }
      };
    }
  }, [roomId, currentUser]); // Remove 'members' dependency to prevent unnecessary reconnections

  // Функция проверки соединения - вызываемая периодически
  useEffect(() => {
    console.log('[DEBUG] Setting up WebSocket connection check interval');
    
    // Функция для проверки соединения
    const checkConnection = () => {
      console.log('[DEBUG] Checking WebSocket connection');
      if (
        roomId && 
        currentUser && 
        (!webSocketRef.current || !webSocketRef.current.isConnected())
      ) {
        console.log('[DEBUG] WebSocket not connected, reconnecting...');
        
        // Получаем текущую функцию обработчика сообщений
        const currentCallback = webSocketRef.current ? webSocketRef.current.onMessageCallback : null;
        
        // Создаем новое соединение, если оно не активно
        const webSocketService = new WebSocketService(
          roomId,
          currentUser.id,
          currentCallback || ((msg) => {
            console.log('[DEBUG] Fallback message handler:', msg);
            // Здесь можно добавить базовую обработку сообщений
          })
        );
        
        webSocketService.connect();
        webSocketRef.current = webSocketService;
      }
    };
    
    // Проверяем соединение сразу
    checkConnection();
    
    // Устанавливаем интервал проверки соединения
    const interval = setInterval(checkConnection, 10000); // Каждые 10 секунд
    
    return () => {
      clearInterval(interval);
    };
  }, [roomId, currentUser]);

  // Функция для прокрутки к последнему сообщению
  const scrollToBottom = () => {
    console.log('[DEBUG] Attempting to scroll to bottom');
    if (messageListRef.current) {
      try {
        // Используем RAF для гарантии, что прокрутка произойдет после рендеринга
        requestAnimationFrame(() => {
          messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
          console.log('[DEBUG] Scrolled to:', messageListRef.current.scrollTop);
          
          // На всякий случай повторим прокрутку через небольшую задержку
          setTimeout(() => {
            if (messageListRef.current) {
              messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
              console.log('[DEBUG] Delayed scroll to:', messageListRef.current.scrollTop);
            }
          }, 100);
        });
      } catch (e) {
        console.error('[DEBUG] Error scrolling to bottom:', e);
      }
    } else {
      console.log('[DEBUG] messageListRef.current is null, cannot scroll');
    }
  };

  // Отправка сообщения
  const sendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    console.log('[DEBUG] Sending message:', messageText);
    
    // Создаем временный ID для оптимистичного обновления UI
    const tempId = `temp-${Date.now()}`;
    
    // Создаем временное сообщение для отображения до получения ответа от сервера
    const tempMessage = {
      id: tempId,
      content: messageText,
      room_id: parseInt(roomId),
      user: currentUser,
      created_at: new Date().toISOString(),
      is_pending: true // Маркер, что сообщение еще не подтверждено сервером
    };
    
    // Добавляем сообщение в UI оптимистично
    console.log('[DEBUG] Adding optimistic message to UI:', tempMessage);
    setMessages(prevMessages => [...prevMessages, tempMessage]);
    scrollToBottom();
    
    // Очищаем поле ввода
    setMessageText('');
    
    // Сначала пытаемся отправить через WebSocket для более быстрой доставки
    let wsMessageSent = false;
    if (webSocketRef.current && webSocketRef.current.isConnected()) {
      try {
        console.log('[DEBUG] Sending message via WebSocket');
        const wsMessage = {
          type: 'message',
          content: messageText,
          room_id: parseInt(roomId),
          user_id: currentUser.id,
          temp_id: tempId // Добавляем tempId чтобы идентифицировать это сообщение
        };
        webSocketRef.current.sendMessage(wsMessage);
        wsMessageSent = true;
        console.log('[DEBUG] Successfully sent message via WebSocket:', wsMessage);
      } catch (error) {
        console.error('[DEBUG] Error sending WebSocket message:', error);
        wsMessageSent = false;
      }
    } else {
      console.log('[DEBUG] WebSocket not connected, falling back to HTTP');
    }

    // Всегда отправляем через REST API для надежности, даже если WebSocket отправка успешна
    console.log('[DEBUG] Sending message via REST API');
    messagesAPI.createMessage(messageText, parseInt(roomId))
      .then(response => {
        console.log('[DEBUG] API response success:', response.data);
        // Обновляем локальный список сообщений - заменяем временное сообщение на настоящее
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            msg.id === tempId ? { ...response.data, is_pending: false } : msg
          )
        );
        
        // Если не удалось отправить через WebSocket, но API запрос успешен,
        // пытаемся переподключить WebSocket
        if (!wsMessageSent && webSocketRef.current) {
          console.log('[DEBUG] Attempting to reconnect WebSocket after REST API success');
          webSocketRef.current.disconnect();
          webSocketRef.current.connect();
        }
      })
      .catch(error => {
        console.error('[DEBUG] Error sending message via API:', error);
        
        // Отмечаем сообщение как проблемное
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            msg.id === tempId ? { ...msg, is_pending: false, is_error: true } : msg
          )
        );
      });
  };

  // Добавление участника
  const addMember = (email) => {
    roomsAPI.addRoomMember(roomId, email)
      .then(response => {
        setMembers([...members, response.data]);
      })
      .catch(error => {
        console.error('Ошибка при добавлении участника:', error);
        alert(`Ошибка: ${error.response?.data?.error || 'Не удалось добавить пользователя'}`);
      });
  };

  // Удаление участника
  const removeMember = (userId) => {
    roomsAPI.removeRoomMember(roomId, userId)
      .then(() => {
        setMembers(members.filter(member => member.id !== userId));
      })
      .catch(error => {
        console.error('Ошибка при удалении участника:', error);
        alert(`Ошибка: ${error.response?.data?.error || 'Не удалось удалить пользователя'}`);
      });
  };

  // Функция перехода в другую комнату
  const navigateToRoom = (newRoomId) => {
    setIsDrawerOpen(false);
    navigate(`/chat/${newRoomId}`);
  };

  // Выход из чата
  const exitChat = () => {
    if (webSocketRef.current) {
      webSocketRef.current.disconnect();
    }
    navigate('/home');
  };

  // Добавим функцию для тестовой отправки сообщения
  // Это только для локального тестирования работы обработчика сообщений
  useEffect(() => {
    if (roomId && currentUser && members.length > 0 && webSocketRef.current) {
      // Используем callback из текущего WebSocket соединения
      const messageHandler = webSocketRef.current.onMessageCallback;
      
      window.testChatMessage = (content) => {
        const testMessage = {
          id: `test-${Date.now()}`,
          content: content || 'Тестовое сообщение ' + new Date().toLocaleTimeString(),
          room_id: parseInt(roomId),
          user: currentUser,
          created_at: new Date().toISOString(),
          is_from_ws: true
        };
        console.log('[DEBUG] Sending test message:', testMessage);
        if (messageHandler) {
          messageHandler(testMessage);
          return 'Тестовое сообщение отправлено';
        } else {
          console.error('[DEBUG] No message handler available');
          return 'Ошибка: обработчик сообщений не найден';
        }
      };
      
      window.sendLocalMessage = (userId, content) => {
        const user = userId === currentUser.id 
          ? currentUser 
          : members.find(m => m.id === userId) || { id: userId, username: 'Тестовый пользователь' };
          
        const testMessage = {
          type: 'message',
          id: `test-${Date.now()}`,
          content: content || `Сообщение от ${user.username}`,
          room_id: parseInt(roomId),
          user_id: user.id,
          user: user,
          created_at: new Date().toISOString()
        };
        
        console.log('[DEBUG] Sending local test message:', testMessage);
        if (messageHandler) {
          messageHandler(testMessage);
          return 'Локальное сообщение отправлено';
        } else {
          console.error('[DEBUG] No message handler available');
          return 'Ошибка: обработчик сообщений не найден';
        }
      };
      
      return () => {
        delete window.testChatMessage;
        delete window.sendLocalMessage;
      };
    }
  }, [roomId, currentUser, members]);

  // Проверка доступности WebSocket сервера
  useEffect(() => {
    let refreshInterval = null;
    
    if (roomId) {
      console.log('[DEBUG] Checking WebSocket server availability');
      
      // Используем Fetch API для проверки, что сервер доступен
      fetch('http://localhost:8080/api/ping')
        .then(response => {
          if (response.ok) {
            console.log('[DEBUG] Server is responsive');
            return response.text();
          }
          throw new Error('Server ping failed with status: ' + response.status);
        })
        .then(data => {
          console.log('[DEBUG] Server ping response:', data);
        })
        .catch(error => {
          console.error('[DEBUG] Server connectivity check failed:', error);
          // Если сервер недоступен, настроим периодическую проверку новых сообщений
          refreshInterval = startAutoRefresh();
        });
    }
    
    // Функция для периодического обновления сообщений, если WebSocket не работает
    const startAutoRefresh = () => {
      console.log('[DEBUG] Starting auto-refresh fallback for messages');
      const interval = setInterval(() => {
        console.log('[DEBUG] Auto-refreshing messages due to WebSocket unavailability');
        messagesAPI.getMessages(roomId)
          .then(response => {
            console.log('[DEBUG] Auto-refresh response:', response.data?.length, 'messages');
            setMessages(prevMessages => {
              if (!Array.isArray(response.data)) {
                return prevMessages;
              }
              
              // Находим новые сообщения
              const existingIds = new Set(prevMessages.map(m => m.id));
              const newMessages = response.data.filter(m => !existingIds.has(m.id));
              
              if (newMessages.length > 0) {
                console.log('[DEBUG] Found', newMessages.length, 'new messages from auto-refresh');
                setTimeout(scrollToBottom, 100);
                return [...prevMessages, ...newMessages];
              }
              return prevMessages;
            });
          })
          .catch(error => {
            console.error('[DEBUG] Auto-refresh error:', error);
          });
      }, 5000); // Проверяем каждые 5 секунд
      
      return interval;
    };
    
    // Очистка при размонтировании
    return () => {
      console.log('[DEBUG] Cleaning up auto-refresh interval');
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    };
  }, [roomId]);

  // Функция для тестирования обновления чата
  const testChatUpdate = () => {
    console.log('[DEBUG] Manually testing chat update');
    
    const testMessage = {
      id: `test-${Date.now()}`,
      content: 'Тестовое сообщение через интерфейс ' + new Date().toLocaleTimeString(),
      room_id: parseInt(roomId),
      user: currentUser,
      created_at: new Date().toISOString(),
      is_from_ws: true
    };
    
    console.log('[DEBUG] Adding test message:', testMessage);
    
    // Добавляем тестовое сообщение в чат
    setMessages(prevMessages => [...prevMessages, testMessage]);
    scrollToBottom();
    
    // Проверяем, что сервер доступен
    messagesAPI.getMessages(roomId)
      .then(response => {
        console.log('[DEBUG] Message API response:', response.data);
      })
      .catch(error => {
        console.error('[DEBUG] Error checking messages:', error);
      });
  };

  // Состояние обновления чата
  const [refreshState, setRefreshState] = useState({
    lastUpdate: null,
    isRefreshing: false,
    errorCount: 0
  });
  
  // Гарантированное периодическое получение сообщений
  useEffect(() => {
    console.log('[DEBUG] Setting up guaranteed message fetch interval');
    
    // Задаем минимальный интервал для запросов сообщений с сервера
    const messageRefreshInterval = setInterval(() => {
      if (!roomId) return;
      
      console.log('[DEBUG] Running guaranteed message fetch');
      let lastMessageId = 0;
      
      // Получаем актуальное значение сообщений из ref
      const currentMessages = messagesRef.current;
      
      // Находим ID последнего загруженного сообщения
      if (currentMessages.length > 0) {
        const messageIds = currentMessages
          .filter(m => m.id && typeof m.id === 'number')
          .map(m => m.id);
        
        if (messageIds.length > 0) {
          lastMessageId = Math.max(...messageIds);
        }
      }
      
      console.log('[DEBUG] Last message ID:', lastMessageId);
      
      // Устанавливаем статус обновления
      setRefreshState(prev => ({ ...prev, isRefreshing: true }));
      
      // Запрашиваем новые сообщения с сервера
      messagesAPI.getMessages(roomId)
        .then(response => {
          if (!Array.isArray(response.data)) {
            console.log('[DEBUG] Invalid response format:', response.data);
            setRefreshState(prev => ({ 
              ...prev, 
              isRefreshing: false,
              errorCount: prev.errorCount + 1
            }));
            return;
          }
          
          console.log('[DEBUG] Received', response.data.length, 'messages from server');
          
          // Получаем актуальное значение сообщений из ref для проверки
          const upToDateMessages = messagesRef.current;
          
          // Находим только новые сообщения
          const newMessages = response.data.filter(msg => {
            // Проверяем, есть ли уже сообщение с таким ID
            return !upToDateMessages.some(m => m.id === msg.id);
          });
          
          if (newMessages.length > 0) {
            console.log('[DEBUG] Found', newMessages.length, 'NEW messages to add');
            
            // Добавляем новые сообщения и прокручиваем вниз
            setMessages(prevMessages => [...prevMessages, ...newMessages]);
            setTimeout(scrollToBottom, 100);
          } else {
            console.log('[DEBUG] No new messages found');
          }
          
          // Обновляем статус
          setRefreshState({
            lastUpdate: new Date(),
            isRefreshing: false,
            errorCount: 0
          });
        })
        .catch(error => {
          console.error('[DEBUG] Error fetching messages:', error);
          setRefreshState(prev => ({ 
            ...prev, 
            isRefreshing: false,
            errorCount: prev.errorCount + 1
          }));
        });
    }, 3000); // Обновлять каждые 3 секунды
    
    return () => {
      console.log('[DEBUG] Cleaning up guaranteed message fetch interval');
      clearInterval(messageRefreshInterval);
    };
  }, [roomId]); // Убрали messages из зависимостей

  // Функция для принудительного обновления сообщений
  const forceRefresh = () => {
    console.log('[DEBUG] Manual refresh triggered');
    
    // Показываем индикатор загрузки
    setRefreshState(prev => ({ ...prev, isRefreshing: true }));
    
    // Запрашиваем сообщения
    messagesAPI.getMessages(roomId)
      .then(response => {
        console.log('[DEBUG] Manual refresh received', response.data?.length, 'messages');
        
        if (!Array.isArray(response.data)) {
          console.log('[DEBUG] Invalid response format on manual refresh');
          setRefreshState(prev => ({ 
            ...prev, 
            isRefreshing: false,
            errorCount: prev.errorCount + 1
          }));
          return;
        }
        
        // Получаем актуальное значение сообщений
        const upToDateMessages = messagesRef.current;
        
        // Находим только новые сообщения
        const newMessages = response.data.filter(msg => {
          return !upToDateMessages.some(m => m.id === msg.id);
        });
        
        if (newMessages.length > 0) {
          console.log('[DEBUG] Manual refresh found', newMessages.length, 'new messages');
          
          // Добавляем новые сообщения
          setMessages(prevMessages => [...prevMessages, ...newMessages]);
          setTimeout(scrollToBottom, 100);
          
          // Показываем системное сообщение
          const systemMessage = {
            id: `system-${Date.now()}`,
            content: `Обновлено: получено ${newMessages.length} новых сообщений`,
            is_system: true,
            created_at: new Date().toISOString()
          };
          
          setMessages(prevMessages => [...prevMessages, systemMessage]);
        } else {
          // Показываем системное сообщение, что новых сообщений нет
          const systemMessage = {
            id: `system-${Date.now()}`,
            content: `Новых сообщений нет`,
            is_system: true,
            created_at: new Date().toISOString()
          };
          
          setMessages(prevMessages => [...prevMessages, systemMessage]);
        }
        
        // Обновляем статус
        setRefreshState({
          lastUpdate: new Date(),
          isRefreshing: false,
          errorCount: 0
        });
      })
      .catch(error => {
        console.error('[DEBUG] Manual refresh error:', error);
        
        // Показываем системное сообщение об ошибке
        const errorMessage = {
          id: `system-error-${Date.now()}`,
          content: `Ошибка обновления: ${error.message || 'Неизвестная ошибка'}`,
          is_system: true,
          is_error: true,
          created_at: new Date().toISOString()
        };
        
        setMessages(prevMessages => [...prevMessages, errorMessage]);
        
        setRefreshState(prev => ({ 
          ...prev, 
          isRefreshing: false,
          errorCount: prev.errorCount + 1
        }));
      });
  };

  // Если данные не загружены, показываем загрузку
  if (!room) {
    return (
      <Container sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="h5">Загрузка чата...</Typography>
      </Container>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Верхняя панель */}
      <AppBar position="static">
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            onClick={() => setIsDrawerOpen(true)}
            sx={{ mr: 2 }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {room.name}
            {refreshState.isRefreshing && 
              <span style={{ fontSize: '0.7em', marginLeft: '10px', opacity: 0.7 }}>
                (обновление...)
              </span>
            }
            {refreshState.lastUpdate && 
              <span style={{ fontSize: '0.65em', display: 'block', opacity: 0.7 }}>
                Обновлено: {refreshState.lastUpdate.toLocaleTimeString()}
              </span>
            }
          </Typography>
          <Button 
            color="inherit" 
            onClick={forceRefresh}
            size="small"
            disabled={refreshState.isRefreshing}
            sx={{ mr: 1 }}
          >
            Обновить
          </Button>
          <Button 
            color="inherit" 
            onClick={testChatUpdate}
            size="small"
            sx={{ mr: 1 }}
          >
            Тест чата
          </Button>
          <IconButton
            color="inherit"
            onClick={() => setAddMemberDialogOpen(true)}
          >
            <PersonAddIcon />
          </IconButton>
          <IconButton
            color="inherit"
            onClick={exitChat}
          >
            <ExitToAppIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Боковая панель комнат */}
      <Drawer
        anchor="left"
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      >
        <Box sx={{ width: 300, p: 2 }}>
          <Typography variant="h6">Ваши комнаты</Typography>
          <List>
            {rooms.map(room => (
              <ListItem 
                button 
                key={room.id} 
                onClick={() => navigateToRoom(room.id)}
                selected={parseInt(roomId) === room.id}
              >
                <ListItemText 
                  primary={room.name} 
                  secondary={room.description || 'Нет описания'} 
                />
                {room.is_private && (
                  <Chip label="Приватная" size="small" color="primary" />
                )}
              </ListItem>
            ))}
          </List>
          <Divider sx={{ my: 2 }} />
          <Button 
            variant="contained" 
            fullWidth 
            onClick={() => navigate('/home')}
          >
            Создать новую комнату
          </Button>
        </Box>
      </Drawer>

      {/* Основной контент */}
      <Grid container sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {/* Список сообщений */}
        <Grid item xs={12} md={9} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box
            ref={messageListRef}
            sx={{
              flexGrow: 1,
              overflowY: 'auto',
              p: 2,
              backgroundColor: 'grey.100',
            }}
          >
            {messages.length === 0 ? (
              <Typography align="center" color="textSecondary" sx={{ mt: 4 }}>
                Нет сообщений. Начните общение!
              </Typography>
            ) : (
              messages.map(message => (
                <MessageItem
                  key={message.id}
                  message={message}
                  currentUser={currentUser}
                />
              ))
            )}
          </Box>

          {/* Форма отправки сообщения */}
          <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <form onSubmit={sendMessage}>
              <Box sx={{ display: 'flex' }}>
                <TextField
                  fullWidth
                  placeholder="Введите сообщение..."
                  variant="outlined"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  sx={{ mr: 1 }}
                />
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  endIcon={<SendIcon />}
                >
                  Отправить
                </Button>
              </Box>
            </form>
          </Box>
        </Grid>

        {/* Список участников */}
        <Grid item md={3} sx={{ display: { xs: 'none', md: 'block' }, borderLeft: '1px solid', borderColor: 'divider', height: '100%' }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Участники ({members.length})
            </Typography>
            <List>
              {members.map(member => (
                <ListItem key={member.id}>
                  <ListItemAvatar>
                    <Avatar>
                      {member.username.charAt(0).toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={member.username}
                    secondary={
                      <>
                        {member.email}
                        <br />
                        <Chip
                          size="small"
                          label={member.status}
                          color={member.status === 'online' ? 'success' : 'default'}
                          sx={{ mt: 0.5 }}
                        />
                      </>
                    }
                  />
                  {room.owner_id === currentUser.id && member.id !== currentUser.id && (
                    <IconButton
                      edge="end"
                      color="error"
                      onClick={() => removeMember(member.id)}
                      size="small"
                    >
                      <PersonAddIcon sx={{ transform: 'rotate(45deg)' }} />
                    </IconButton>
                  )}
                </ListItem>
              ))}
            </List>
            <Button
              variant="outlined"
              startIcon={<PersonAddIcon />}
              fullWidth
              sx={{ mt: 2 }}
              onClick={() => setAddMemberDialogOpen(true)}
            >
              Добавить участника
            </Button>
          </Box>
        </Grid>
      </Grid>

      {/* Диалог добавления участника */}
      <AddMemberDialog
        open={addMemberDialogOpen}
        handleClose={() => setAddMemberDialogOpen(false)}
        addMember={addMember}
      />
    </Box>
  );
};

export default Chat; 