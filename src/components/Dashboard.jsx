import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Paperclip, Loader2, Users, User, MessageCircle, ArrowLeft, X, FileText } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const WS_BASE = import.meta.env.VITE_WS_BASE_URL || '';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const getSocketUrl = (roomName) => `${WS_BASE}/ws/chat/${roomName}/`;

const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
};

const optimizeImage = (url) => {
  if (!url) return url;
  return url.replace('/upload/', '/upload/w_500,q_auto,f_auto/');
};

const Dashboard = ({ user, onLogout }) => {
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [activeChat, setActiveChat] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [uploading, setUploading] = useState(false);
  const [socketStatus, setSocketStatus] = useState('idle');
  const [showNewChat, setShowNewChat] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const pendingMessagesRef = useRef([]);
  const wsRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const isMobile = useIsMobile();

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/rooms/`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load rooms');
      const data = await res.json();
      setRooms(data);
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const flushPendingMessages = useCallback((socket) => {
    const pending = pendingMessagesRef.current;
    if (!pending.length) return;
    pending.forEach((msg) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
    });
    pendingMessagesRef.current = [];
  }, []);

  useEffect(() => {
    if (!activeChat) return;

    setSocketStatus('connecting');
    const socket = new WebSocket(getSocketUrl(activeChat.name));
    wsRef.current = socket;
    setMessages([]);

    socket.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === 'history') {
        setMessages(data.messages.map(formatMsg));
      } else if (data.type === 'message') {
        setMessages((prev) => [...prev, formatMsg(data)]);
        setRooms((prev) => prev.map((r) =>
          r.id === activeChat.id
            ? { ...r, last_message: data.message || (data.file_type === 'image' ? 'Photo' : 'File'), last_message_time: data.timestamp }
            : r
        ));
      } else if (data.type === 'presence') {
        setOnlineUsers((prev) => ({
          ...prev,
          [data.user_id]: { full_name: data.full_name, is_online: data.is_online },
        }));
      }
    };

    socket.onopen = () => {
      setSocketStatus('connected');
      flushPendingMessages(socket);
    };
    socket.onclose = () => setSocketStatus('disconnected');
    socket.onerror = (err) => {
      setSocketStatus('error');
      console.error('WebSocket error:', err);
    };

    return () => socket.close();
  }, [activeChat, flushPendingMessages]);

  // Auto-scroll to the newest message whenever the message list changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatMsg = (m) => ({
    id: m.id,
    sender: m.username,
    text: m.message,
    fileUrl: m.file_url,
    fileType: m.file_type,
    time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isMe: m.sender_id === user?.id,
  });

  const handleSendMessage = (e) => {
    e.preventDefault();
    const text = messageInput.trim();
    if (!text) return;

    const payload = { type: 'text', message: text };

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      pendingMessagesRef.current = [...pendingMessagesRef.current, payload];
      console.warn('WebSocket not connected yet — message queued');
      setMessageInput('');
      return;
    }

    wsRef.current.send(JSON.stringify(payload));
    setMessageInput('');
  };

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      alert('File is too big — max size is 5MB.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/api/chat/upload/`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();

      wsRef.current?.send(JSON.stringify({
        type: 'file',
        file_url: data.file_url,
        file_type: data.file_type,
      }));
    } catch (err) {
      console.error(err);
      alert('Upload failed. Try again.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, []);

  const isRoomOnline = (room) => {
    if (room.is_group || !room.other_user_id) return false;
    const live = onlineUsers[room.other_user_id];
    return live ? live.is_online : room.is_online;
  };

  const openNewChat = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/users/`, { credentials: 'include' });
      const data = await res.json();
      setAllUsers(data);
      setShowNewChat(true);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const startChatWith = async (otherUser) => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/rooms/start/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: otherUser.id }),
      });
      const room = await res.json();
      setShowNewChat(false);
      await fetchRooms();
      setActiveChat({
        id: room.id,
        name: room.name,
        display_name: otherUser.full_name || otherUser.email,
        is_group: false,
        other_user_id: otherUser.id,
      });
    } catch (err) {
      console.error('Failed to start chat:', err);
    }
  };

  const showSidebar = !isMobile || !activeChat;
  const showChatWindow = !isMobile || !!activeChat;

  return (
    <div className="container-fluid p-0" style={styles.dashboardContainer}>
      <div className="row g-0 h-100">

        {showSidebar && (
          <div
            className={isMobile ? 'col-12' : 'col-4'}
            style={{ ...styles.sidebar, ...(isMobile ? styles.sidebarMobile : {}) }}
          >
            <div className="d-flex justify-content-between align-content-center p-3" style={styles.sidebarHeader}>
              <div className="d-flex align-items-center gap-2">
                <div style={styles.avatarPlaceholder}>
                  {user?.full_name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="fw-bold text-dark">{user?.full_name || 'My Profile'}</div>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-success" onClick={openNewChat}>+ New</button>
                <button className="btn btn-sm btn-outline-danger" onClick={onLogout}>Logout</button>
              </div>
            </div>

            <div className="p-2" style={styles.searchBoxContainer}>
              <input type="text" placeholder="Search or start new chat" className="form-control form-control-sm" style={styles.searchInput} />
            </div>

            <div className="flex-grow-1 overflow-auto">
              {loadingRooms && (
                <div className="text-center text-muted p-4">Loading chats...</div>
              )}

              {!loadingRooms && rooms.length === 0 && (
                <div className="text-center text-muted p-4">
                  No chats yet — tap <strong>+ New</strong> to start one.
                </div>
              )}

              {rooms.map((room) => {
                const online = isRoomOnline(room);
                return (
                  <div
                    key={room.id}
                    onClick={() => setActiveChat(room)}
                    style={{ ...styles.chatListItem, backgroundColor: activeChat?.id === room.id ? '#f0f2f5' : 'transparent' }}
                  >
                    <div style={{ position: 'relative' }}>
                      <div style={room.is_group ? styles.groupAvatar : styles.privateAvatar}>
                        {room.is_group ? <Users size={20} color="#4a6da8" /> : <User size={20} color="#667781" />}
                      </div>
                      {online && <span style={styles.onlineDot} />}
                    </div>
                    <div className="flex-grow-1 ms-3">
                      <div className="d-flex justify-content-between">
                        <span className="fw-bold text-dark">{room.display_name}</span>
                        <span style={styles.chatTime}>
                          {room.last_message_time ? new Date(room.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <div style={styles.lastMessageText}>
                        {online ? <span style={{ color: '#00a884' }}>online</span> : room.last_message}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showChatWindow && (
          <div
            className={isMobile ? 'col-12 d-flex flex-column' : 'col-8 d-flex flex-column'}
            style={{ ...styles.chatWindow, height: isMobile ? '100vh' : '100%' }}
          >
            {activeChat ? (
              <>
                <div className="d-flex align-items-center p-3" style={styles.chatHeader}>
                  {isMobile && (
                    <button className="btn btn-sm btn-light me-2 d-flex align-items-center justify-content-center" onClick={() => setActiveChat(null)} style={styles.backButton}>
                      <ArrowLeft size={18} />
                    </button>
                  )}
                  <div style={{ position: 'relative' }}>
                    <div style={activeChat.is_group ? styles.groupAvatar : styles.privateAvatar}>
                      {activeChat.is_group ? <Users size={20} color="#4a6da8" /> : <User size={20} color="#667781" />}
                    </div>
                    {!activeChat.is_group && isRoomOnline(activeChat) && <span style={styles.onlineDot} />}
                  </div>
                  <div className="ms-3">
                    <h6 className="m-0 fw-bold">{activeChat.display_name}</h6>
                    <small className="text-muted">
                      {activeChat.is_group ? 'Group Chat Room' : isRoomOnline(activeChat) ? 'online' : 'offline'}
                    </small>
                  </div>
                </div>

                {socketStatus !== 'connected' && (
                  <div style={{ ...styles.connectionBanner, ...(socketStatus === 'error' ? styles.connectionBannerError : {}) }}>
                    <strong>{socketStatus === 'connecting' ? 'Connecting...' : socketStatus === 'error' ? 'Connection failed' : 'Offline'}</strong>
                  </div>
                )}

                <div className="flex-grow-1 p-3 p-md-4 overflow-auto" style={styles.messageArea}>
                  {messages.map((msg) => (
                    <div key={msg.id} className={`d-flex mb-2 ${msg.isMe ? 'justify-content-end' : 'justify-content-start'}`}>
                      <div style={{ ...styles.messageBubble, backgroundColor: msg.isMe ? '#d9fdd3' : '#ffffff' }}>
                        {!msg.isMe && <small className="d-block fw-bold text-success mb-1">{msg.sender}</small>}

                        {msg.fileType === 'image' && msg.fileUrl && (
                          <img src={optimizeImage(msg.fileUrl)} alt="upload" loading="lazy" style={{ maxWidth: '100%', borderRadius: '6px', marginBottom: 4 }} />
                        )}
                        {msg.fileType === 'file' && msg.fileUrl && (
                          <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="d-flex align-items-center gap-1 mb-1">
                            <FileText size={16} /> Download file
                          </a>
                        )}

                        {msg.text && <p className="m-0 text-dark" style={{ wordBreak: 'break-word' }}>{msg.text}</p>}
                        <span className="d-block text-end text-muted mt-1" style={{ fontSize: '0.75em' }}>{msg.time}</span>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div className="p-2 p-md-3" style={styles.inputContainer}>
                  <form onSubmit={handleSendMessage} className="d-flex gap-2 align-items-center">
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                    <button
                      type="button"
                      className="btn btn-outline-secondary d-flex align-items-center justify-content-center"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      style={{ width: '38px', height: '38px' }}
                    >
                      {uploading ? <Loader2 size={18} className="spin-icon" /> : <Paperclip size={18} />}
                    </button>
                    <input
                      type="text"
                      placeholder="Type a message"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      className="form-control"
                      style={styles.chatInputField}
                    />
                    <button type="submit" className="btn text-white px-3" style={{ backgroundColor: '#00a884' }}>Send</button>
                  </form>
                </div>
              </>
            ) : (
              <div className="d-flex flex-column justify-content-center align-items-center h-100" style={styles.splashScreen}>
                <MessageCircle size={64} color="#00a884" strokeWidth={1.5} />
                <h4 className="mt-3 text-dark">WhatsApp Web Clone</h4>
                <p className="text-muted text-center max-width-300">
                  Select a chat from the list, or start a new one.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {showNewChat && (
        <div style={styles.modalOverlay} onClick={() => setShowNewChat(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="m-0 fw-bold">Start a new chat</h6>
              <button className="btn btn-sm btn-light d-flex align-items-center justify-content-center" onClick={() => setShowNewChat(false)} style={{ width: '30px', height: '30px' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {allUsers.length === 0 && <div className="text-muted text-center p-3">No other users found.</div>}
              {allUsers.map((u) => (
                <div key={u.id} style={styles.userListItem} onClick={() => startChatWith(u)}>
                  <div style={styles.privateAvatar}>
                    <User size={20} color="#667781" />
                  </div>
                  <div className="ms-3 flex-grow-1">
                    <div className="fw-bold text-dark">{u.full_name || u.email}</div>
                    <small className={u.is_online ? 'text-success' : 'text-muted'}>
                      {u.is_online ? 'online' : 'offline'}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  dashboardContainer: { height: '100vh', backgroundColor: '#f0f2f5', fontFamily: 'Segoe UI, Helvetica Neue, Arial, sans-serif', overflow: 'hidden', position: 'relative' },
  sidebar: { borderRight: '1px solid #e1e9eb', backgroundColor: '#ffffff', height: '100%', display: 'flex', flexDirection: 'column' },
  sidebarMobile: { height: '100vh' },
  sidebarHeader: { backgroundColor: '#f0f2f5', borderBottom: '1px solid #e1e9eb' },
  avatarPlaceholder: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#00a884', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' },
  searchBoxContainer: { backgroundColor: '#fff', borderBottom: '1px solid #f0f2f5' },
  searchInput: { backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px' },
  chatListItem: { display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f2f5', transition: 'background-color 0.2s' },
  privateAvatar: { width: '45px', height: '45px', borderRadius: '50%', backgroundColor: '#e9edef', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  groupAvatar: { width: '45px', height: '45px', borderRadius: '50%', backgroundColor: '#cfe2ff', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#00a884', border: '2px solid #fff' },
  chatTime: { fontSize: '0.8rem', color: '#667781' },
  lastMessageText: { fontSize: '0.85rem', color: '#667781', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' },
  chatWindow: { backgroundColor: '#efeae2' },
  chatHeader: { backgroundColor: '#f0f2f5', borderBottom: '1px solid #e1e9eb' },
  connectionBanner: { padding: '10px 14px', backgroundColor: '#fff3cd', color: '#7a4a00', borderBottom: '1px solid #ffe69c', fontSize: '0.9rem' },
  connectionBannerError: { backgroundColor: '#f8d7da', color: '#842029', borderBottom: '1px solid #f1aeb5' },
  backButton: { border: 'none', backgroundColor: 'transparent', padding: '0 8px' },
  messageArea: { backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' },
  messageBubble: { padding: '8px 12px', borderRadius: '8px', maxWidth: '75%', boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)' },
  inputContainer: { backgroundColor: '#f0f2f5' },
  chatInputField: { border: 'none', borderRadius: '8px', padding: '10px 15px' },
  splashScreen: { backgroundColor: '#f8f9fa', borderLeft: '1px solid #e1e9eb' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalCard: { backgroundColor: '#fff', borderRadius: '10px', padding: '20px', width: '90%', maxWidth: '380px', maxHeight: '80vh' },
  userListItem: { display: 'flex', alignItems: 'center', padding: '10px 8px', cursor: 'pointer', borderRadius: '6px' },
};

export default Dashboard;