import axios from 'axios';

const API_URL = '/api';

// Создаем экземпляр axios с базовым URL
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Add timeout to avoid hanging requests
  timeout: 10000,
  // Ensure no CORS issues by including credentials
  withCredentials: false,
});

api.interceptors.request.use(
  (config) => {
    // Получаем данные пользователя из localStorage
    let user;
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        user = JSON.parse(userStr);
      }
    } catch (error) {
      console.error('Ошибка при получении данных пользователя:', error);
    }

    // Добавляем идентификатор пользователя в заголовки
    if (user && user.id) {
      config.headers['X-User-ID'] = user.id;
      
      // Если есть токен, добавляем его в заголовок авторизации
      if (user.token) {
        config.headers['Authorization'] = `Bearer ${user.token}`;
      }
    }

    // Логируем запросы для отладки
    console.log('API Request:', {
      url: config.url,
      method: config.method,
      headers: config.headers,
      data: config.data
    });

    return config;
  },
  (error) => {
    console.error('Ошибка в интерцепторе запроса:', error);
    return Promise.reject(error);
  }
);

// Интерцептор для обработки ответов и ошибок
api.interceptors.response.use(
  (response) => {
    // Логируем успешные ответы
    console.log('API Response:', {
      url: response.config.url,
      status: response.status,
      data: response.data
    });
    return response;
  },
  (error) => {
    // Логируем ошибки
    console.error('API Error:', {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    
    // Если 401 (Unauthorized), то сбрасываем авторизацию
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('user');
      // Перенаправляем на страницу логина, но только если мы не находимся уже на странице логина
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

// API методы для аутентификации
export const authAPI = {
  // Регистрация нового пользователя
  register: (username, email, password) => {
    // Create a special config for registration that doesn't send auth headers
    const config = {
      headers: {
        'Content-Type': 'application/json',
      }
    };
    return api.post('/auth/register', { username, email, password }, config);
  },

  // Вход в систему
  login: (username, password) => {
    // Create a special config for login that doesn't send auth headers
    const config = {
      headers: {
        'Content-Type': 'application/json',
      }
    };
    return api.post('/auth/login', { username, password }, config);
  },

  // Выход из системы
  logout: () => {
    return api.post('/auth/logout');
  },
};

// API методы для комнат
export const roomsAPI = {
  // Получить список всех комнат
  getRooms: () => {
    return api.get('/rooms');
  },

  // Получить список комнат пользователя
  getUserRooms: () => {
    return api.get('/rooms/user');
  },

  // Получить информацию о конкретной комнате
  getRoom: (roomId) => {
    return api.get(`/rooms/${roomId}`);
  },

  // Создать новую комнату
  createRoom: (name, description, isPrivate = false) => {
    return api.post('/rooms', { name, description, is_private: isPrivate });
  },

  // Обновить информацию о комнате
  updateRoom: (roomId, name, description, isPrivate = false) => {
    return api.put(`/rooms/${roomId}`, { name, description, is_private: isPrivate });
  },

  // Удалить комнату
  deleteRoom: (roomId) => {
    return api.delete(`/rooms/${roomId}`);
  },

  // Получить список участников комнаты
  getRoomMembers: (roomId) => {
    return api.get(`/rooms/${roomId}/members`);
  },

  // Добавить участника в комнату по email
  addRoomMember: (roomId, email) => {
    return api.post(`/rooms/${roomId}/members`, { email });
  },

  // Удалить участника из комнаты
  removeRoomMember: (roomId, userId) => {
    return api.delete(`/rooms/${roomId}/members/${userId}`);
  },
};

// API методы для сообщений
export const messagesAPI = {
  // Получить сообщения комнаты
  getMessages: (roomId) => {
    return api.get(`/messages/room/${roomId}`);
  },

  // Создать новое сообщение
  createMessage: (content, roomId) => {
    return api.post('/messages', { content, room_id: roomId });
  },
};

// Implement a static connection registry to prevent duplicate connections
// Add this before the WebSocketService class
const activeWebSocketConnections = new Map();

// Класс для работы с WebSocket
export class WebSocketService {
  constructor(roomId, userId, onMessageCallback) {
    this.roomId = roomId;
    this.userId = userId;
    this.onMessageCallback = onMessageCallback;
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.heartbeatInterval = null;
    this.pollingInterval = null;
    this.lastMessageTime = Date.now();
    this.connectionKey = `${userId}-${roomId}`;
  }

  // Подключение к WebSocket
  connect() {
    // Check if there's already an active connection for this user+room
    const existingConnection = activeWebSocketConnections.get(this.connectionKey);
    if (existingConnection && existingConnection !== this) {
      console.log('[DEBUG] Already have an active connection for this user and room. Reusing it.');
      
      // Clean up any resources from this instance
      this.disconnect();
      
      // Use the existing connection if possible
      if (existingConnection.isConnected()) {
        if (this.onMessageCallback && existingConnection.onMessageCallback !== this.onMessageCallback) {
          // Update the message callback on the existing connection
          existingConnection.onMessageCallback = this.onMessageCallback;
        }
        return;
      } else {
        // The existing connection is no longer valid, remove it
        activeWebSocketConnections.delete(this.connectionKey);
      }
    }
    
    // Register this connection
    activeWebSocketConnections.set(this.connectionKey, this);
    
    if (this.socket) {
      this.disconnect();
    }

    try {
      // Use hostname for websocket to ensure it works with the proxy
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/ws?room_id=${this.roomId}&user_id=${this.userId}`;
      console.log('[DEBUG] Attempting WebSocket connection to:', wsUrl);
      
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('[DEBUG] WebSocket connection established!');
        this.connected = true;
        this.reconnectAttempts = 0; // Сбрасываем счетчик попыток
        this.lastMessageTime = Date.now();
        
        // Отправляем сообщение о подключении (если требуется на сервере)
        this.sendSystemMessage({
          type: 'user_connected',
          user_id: this.userId,
          room_id: this.roomId,
          timestamp: new Date().toISOString()
        });
        
        // Устанавливаем интервал для heartbeat, чтобы поддерживать соединение
        this.startHeartbeat();
        
        // Запускаем периодический опрос сообщений на случай, если WebSocket не работает
        this.startMessagePolling();
      };
      
      this.socket.onmessage = (event) => {
        console.log('[DEBUG] Raw WebSocket message received:', event.data);
        this.lastMessageTime = Date.now();
        
        try {
          const message = JSON.parse(event.data);
          console.log('[DEBUG] Parsed WebSocket message:', message);
          
          // Обработка сообщений-пингов, если они есть
          if (message.type === 'ping') {
            this.sendSystemMessage({ type: 'pong', timestamp: new Date().toISOString() });
            return;
          }
          
          // Стандартизация формата сообщения
          let standardizedMessage = message;
          
          // Если сообщение пришло не в стандартном формате, пытаемся его стандартизировать
          if (message.data && typeof message.data === 'object') {
            standardizedMessage = { ...message.data, event: message.event };
            console.log('[DEBUG] Standardized message from data object:', standardizedMessage);
          }
          
          // Добавляем информацию о времени получения, если её нет
          if (!standardizedMessage.timestamp && !standardizedMessage.created_at) {
            standardizedMessage.timestamp = new Date().toISOString();
          }
          
          if (this.onMessageCallback) {
            console.log('[DEBUG] Calling message callback with:', standardizedMessage);
            this.onMessageCallback(standardizedMessage);
          } else {
            console.error('[DEBUG] No message callback defined!');
          }
        } catch (error) {
          console.error('[DEBUG] Error processing WebSocket message:', error, 'Raw data:', event.data);
          
          // Пытаемся обработать сообщение как текст, если это не JSON
          if (typeof event.data === 'string' && this.onMessageCallback) {
            try {
              const textMessage = {
                type: 'raw_message',
                content: event.data,
                timestamp: new Date().toISOString()
              };
              console.log('[DEBUG] Treating as text message:', textMessage);
              this.onMessageCallback(textMessage);
            } catch (e) {
              console.error('[DEBUG] Failed to process as text message:', e);
            }
          }
        }
      };

      this.socket.onclose = (event) => {
        console.log('[DEBUG] WebSocket connection closed', event.code, event.reason);
        this.connected = false;
        
        // Автоматическое переподключение, если соединение было закрыто не вручную
        if (event.code !== 1000) {
          this.attemptReconnect();
        }
      };

      this.socket.onerror = (error) => {
        console.error('[DEBUG] WebSocket error:', error);
        // При ошибке не закрываем сокет, onclose сам вызовется
      };
    } catch (e) {
      console.error('[DEBUG] Error creating WebSocket:', e);
      this.startMessagePolling(); // Запускаем опрос сообщений если WebSocket не поддерживается
    }
  }
  
  // Запуск опроса сообщений если WebSocket не работает
  startMessagePolling() {
    this.stopMessagePolling(); // Сначала останавливаем предыдущий интервал
    
    console.log('[DEBUG] Starting message polling as fallback');
    this.pollingInterval = setInterval(() => {
      // Проверяем, не получали ли мы сообщений через WebSocket недавно
      const timeSinceLastMessage = Date.now() - this.lastMessageTime;
      
      if (timeSinceLastMessage > 10000) { // Если более 10 секунд нет сообщений через WebSocket
        console.log('[DEBUG] No WebSocket messages for 10 seconds, polling for messages');
        
        // Делаем HTTP запрос сообщений
        import('../services/api').then(api => {
          api.messagesAPI.getMessages(this.roomId)
            .then(response => {
              if (response.data && Array.isArray(response.data) && this.onMessageCallback) {
                // Отправляем сообщение через callback с пометкой что оно от polling
                this.onMessageCallback({
                  type: 'polling_update',
                  messages: response.data,
                  timestamp: new Date().toISOString()
                });
              }
            })
            .catch(error => {
              console.error('[DEBUG] Error polling for messages:', error);
            });
        });
      }
    }, 15000); // Каждые 15 секунд проверяем
  }
  
  // Остановка опроса сообщений
  stopMessagePolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  // Попытка переподключения
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Достигнуто максимальное количество попыток переподключения');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`Попытка переподключения #${this.reconnectAttempts} через ${delay}мс`);
    
    this.reconnectTimeout = setTimeout(() => {
      console.log('Переподключение...');
      this.connect();
    }, delay);
  }

  // Отправка сообщения через WebSocket
  sendMessage(message) {
    if (this.socket && this.connected) {
      const messageToSend = typeof message === 'string'
        ? { content: message, room_id: this.roomId, user_id: this.userId, type: 'message' }
        : message;
        
      this.socket.send(JSON.stringify(messageToSend));
    } else {
      console.error('WebSocket не подключен. Сообщение не отправлено.');
    }
  }
  
  // Отправка системного сообщения
  sendSystemMessage(message) {
    if (this.socket && this.connected) {
      this.socket.send(JSON.stringify(message));
    }
  }

  // Начать отправку heartbeat для поддержания соединения
  startHeartbeat() {
    this.stopHeartbeat(); // Сначала останавливаем предыдущий интервал, если он был
    
    this.heartbeatInterval = setInterval(() => {
      if (this.connected && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.sendSystemMessage({ 
            type: 'heartbeat', 
            timestamp: new Date().toISOString() 
          });
          console.log('Heartbeat отправлен');
        } catch (e) {
          console.error('Ошибка при отправке heartbeat:', e);
          this.attemptReconnect();
        }
      } else if (this.connected) {
        // Если считаем, что подключены, но сокет не открыт, пытаемся переподключиться
        console.warn('Heartbeat: обнаружено закрытое соединение, переподключение...');
        this.attemptReconnect();
      }
    }, 30000); // Каждые 30 секунд
  }
  
  // Остановить отправку heartbeat
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Отключение от WebSocket
  disconnect() {
    // Останавливаем heartbeat
    this.stopHeartbeat();
    
    // Останавливаем опрос сообщений
    this.stopMessagePolling();
    
    // Очищаем таймер переподключения, если он есть
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.socket) {
      // Отправляем сообщение о отключении перед закрытием
      if (this.connected) {
        try {
          this.sendSystemMessage({
            type: 'user_disconnected',
            user_id: this.userId,
            room_id: this.roomId,
            timestamp: new Date().toISOString()
          });
        } catch (e) {
          console.error('Ошибка при отправке сообщения об отключении:', e);
        }
      }
      
      // Remove from connection registry
      activeWebSocketConnections.delete(this.connectionKey);
      
      // Корректно закрываем соединение
      this.socket.close(1000, 'Закрыто пользователем');
      this.socket = null;
      this.connected = false;
    }
  }
  
  // Проверка состояния подключения
  isConnected() {
    return this.connected && this.socket && this.socket.readyState === WebSocket.OPEN;
  }
}

export default api; 