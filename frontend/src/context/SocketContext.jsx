import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export const SocketProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let newSocket;

    if (isAuthenticated && user) {
      // Connect to socket when authenticated
      newSocket = io(SOCKET_URL, {
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      newSocket.on('connect', () => {
        setIsConnected(true);
        console.log('Socket connected:', newSocket.id);

        // Join room based on user role and zone (default to generic if none)
        newSocket.emit('join:room', {
          role: user.role,
          userId: user._id || user.uid,
          zone: user.zone || 'global'
        });
      });

      newSocket.on('alert:voice', (data) => {
        console.log('Voice alert received:', data);
        if (data.message && window.speechSynthesis) {
          // Native fallback if audioUrl fails or for better reliability
          const utterance = new SpeechSynthesisUtterance(data.message);
          utterance.lang = 'hi-IN';
          window.speechSynthesis.speak(utterance);
        }
        if (data.audioUrl) {
          // Keep audioUrl as primary for higher quality if browser allows
          const audio = new Audio(data.audioUrl);
          audio.play().catch(e => console.warn("Audio tag playback failed", e));
        }
      });

      setSocket(newSocket);
    }

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [isAuthenticated, user]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
