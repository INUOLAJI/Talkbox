import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Paperclip, Loader2, Users, User, MessageCircle, ArrowLeft, X, FileText, Camera, UserPlus, Check, MessageSquarePlus, Search, Settings } from 'lucide-react';

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

// Renders a profile picture if one exists, otherwise falls back to the default Lucide icon
const Avatar = ({ url, isGroup, size = 45, iconSize = 20 }) => {
  const containerStyle = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    backgroundColor: isGroup ? '#cfe2ff' : '#e9edef',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  };

  if (url) {
    return (
      <div style={containerStyle}>
        <img src={optimizeImage(url)} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {isGroup ? <Users size={iconSize} color="#4a6da8" /> : <User size={iconSize} color="#667781" />}
    </div>
  );
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
  const [newChatMode, setNewChatMode] = useState('chat');
  const [allUsers, setAllUsers] = useState([]);
  const [chatSearch, setChatSearch] = useState('');
  const [contactIdentifier, setContactIdentifier] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [profileForm, setProfileForm] = useState({
    full_name: user?.full_name || '',
    phone_number: user?.phone_number || '',
    bio: user?.bio || '',
    theme_preference: user?.theme_preference || 'light',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [myAvatarUrl, setMyAvatarUrl] = useState(user?.profile_picture_url || null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [groupAvatarUploading, setGroupAvatarUploading] = useState(false);
  const pendingMessagesRef = useRef([]);
  const wsRef = useRef(null);
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const groupAvatarInputRef = useRef(null);
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

  useEffect(() => {
    setProfileForm({
      full_name: user?.full_name || '',
      phone_number: user?.phone_number || '',
      bio: user?.bio || '',
      theme_preference: user?.theme_preference || 'light',
    });
  }, [user]);

  // Keep unread badges synced with the database
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRooms();
    }, 10000); // poll every 10 seconds

    return () => clearInterval(interval);
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
            ? { ...r, last_message: data.message || (data.file_type === 'image' ? 'Photo' : 'File'), last_message_time: data.timestamp, unread_count: 0 }
            : r
        ));

        // Keep last_read_at fresh so the next poll doesn't show a stale badge on the open chat
        fetch(`${API_BASE}/api/chat/rooms/${activeChat.id}/read/`, {
          method: 'POST',
          credentials: 'include',
        }).catch((err) => console.error('Failed to mark room read:', err));
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

    // Mark this room as read as soon as it's opened, and clear its badge locally
    fetch(`${API_BASE}/api/chat/rooms/${activeChat.id}/read/`, {
      method: 'POST',
      credentials: 'include',
    }).catch((err) => console.error('Failed to mark room read:', err));

    setRooms((prev) => prev.map((r) => (r.id === activeChat.id ? { ...r, unread_count: 0 } : r)));

    return () => socket.close();
  }, [activeChat, flushPendingMessages]);

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

  const handleAvatarUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      alert('Image is too big — max size is 5MB.');
      e.target.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file.');
      e.target.value = '';
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/api/chat/profile/upload/`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) throw new Error('Avatar upload failed');
      const data = await res.json();
      setMyAvatarUrl(data.profile_picture_url);
    } catch (err) {
      console.error(err);
      alert('Could not update profile picture. Try again.');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  }, []);

  const handleGroupAvatarUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file || !activeChat) return;

    if (file.size > MAX_FILE_SIZE) {
      alert('Image is too big — max size is 5MB.');
      e.target.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file.');
      e.target.value = '';
      return;
    }

    setGroupAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/api/chat/rooms/${activeChat.id}/picture/`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) throw new Error('Group picture upload failed');
      const data = await res.json();

      setActiveChat((prev) => ({ ...prev, profile_picture_url: data.profile_picture_url }));
      setRooms((prev) => prev.map((r) =>
        r.id === activeChat.id ? { ...r, profile_picture_url: data.profile_picture_url } : r
      ));
    } catch (err) {
      console.error(err);
      alert('Could not update group picture. Try again.');
    } finally {
      setGroupAvatarUploading(false);
      e.target.value = '';
    }
  }, [activeChat]);

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
      setChatSearch('');
      setContactIdentifier('');
      setContactMessage('');
      setSelectedUserIds([]);
      setGroupName('');
      setNewChatMode('chat');
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
        profile_picture_url: otherUser.profile_picture_url,
      });
    } catch (err) {
      console.error('Failed to start chat:', err);
    }
  };

  const openNewGroup = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/users/`, { credentials: 'include' });
      const data = await res.json();
      setAllUsers(data);
      setChatSearch('');
      setGroupName('');
      setSelectedUserIds([]);
      setNewChatMode('group');
      setShowNewChat(true);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const addContact = async (e) => {
    e.preventDefault();
    if (!contactIdentifier.trim()) return;

    setContactLoading(true);
    setContactMessage('');

    try {
      const res = await fetch(`${API_BASE}/api/chat/contacts/add/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: contactIdentifier.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add contact');

      setShowNewChat(false);
      await fetchRooms();
      setActiveChat({
        id: data.id,
        name: data.name,
        display_name: data.contact?.full_name || data.contact?.email || contactIdentifier,
        is_group: false,
        other_user_id: data.contact?.id,
        profile_picture_url: data.contact?.profile_picture_url,
      });
    } catch (err) {
      setContactMessage(err.message);
    } finally {
      setContactLoading(false);
    }
  };

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileForm((prev) => ({ ...prev, [name]: value }));
  };

  const saveProfileSettings = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMessage('');

    try {
      const res = await fetch(`${API_BASE}/api/chat/profile/`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save settings');

      setProfileMessage('Profile updated');
      if (typeof window !== 'undefined') {
        document.body.dataset.theme = data.theme_preference || 'light';
      }
    } catch (err) {
      setProfileMessage(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const createGroup = async () => {
    const trimmedName = groupName.trim();
    if (!trimmedName || selectedUserIds.length === 0) return;

    setCreatingGroup(true);
    try {
      const res = await fetch(`${API_BASE}/api/chat/rooms/group/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, member_ids: selectedUserIds }),
      });

      if (!res.ok) throw new Error('Failed to create group');
      const room = await res.json();

      setShowNewChat(false);
      await fetchRooms();
      setActiveChat({
        id: room.id,
        name: room.name,
        display_name: room.display_name || trimmedName,
        is_group: true,
        other_user_id: null,
        profile_picture_url: null,
      });
    } catch (err) {
      console.error('Failed to create group:', err);
      alert('Could not create the group. Try again.');
    } finally {
      setCreatingGroup(false);
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
                <div style={{ position: 'relative' }}>
                  <Avatar url={myAvatarUrl} isGroup={false} size={40} iconSize={18} />
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    style={styles.avatarEditBtn}
                    title="Change profile picture"
                  >
                    {avatarUploading ? <Loader2 size={11} className="spin-icon" /> : <Camera size={11} />}
                  </button>
                  <input type="file" ref={avatarInputRef} accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
                </div>
                <div className="fw-bold text-dark">{user?.full_name || 'My Profile'}</div>
              </div>
              <div className="d-flex gap-2 align-items-center">
                <button
                  className="btn btn-sm d-flex align-items-center justify-content-center"
                  onClick={openNewChat}
                  title="New chat"
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#00a884',
                    color: '#fff',
                    border: 'none',
                    boxShadow: '0 2px 8px rgba(0, 168, 132, 0.25)',
                  }}
                >
                  <MessageSquarePlus size={18} />
                </button>
                <button className="btn btn-sm btn-outline-primary" onClick={openNewGroup} title="New group">+ Group</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowSettings(true)} title="Settings">
                  <Settings size={16} />
                </button>
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
                  No chats yet — tap <strong>+ Chat</strong> or <strong>+ Group</strong> to start one.
                </div>
              )}

              {rooms.map((room) => {
                const online = isRoomOnline(room);
                const hasUnread = activeChat?.id !== room.id && room.unread_count > 0;
                return (
                  <div
                    key={room.id}
                    onClick={() => setActiveChat(room)}
                    style={{ ...styles.chatListItem, backgroundColor: activeChat?.id === room.id ? '#f0f2f5' : 'transparent' }}
                  >
                    <div style={{ position: 'relative' }}>
                      <Avatar url={room.profile_picture_url} isGroup={room.is_group} />
                      {online && <span style={styles.onlineDot} />}
                    </div>
                    <div className="flex-grow-1 ms-3">
                      <div className="d-flex justify-content-between">
                        <span className="fw-bold text-dark">{room.display_name}</span>
                        <span style={styles.chatTime}>
                          {room.last_message_time ? new Date(room.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between align-items-center">
                        <div style={{ ...styles.lastMessageText, fontWeight: hasUnread ? 600 : 400, color: hasUnread ? '#111b21' : '#667781' }}>
                          {online ? <span style={{ color: '#00a884' }}>online</span> : room.last_message}
                        </div>
                        {hasUnread && (
                          <span style={styles.unreadBadge}>
                            {room.unread_count > 99 ? '99+' : room.unread_count}
                          </span>
                        )}
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
                    <Avatar url={activeChat.profile_picture_url} isGroup={activeChat.is_group} />
                    {!activeChat.is_group && isRoomOnline(activeChat) && <span style={styles.onlineDot} />}
                    {activeChat.is_group && (
                      <>
                        <button
                          onClick={() => groupAvatarInputRef.current?.click()}
                          disabled={groupAvatarUploading}
                          style={styles.avatarEditBtn}
                          title="Change group picture"
                        >
                          {groupAvatarUploading ? <Loader2 size={11} className="spin-icon" /> : <Camera size={11} />}
                        </button>
                        <input type="file" ref={groupAvatarInputRef} accept="image/*" onChange={handleGroupAvatarUpload} style={{ display: 'none' }} />
                      </>
                    )}
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
                <h4 className="mt-3 text-dark">Talkbox</h4>
                <p className="text-muted text-center max-width-300">
                  Select a chat from the list, or start a new one.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {showSettings && (
        <div style={styles.modalOverlay} onClick={() => setShowSettings(false)}>
          <div style={{ ...styles.modalCard, maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h6 className="m-0 fw-bold">Settings</h6>
                <small className="text-muted">Update your profile and preferences</small>
              </div>
              <button className="btn btn-sm btn-light d-flex align-items-center justify-content-center" onClick={() => setShowSettings(false)} style={{ width: '30px', height: '30px' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={saveProfileSettings}>
              <div className="mb-3">
                <label className="form-label small text-muted">Profile picture</label>
                <div className="d-flex align-items-center gap-3">
                  <Avatar url={myAvatarUrl} isGroup={false} size={56} iconSize={24} />
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => avatarInputRef.current?.click()}>
                    {avatarUploading ? 'Uploading...' : 'Upload photo'}
                  </button>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label small text-muted">Display name</label>
                <input type="text" name="full_name" value={profileForm.full_name} onChange={handleProfileChange} className="form-control form-control-sm" />
              </div>

              <div className="mb-3">
                <label className="form-label small text-muted">Phone number</label>
                <input type="text" name="phone_number" value={profileForm.phone_number} onChange={handleProfileChange} className="form-control form-control-sm" />
              </div>

              <div className="mb-3">
                <label className="form-label small text-muted">Bio</label>
                <textarea name="bio" rows="3" value={profileForm.bio} onChange={handleProfileChange} className="form-control form-control-sm" placeholder="Tell people a little about yourself" />
              </div>

              <div className="mb-3">
                <label className="form-label small text-muted">Theme</label>
                <select name="theme_preference" value={profileForm.theme_preference} onChange={handleProfileChange} className="form-select form-select-sm">
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>

              {profileMessage && <div className={`small mb-2 ${profileMessage === 'Profile updated' ? 'text-success' : 'text-danger'}`}>{profileMessage}</div>}

              <button type="submit" className="btn text-white w-100" disabled={savingProfile} style={{ backgroundColor: '#00a884', borderRadius: '8px' }}>
                {savingProfile ? <Loader2 size={16} className="spin-icon" /> : 'Save settings'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showNewChat && (
        <div style={styles.modalOverlay} onClick={() => setShowNewChat(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h6 className="m-0 fw-bold">{newChatMode === 'group' ? 'New group' : 'New chat'}</h6>
                <small className="text-muted">{newChatMode === 'group' ? 'Create a group conversation' : 'Choose someone to message'}</small>
              </div>
              <button className="btn btn-sm btn-light d-flex align-items-center justify-content-center" onClick={() => setShowNewChat(false)} style={{ width: '30px', height: '30px' }}>
                <X size={16} />
              </button>
            </div>

            <div className="d-flex mb-3" style={{ borderBottom: '1px solid #e9ecef', paddingBottom: '10px' }}>
              <button
                className="btn btn-sm flex-grow-1"
                onClick={() => setNewChatMode('chat')}
                style={{
                  backgroundColor: newChatMode === 'chat' ? '#e7f7f2' : 'transparent',
                  color: newChatMode === 'chat' ? '#00a884' : '#667781',
                  border: 'none',
                  borderRadius: '999px',
                  marginRight: '6px',
                }}
              >
                Chats
              </button>
              <button
                className="btn btn-sm flex-grow-1"
                onClick={() => setNewChatMode('group')}
                style={{
                  backgroundColor: newChatMode === 'group' ? '#e7f7f2' : 'transparent',
                  color: newChatMode === 'group' ? '#00a884' : '#667781',
                  border: 'none',
                  borderRadius: '999px',
                }}
              >
                Groups
              </button>
            </div>

            <div className="position-relative mb-3">
              <Search size={15} color="#8796a1" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                type="text"
                placeholder={newChatMode === 'group' ? 'Search contacts to add' : 'Search contacts'}
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                className="form-control form-control-sm"
                style={{ paddingLeft: '34px', borderRadius: '999px', backgroundColor: '#f0f2f5', border: 'none' }}
              />
            </div>

            {newChatMode === 'chat' ? (
              <>
                <form onSubmit={addContact} className="mb-3">
                  <label className="form-label small text-muted">Add a new contact</label>
                  <div className="d-flex gap-2">
                    <input
                      type="text"
                      value={contactIdentifier}
                      onChange={(e) => setContactIdentifier(e.target.value)}
                      placeholder="Email or phone number"
                      className="form-control form-control-sm"
                      style={{ borderRadius: '8px' }}
                    />
                    <button type="submit" className="btn btn-sm text-white" disabled={contactLoading} style={{ backgroundColor: '#00a884', borderRadius: '8px', whiteSpace: 'nowrap' }}>
                      {contactLoading ? <Loader2 size={14} className="spin-icon" /> : 'Add'}
                    </button>
                  </div>
                  {contactMessage && <div className="mt-2 small text-danger">{contactMessage}</div>}
                </form>

                <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                {allUsers.length === 0 && <div className="text-muted text-center p-3">No conversations yet.</div>}
                {allUsers
                  .filter((u) => {
                    const term = chatSearch.toLowerCase();
                    if (!term) return true;
                    return (u.full_name || u.email || '').toLowerCase().includes(term);
                  })
                  .map((u) => (
                    <div key={u.id} style={styles.userListItem} onClick={() => startChatWith(u)}>
                      <Avatar url={u.profile_picture_url} isGroup={false} />
                      <div className="ms-3 flex-grow-1">
                        <div className="fw-bold text-dark">{u.full_name || u.email}</div>
                        <small className={u.is_online ? 'text-success' : 'text-muted'}>
                          {u.is_online ? 'online' : 'offline'}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Group name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="form-control mb-3"
                  style={{ borderRadius: '8px' }}
                />

                <div className="text-muted mb-2" style={{ fontSize: '0.8rem' }}>
                  Select members ({selectedUserIds.length} selected)
                </div>

                <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '14px' }}>
                  {allUsers.length === 0 && <div className="text-muted text-center p-3">No conversations yet.</div>}
                  {allUsers
                    .filter((u) => {
                      const term = chatSearch.toLowerCase();
                      if (!term) return true;
                      return (u.full_name || u.email || '').toLowerCase().includes(term);
                    })
                    .map((u) => {
                      const selected = selectedUserIds.includes(u.id);
                      return (
                        <div
                          key={u.id}
                          style={{ ...styles.userListItem, backgroundColor: selected ? '#e7f7f2' : 'transparent' }}
                          onClick={() => toggleUserSelection(u.id)}
                        >
                          <Avatar url={u.profile_picture_url} isGroup={false} size={38} iconSize={16} />
                          <div className="ms-3 flex-grow-1">
                            <div className="fw-bold text-dark" style={{ fontSize: '0.9rem' }}>{u.full_name || u.email}</div>
                          </div>
                          <div style={{ ...styles.checkbox, ...(selected ? styles.checkboxChecked : {}) }}>
                            {selected && <Check size={13} color="#fff" />}
                          </div>
                        </div>
                      );
                    })}
                </div>

                <button
                  className="btn text-white w-100 d-flex align-items-center justify-content-center gap-2"
                  style={{ backgroundColor: '#00a884', borderRadius: '8px' }}
                  disabled={!groupName.trim() || selectedUserIds.length === 0 || creatingGroup}
                  onClick={createGroup}
                >
                  {creatingGroup ? <Loader2 size={16} className="spin-icon" /> : null}
                  {creatingGroup ? 'Creating...' : 'Create group'}
                </button>
              </>
            )}
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
  avatarEditBtn: {
    position: 'absolute', bottom: -2, right: -2, width: '18px', height: '18px', borderRadius: '50%',
    backgroundColor: '#00a884', border: '2px solid #f0f2f5', color: '#fff', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer',
  },
  searchBoxContainer: { backgroundColor: '#fff', borderBottom: '1px solid #f0f2f5' },
  searchInput: { backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px' },
  chatListItem: { display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f2f5', transition: 'background-color 0.2s' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#00a884', border: '2px solid #fff' },
  unreadBadge: {
    backgroundColor: '#00a884', color: '#fff', fontSize: '0.72rem', fontWeight: 700, borderRadius: '999px',
    minWidth: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', flexShrink: 0,
  },
  chatTime: { fontSize: '0.8rem', color: '#667781' },
  lastMessageText: { fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' },
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
  modalCard: { backgroundColor: '#fff', borderRadius: '10px', padding: '20px', width: '90%', maxWidth: '380px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' },
  userListItem: { display: 'flex', alignItems: 'center', padding: '10px 8px', cursor: 'pointer', borderRadius: '6px' },
  checkbox: { width: '20px', height: '20px', borderRadius: '5px', border: '2px solid #ced4da', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkboxChecked: { backgroundColor: '#00a884', border: '2px solid #00a884' },
};

export default Dashboard;