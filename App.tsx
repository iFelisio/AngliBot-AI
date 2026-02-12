
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ThemeColor, User, Dialogue, Suggestion, Proficiency, Goal, LoginEvent } from './types';
import { translateText, chatWithAI } from './services/geminiService';
import { Wordle, Hangman, SentenceBuilder, WordScramble, MemoryMatch } from './components/Games';

// Custom Logo Component: White feather on black background
const AngliBotLogo: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <div className={`${className} bg-black rounded-xl flex items-center justify-center overflow-hidden shadow-lg border border-zinc-800`}>
    <svg viewBox="0 0 100 100" className="w-3/4 h-3/4" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path 
        d="M50 10C50 10 25 40 25 65C25 80 36.1929 90 50 90C63.8071 90 75 80 75 65C75 40 50 10 50 10Z" 
        fill="white" 
      />
      <path d="M50 15V85" stroke="black" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
      <path d="M50 30L35 45M50 45L65 60M50 60L35 75M50 40L62 50" stroke="black" strokeWidth="1" opacity="0.1" />
    </svg>
  </div>
);

const INITIAL_DIALOGUES: Dialogue[] = [
  { id: '1', title: 'Daily Greetings', content: 'A: Hello! How are you?\nB: I am fine, thank you.', addedBy: 'Admin', level: 'Beginner' },
  { id: '2', title: 'Business Strategy', content: 'A: Let\'s review the quarterly results.\nB: Certainly, the growth is steady.', addedBy: 'Admin', level: 'Advanced' }
];

const PREDEFINED_ADMINS: User[] = [
  { id: 'admin-main', name: 'Admin', isAdmin: true, password: '123admin', streak: 1, lastLogin: new Date().toISOString(), points: 0, badges: [] },
];

const NavLink: React.FC<{ to: string; icon: string; children: React.ReactNode; highlight?: boolean; onClick?: () => void; isDark?: boolean }> = ({ to, icon, children, highlight, onClick, isDark }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  const activeClass = isDark ? 'bg-zinc-800 text-white shadow-lg' : 'bg-white/50 text-black shadow-sm backdrop-blur-sm';
  const inactiveClass = isDark ? 'text-zinc-400 hover:bg-zinc-800 hover:text-white' : 'text-gray-600 hover:bg-white/30 hover:text-black';
  
  return (
    <Link 
      to={to} 
      onClick={onClick}
      className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
        isActive ? activeClass : inactiveClass
      } ${highlight ? 'text-indigo-600 font-semibold' : ''}`}
    >
      <i className={`fas fa-${icon} w-5 text-center text-sm ${isActive ? (isDark ? 'text-white' : 'text-black') : (isDark ? 'text-zinc-500' : 'text-gray-500')} group-hover:${isDark ? 'text-white' : 'text-black'}`}></i>
      <span className="text-[14px] font-medium">{children}</span>
    </Link>
  );
};

const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeColor>('default');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [dialogues, setDialogues] = useState<Dialogue[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginEvent[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Persistence: Load data from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('app_theme') as ThemeColor;
    if (savedTheme) setTheme(savedTheme);

    const storedUsers = JSON.parse(localStorage.getItem('app_users') || '[]');
    // Ensure predefined admins exist
    const mergedUsers = [...storedUsers];
    PREDEFINED_ADMINS.forEach(admin => {
      if (!mergedUsers.find(u => u.name.toLowerCase() === admin.name.toLowerCase())) {
        mergedUsers.push(admin);
      }
    });
    setAllUsers(mergedUsers);

    const storedDialogues = localStorage.getItem('app_dialogues');
    setDialogues(storedDialogues ? JSON.parse(storedDialogues) : INITIAL_DIALOGUES);
    
    setSuggestions(JSON.parse(localStorage.getItem('app_suggestions') || '[]'));
    setLoginLogs(JSON.parse(localStorage.getItem('app_login_logs') || '[]'));

    const persistedUser = localStorage.getItem('current_user');
    if (persistedUser) {
      const user = JSON.parse(persistedUser);
      // Re-link with allUsers to get latest data (points, streak, admin status)
      const latestUser = mergedUsers.find((u: User) => u.id === user.id);
      if (latestUser) setCurrentUser(latestUser);
      else setCurrentUser(user);
    }
  }, []);

  // Persistence: Save data to localStorage whenever states change
  useEffect(() => {
    localStorage.setItem('app_theme', theme);
    localStorage.setItem('app_users', JSON.stringify(allUsers));
    localStorage.setItem('app_dialogues', JSON.stringify(dialogues));
    localStorage.setItem('app_suggestions', JSON.stringify(suggestions));
    localStorage.setItem('app_login_logs', JSON.stringify(loginLogs));
    if (currentUser) {
      localStorage.setItem('current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('current_user');
    }
  }, [theme, allUsers, dialogues, suggestions, currentUser, loginLogs]);

  const login = (data: { name: string; password?: string }) => {
    const user = allUsers.find(u => u.name.toLowerCase() === data.name.toLowerCase());

    if (!user) {
      // Auto-register new students on first login
      const newUser: User = { 
        id: Date.now().toString(), 
        name: data.name, 
        password: data.password || 'student123',
        isAdmin: false, 
        streak: 1, 
        lastLogin: new Date().toISOString(),
        points: 0,
        badges: [],
      };
      setAllUsers(prev => [...prev, newUser]);
      setCurrentUser(newUser);
      
      const logEvent: LoginEvent = { id: Date.now().toString(), userId: newUser.id, userName: newUser.name, timestamp: newUser.lastLogin };
      setLoginLogs(prev => [logEvent, ...prev]);
      return;
    }

    if (user.password && user.password !== data.password) {
      alert("Fjalëkalim i pasaktë.");
      return;
    }

    const today = new Date().toDateString();
    const updatedUser = { ...user, lastLogin: new Date().toISOString() };
    
    // Streak logic: check if the last login was yesterday
    const lastLoginDate = new Date(user.lastLogin);
    const diffTime = Math.abs(new Date().getTime() - lastLoginDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (today !== lastLoginDate.toDateString()) {
      if (diffDays === 1) {
        updatedUser.streak += 1;
      } else if (diffDays > 1) {
        updatedUser.streak = 1; // Reset streak if missed more than 1 day
      }
    }

    setAllUsers(allUsers.map(u => u.id === user.id ? updatedUser : u));
    setCurrentUser(updatedUser);
    
    const logEvent: LoginEvent = { id: Date.now().toString(), userId: updatedUser.id, userName: updatedUser.name, timestamp: updatedUser.lastLogin };
    setLoginLogs(prev => [logEvent, ...prev]);
  };

  const handleMakeAdmin = (userId: string, newPassword?: string) => {
    const updatedUsers = allUsers.map(u => 
      u.id === userId ? { ...u, isAdmin: true, password: newPassword || u.password || 'admin123' } : u
    );
    setAllUsers(updatedUsers);
    
    // If the current user is the one being upgraded, update their state too
    if (currentUser && currentUser.id === userId) {
      const updatedMe = updatedUsers.find(u => u.id === userId);
      if (updatedMe) setCurrentUser(updatedMe);
    }
    alert("Përdoruesi u bë Administrator me sukses!");
  };

  const addPoints = (amount: number) => {
    if (!currentUser) return;
    const updated = { ...currentUser, points: currentUser.points + amount };
    if (updated.points >= 100 && !updated.badges.includes('Learner')) updated.badges.push('Learner');
    if (updated.points >= 500 && !updated.badges.includes('Scholar')) updated.badges.push('Scholar');
    if (updated.points >= 1000 && !updated.badges.includes('Master')) updated.badges.push('Master');
    
    setCurrentUser(updated);
    setAllUsers(allUsers.map(u => u.id === updated.id ? updated : u));
  };

  const updateProfile = (proficiency: Proficiency, goal: Goal) => {
    if (!currentUser) return;
    const updated = { ...currentUser, proficiency, goal };
    setCurrentUser(updated);
    setAllUsers(allUsers.map(u => u.id === updated.id ? updated : u));
  };

  const logout = () => {
    setCurrentUser(null);
    setIsSidebarOpen(false);
  };

  const isDarkTheme = theme === 'black';
  const themeBgMap: Record<ThemeColor, string> = {
    default: 'bg-white',
    black: 'bg-zinc-950 text-white',
    blue: 'bg-blue-50',
    red: 'bg-red-50',
    grey: 'bg-gray-100',
    purple: 'bg-purple-50',
    cyan: 'bg-cyan-50',
    orange: 'bg-orange-50',
    green: 'bg-green-50',
    pink: 'bg-pink-50',
    emerald: 'bg-emerald-50',
    amber: 'bg-amber-50',
    rose: 'bg-rose-50'
  };

  if (!currentUser) return <LoginScreen onLogin={login} />;
  if (!currentUser.proficiency && !currentUser.isAdmin) return <ProfileSetup onSave={updateProfile} />;

  const SidebarContent = () => (
    <div className={`flex flex-col h-full ${isDarkTheme ? 'bg-zinc-900 border-zinc-800' : 'bg-black/5 border-black/5'}`}>
      <div className="p-3">
        <Link to="/" onClick={() => setIsSidebarOpen(false)} className={`flex items-center gap-3 w-full px-3 py-3 rounded-lg border transition-all mb-6 ${isDarkTheme ? 'border-zinc-800 hover:bg-zinc-800 text-white' : 'border-black/10 hover:bg-black/10 text-black'}`}>
          <i className="fas fa-plus text-xs"></i>
          <span className="text-sm font-semibold">Sesion i ri</span>
        </Link>
      </div>
      
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar">
        <div className={`text-[10px] uppercase font-bold px-3 mb-2 tracking-wider ${isDarkTheme ? 'text-zinc-500' : 'text-gray-400'}`}>Shërbimet</div>
        <NavLink to="/" icon="language" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Përkthim</NavLink>
        <NavLink to="/dialogues" icon="book-open" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Dialogje</NavLink>
        <NavLink to="/games" icon="gamepad" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Lojëra</NavLink>
        <NavLink to="/chat" icon="message" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>AngliBot AI</NavLink>

        <div className={`text-[10px] uppercase font-bold px-3 mt-6 mb-2 tracking-wider ${isDarkTheme ? 'text-zinc-500' : 'text-gray-400'}`}>Statistikat</div>
        <NavLink to="/leaderboard" icon="trophy" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Renditja</NavLink>
        <NavLink to="/streak" icon="bolt" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Streak</NavLink>
        <NavLink to="/suggestions" icon="lightbulb" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Sugjerime</NavLink>

        {currentUser.isAdmin && (
          <>
            <div className="text-[10px] uppercase font-bold text-indigo-500 px-3 mt-6 mb-2 tracking-wider">Admin</div>
            <NavLink to="/admin" icon="shield-halved" highlight isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Admin Panel</NavLink>
          </>
        )}
      </nav>

      <div className={`p-3 border-t ${isDarkTheme ? 'border-zinc-800' : 'border-black/5'}`}>
        <NavLink to="/settings" icon="gear" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Cilësimet</NavLink>
        <div className={`flex items-center gap-3 p-3 mt-2 rounded-lg cursor-pointer transition-all group ${isDarkTheme ? 'hover:bg-zinc-800' : 'hover:bg-black/5'}`} onClick={logout}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkTheme ? 'bg-zinc-800 text-zinc-400' : 'bg-white/50 text-gray-500'}`}>
            <i className="fas fa-arrow-right-from-bracket"></i>
          </div>
          <span className={`text-sm font-medium ${isDarkTheme ? 'text-white' : 'text-black'}`}>Dilni</span>
        </div>
      </div>
    </div>
  );

  return (
    <HashRouter>
      <div className={`flex h-screen overflow-hidden font-sans transition-all duration-500 ${themeBgMap[theme]} ${isDarkTheme ? 'text-white' : 'text-black'}`}>
        <aside className={`w-[260px] flex-shrink-0 flex flex-col hidden md:flex border-r ${isDarkTheme ? 'border-zinc-800' : 'border-black/5'}`}>
          <SidebarContent />
        </aside>

        {isSidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 md:hidden" onClick={() => setIsSidebarOpen(false)}>
            <div className="absolute left-0 top-0 bottom-0 w-[280px] flex flex-col animate-in slide-in-from-left duration-300" onClick={(e) => e.stopPropagation()}>
              <SidebarContent />
            </div>
          </div>
        )}

        <main className="flex-1 flex flex-col relative overflow-hidden">
          <header className={`h-14 border-b flex items-center justify-between px-4 sticky top-0 z-40 backdrop-blur-md ${isDarkTheme ? 'bg-zinc-950/80 border-zinc-800' : 'bg-white/30 border-black/5'}`}>
            <div className="flex items-center gap-4">
              <button onClick={() => setIsSidebarOpen(true)} className={`md:hidden p-2 -ml-2 ${isDarkTheme ? 'text-zinc-400' : 'text-gray-500'}`}>
                <i className="fas fa-bars"></i>
              </button>
              <div className="flex items-center gap-2">
                <AngliBotLogo className="w-8 h-8" />
                <h1 className="font-bold text-sm tracking-tight">AngliBot AI</h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-full border shadow-sm ${isDarkTheme ? 'bg-zinc-900 border-zinc-800' : 'bg-white/80 border-black/5'}`}>
                <div className="flex items-center gap-1.5">
                  <i className="fas fa-star text-yellow-500 text-[10px]"></i>
                  <span className="text-[11px] font-bold">{currentUser.points}</span>
                </div>
                <div className={`w-px h-3 ${isDarkTheme ? 'bg-zinc-700' : 'bg-gray-300'}`}></div>
                <div className="flex items-center gap-1.5">
                  <i className="fas fa-fire text-orange-500 text-[10px]"></i>
                  <span className="text-[11px] font-bold">{currentUser.streak}</span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold ring-2 ring-white/20">
                {currentUser.name[0].toUpperCase()}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="max-w-3xl mx-auto w-full px-4 py-8 md:px-8">
              <Routes>
                <Route path="/" element={<PerkthimView onTranslate={() => addPoints(5)} isDark={isDarkTheme} />} />
                <Route path="/dialogues" element={<DialoguesView dialogues={dialogues} level={currentUser.proficiency || 'Beginner'} isDark={isDarkTheme} />} />
                <Route path="/games" element={<GamesView onWin={addPoints} level={currentUser.proficiency || 'Beginner'} isDark={isDarkTheme} />} />
                <Route path="/leaderboard" element={<LeaderboardView users={allUsers} isDark={isDarkTheme} />} />
                <Route path="/chat" element={<ChatView level={currentUser.proficiency || 'Beginner'} isDark={isDarkTheme} />} />
                <Route path="/streak" element={<StreakView user={currentUser} isDark={isDarkTheme} />} />
                <Route path="/suggestions" element={<SuggestionsView suggestions={suggestions} onAdd={(text) => {
                  setSuggestions([...suggestions, { id: Date.now().toString(), userId: currentUser.id, userName: currentUser.name, text, date: new Date().toLocaleDateString() }]);
                }} isDark={isDarkTheme} />} />
                <Route path="/settings" element={<SettingsView currentTheme={theme} onThemeChange={setTheme} isDark={isDarkTheme} />} />
                {currentUser.isAdmin && (
                  <Route path="/admin" element={
                    <AdminView 
                      users={allUsers} 
                      suggestions={suggestions} 
                      loginLogs={loginLogs}
                      onDialogueAdd={(d) => setDialogues([...dialogues, d])}
                      onMakeAdmin={handleMakeAdmin}
                      onRespondSuggestion={(id, msg) => setSuggestions(suggestions.map(s => s.id === id ? {...s, adminResponse: msg} : s))}
                      isDark={isDarkTheme}
                    />
                  } />
                )}
              </Routes>
            </div>
          </div>
        </main>
      </div>
    </HashRouter>
  );
};

// --- Auth Components ---

const LoginScreen: React.FC<{ onLogin: (d: any) => void }> = ({ onLogin }) => {
  const [formData, setFormData] = useState({ name: '', password: '' });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.password) {
      alert("Ju lutem plotësoni të gjitha fushat.");
      return;
    }
    onLogin(formData);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-black">
      <div className="w-full max-w-[320px] space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="text-center">
          <AngliBotLogo className="w-24 h-24 mx-auto mb-6 drop-shadow-xl" />
          <h1 className="text-2xl font-black tracking-tight mb-2">AngliBot AI</h1>
          <p className="text-[#6e6e73] text-sm font-medium">Hyr në llogarinë tënde</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Përdoruesi</label>
            <input 
              type="text" 
              placeholder="Shkruani emrin" 
              className="w-full px-4 py-3.5 border border-[#d2d2d7] rounded-2xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black text-sm transition-all" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Fjalëkalimi</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              className="w-full px-4 py-3.5 border border-[#d2d2d7] rounded-2xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black text-sm transition-all" 
              value={formData.password} 
              onChange={e => setFormData({...formData, password: e.target.value})} 
            />
          </div>
          <button type="submit" className="w-full bg-black text-white py-4 rounded-2xl font-bold hover:opacity-90 transition-all text-sm mt-4 shadow-xl active:scale-95">Hyr në Platformë</button>
        </form>
        <div className="text-center">
          <p className="text-[11px] text-gray-400 leading-relaxed italic">
            Admin: Admin / 123admin<br/>Studentët regjistrohen vetë në hyrjen e parë.
          </p>
        </div>
      </div>
    </div>
  );
};

const ProfileSetup: React.FC<{ onSave: (p: Proficiency, g: Goal) => void }> = ({ onSave }) => {
  const [p, setP] = useState<Proficiency>('Beginner');
  const [g, setG] = useState<Goal>('Conversational');
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 text-black">
      <div className="max-w-sm w-full space-y-10 animate-in fade-in slide-in-from-bottom-4">
        <div className="text-center">
          <h2 className="text-3xl font-black tracking-tight mb-2">Mirësevini!</h2>
          <p className="text-[#6e6e73] text-sm font-medium">Konfiguroni profilin tuaj të mësimit</p>
        </div>
        <div className="space-y-8">
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase text-[#86868b] tracking-wider px-1">Niveli juaj aktual</label>
            <div className="grid grid-cols-1 gap-2">
              {['Beginner', 'Intermediate', 'Advanced'].map(lvl => (
                <button key={lvl} onClick={() => setP(lvl as Proficiency)} className={`py-3.5 px-5 rounded-2xl border text-sm font-bold text-left transition-all flex items-center justify-between ${p === lvl ? 'bg-black text-white border-black shadow-lg scale-102' : 'bg-gray-50 border-transparent hover:border-black'}`}>
                  {lvl === 'Beginner' ? 'Fillestar' : lvl === 'Intermediate' ? 'Mesatar' : 'I Avancuar'}
                  {p === lvl && <i className="fas fa-check text-xs"></i>}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase text-[#86868b] tracking-wider px-1">Pse po mësoni Anglisht?</label>
            <div className="grid grid-cols-1 gap-2">
              {[
                { id: 'Conversational', label: 'Bisedë e përditshme' },
                { id: 'Business', label: 'Për punë / Biznes' },
                { id: 'Exam Prep', label: 'Përgatitje për provime' },
                { id: 'Travel', label: 'Për udhëtime' }
              ].map(goal => (
                <button key={goal.id} onClick={() => setG(goal.id as Goal)} className={`py-3.5 px-5 rounded-2xl border text-sm font-bold text-left transition-all flex items-center justify-between ${g === goal.id ? 'bg-black text-white border-black shadow-lg scale-102' : 'bg-gray-50 border-transparent hover:border-black'}`}>
                  {goal.label}
                  {g === goal.id && <i className="fas fa-check text-xs"></i>}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => onSave(p, g)} className="w-full bg-black text-white py-4 rounded-2xl font-black mt-4 hover:opacity-90 transition-all text-sm shadow-2xl active:scale-95">Fillo Aventurën</button>
        </div>
      </div>
    </div>
  );
};

const PerkthimView: React.FC<{ onTranslate: () => void, isDark?: boolean }> = ({ onTranslate, isDark }) => {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [fromAlb, setFromAlb] = useState(true);

  const handleTranslate = async () => {
    if (!text.trim()) return;
    setLoading(true);
    const res = await translateText(text, fromAlb);
    setResult(res);
    onTranslate();
    setLoading(false);
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto animate-in fade-in duration-500">
      <div className="space-y-2">
        <h2 className="text-3xl font-black tracking-tight">Përkthim</h2>
        <p className={`${isDark ? 'text-zinc-400' : 'text-gray-500'} text-sm font-medium`}>Shpejt dhe saktë midis dy gjuhëve.</p>
      </div>

      <div className={`${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white/80 border-black/5 shadow-xl'} border rounded-3xl overflow-hidden`}>
        <div className={`flex border-b p-4 items-center justify-between ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white/50 border-black/5'}`}>
          <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-500'}`}>{fromAlb ? 'Shqip' : 'Anglisht'}</span>
          <button onClick={() => setFromAlb(!fromAlb)} className={`w-10 h-10 rounded-full transition-all flex items-center justify-center ${isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-600'}`}>
            <i className="fas fa-exchange-alt text-sm"></i>
          </button>
          <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-500'}`}>{fromAlb ? 'Anglisht' : 'Shqip'}</span>
        </div>
        <textarea className={`w-full p-8 h-48 outline-none text-xl font-medium bg-transparent placeholder-zinc-500 resize-none`} placeholder="Shkruani tekstin..." value={text} onChange={e => setText(e.target.value)} />
        <div className={`p-4 border-t flex justify-end ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white/50 border-black/5'}`}>
          <button onClick={handleTranslate} className="bg-black text-white px-8 py-3 rounded-2xl font-black text-sm hover:opacity-90 disabled:opacity-50 transition-all shadow-lg active:scale-95 border border-zinc-700">
            {loading ? <i className="fas fa-circle-notch fa-spin"></i> : 'Përkthe Tani'}
          </button>
        </div>
      </div>

      {result && (
        <div className={`border p-8 rounded-3xl animate-in fade-in slide-in-from-top-4 shadow-2xl ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-black/5'}`}>
          <p className={`text-[10px] uppercase font-black mb-3 tracking-widest ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Rezultati i përkthyer</p>
          <p className="text-3xl font-bold leading-tight tracking-tight">{result}</p>
        </div>
      )}
    </div>
  );
};

const ChatView: React.FC<{ level: Proficiency, isDark?: boolean }> = ({ level, isDark }) => {
  const [messages, setMessages] = useState<{ role: string, text: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input; setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);
    const res = await chatWithAI(msg, level);
    setMessages(prev => [...prev, { role: 'model', text: res }]);
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-2xl mx-auto">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-10 custom-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6 py-20">
            <AngliBotLogo className={`w-20 h-20 opacity-10 animate-pulse ${isDark ? 'invert' : ''}`} />
            <div className="space-y-2">
              <h3 className="text-2xl font-black">AngliBot AI</h3>
              <p className={`max-w-xs text-sm leading-relaxed font-medium ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Mësuesi yt personal i Anglishtes është këtu.</p>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-5 py-2 animate-in fade-in slide-in-from-bottom-2 ${m.role === 'model' ? (isDark ? 'bg-zinc-900/50 -mx-4 px-6 py-10 rounded-3xl border border-zinc-800 shadow-xl' : 'bg-white/60 -mx-4 px-6 py-10 rounded-3xl border border-black/5 shadow-xl') : ''}`}>
             <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-xs shadow-lg ${m.role === 'user' ? 'bg-indigo-600' : 'bg-black ring-2 ring-white/10'}`}>
               {m.role === 'user' ? 'U' : <i className="fas fa-robot"></i>}
             </div>
             <div className="flex-1 text-[16px] font-medium leading-relaxed whitespace-pre-wrap pt-1">
               {m.text}
             </div>
          </div>
        ))}
        {loading && <div className="flex gap-4 p-4 items-center text-[#86868b] text-sm italic animate-pulse">
           <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center text-xs border border-zinc-700"><i className="fas fa-robot"></i></div>
           <span className="font-bold">Duke shkruar...</span>
        </div>}
      </div>

      <div className="mt-8 relative group">
        <div className={`absolute inset-0 blur-3xl transition-all rounded-[2rem] ${isDark ? 'bg-zinc-800/20' : 'bg-black/5'}`}></div>
        <div className={`relative p-3 border rounded-[2rem] shadow-2xl flex items-end gap-3 transition-all ${isDark ? 'bg-zinc-900 border-zinc-800 focus-within:border-zinc-500' : 'bg-white border-black/5 focus-within:border-black'}`}>
          <textarea rows={1} className="flex-1 p-3 bg-transparent outline-none text-[16px] font-medium resize-none max-h-32 min-h-[48px]" placeholder="Pyet diçka..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())} />
          <button onClick={send} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-90 ${input.trim() ? 'bg-black text-white border border-zinc-700' : (isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-gray-100 text-gray-300')}`}>
            <i className="fas fa-arrow-up text-sm"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

const DialoguesView: React.FC<{ dialogues: Dialogue[], level: Proficiency, isDark?: boolean }> = ({ dialogues, level, isDark }) => {
  const [selected, setSelected] = useState<Dialogue | null>(null);
  const [playbackState, setPlaybackState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [currentMode, setCurrentMode] = useState<'audio' | 'ai' | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const filtered = dialogues.filter(d => d.level === level);

  const toggleAudio = (base64: string) => {
    if (currentMode === 'ai') window.speechSynthesis.cancel();
    
    if (audioRef.current && currentMode === 'audio') {
      if (playbackState === 'playing') {
        audioRef.current.pause();
        setPlaybackState('paused');
      } else {
        audioRef.current.play();
        setPlaybackState('playing');
      }
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(base64);
      audioRef.current = audio;
      audio.onended = () => {
        setPlaybackState('idle');
        setCurrentMode(null);
      };
      audio.play();
      setPlaybackState('playing');
      setCurrentMode('audio');
    }
  };

  const toggleAISpeech = (content: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (currentMode === 'ai') {
      if (playbackState === 'playing') {
        window.speechSynthesis.pause();
        setPlaybackState('paused');
      } else if (playbackState === 'paused') {
        window.speechSynthesis.resume();
        setPlaybackState('playing');
      } else {
        startAIPlayback(content);
      }
    } else {
      window.speechSynthesis.cancel();
      startAIPlayback(content);
    }
  };

  const startAIPlayback = (content: string) => {
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = 'en-US';
    utterance.onend = () => {
      setPlaybackState('idle');
      setCurrentMode(null);
    };
    window.speechSynthesis.speak(utterance);
    setPlaybackState('playing');
    setCurrentMode('ai');
  };

  const stopAll = () => {
    if (audioRef.current) audioRef.current.pause();
    window.speechSynthesis.cancel();
    setPlaybackState('idle');
    setCurrentMode(null);
    setSelected(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-12 animate-in fade-in duration-500 pb-10">
      <div className="space-y-2 text-center md:text-left">
        <h2 className="text-3xl font-black tracking-tight">Dialogje Praktike</h2>
        <p className={`${isDark ? 'text-zinc-500' : 'text-gray-500'} text-sm font-medium`}>Niveli yt: <span className="text-indigo-500 font-bold uppercase">{level}</span></p>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {filtered.length === 0 && <p className="text-center py-20 italic text-gray-400">Nuk ka dialogje për këtë nivel akoma.</p>}
        {filtered.map(d => (
          <button key={d.id} onClick={() => setSelected(d)} className={`group p-6 border rounded-3xl transition-all text-left flex justify-between items-center shadow-md hover:scale-[1.02] active:scale-[0.98] ${isDark ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-600' : 'bg-white border-black/5 hover:border-black'}`}>
            <div className="space-y-1">
              <span className="font-black text-lg block">{d.title}</span>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Bisedë e shkurtër</span>
            </div>
            <div className="flex items-center gap-4">
              {d.audioData && <div className="w-10 h-10 bg-indigo-500/10 text-indigo-500 rounded-full flex items-center justify-center"><i className="fas fa-microphone-lines text-xs"></i></div>}
              <i className={`fas fa-chevron-right text-xs ${isDark ? 'text-zinc-700 group-hover:text-white' : 'text-gray-300 group-hover:text-black'}`}></i>
            </div>
          </button>
        ))}
      </div>
      {selected && (
        <div className={`fixed inset-0 flex items-center justify-center p-4 z-50 animate-in zoom-in duration-300 ${isDark ? 'bg-zinc-950/95' : 'bg-white/95'} backdrop-blur-xl`}>
          <div className="w-full max-w-lg space-y-10">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <h3 className="text-3xl font-black">{selected.title}</h3>
                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{selected.level}</span>
              </div>
              <button onClick={stopAll} className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm ${isDark ? 'bg-zinc-900 hover:bg-zinc-800' : 'bg-gray-100 hover:bg-gray-200'}`}><i className="fas fa-times"></i></button>
            </div>
            <div className={`p-10 rounded-[2.5rem] font-serif text-2xl leading-relaxed italic border-l-[12px] shadow-2xl relative ${isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-black shadow-black/5'}`}>
              {selected.content}
              {playbackState !== 'idle' && (
                <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-black/5 rounded-full animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">{playbackState === 'playing' ? 'Duke dëgjuar' : 'E ndaluar'}</span>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-5">
              {selected.audioData && (
                <button 
                  onClick={() => toggleAudio(selected.audioData!)} 
                  className={`flex-1 py-5 rounded-2xl font-black text-sm flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all ${currentMode === 'audio' && playbackState === 'playing' ? 'bg-indigo-700' : 'bg-indigo-600'} text-white hover:bg-indigo-700`}
                >
                  {currentMode === 'audio' && playbackState === 'playing' ? (
                    <><i className="fas fa-pause"></i> Ndalo Regjistrimin</>
                  ) : currentMode === 'audio' && playbackState === 'paused' ? (
                    <><i className="fas fa-play"></i> Vazhdo Regjistrimin</>
                  ) : (
                    <><i className="fas fa-play"></i> Dëgjo Regjistrimin</>
                  )}
                </button>
              )}
              <button 
                onClick={() => toggleAISpeech(selected.content)}
                className={`py-5 rounded-2xl font-black text-sm flex items-center justify-center gap-3 shadow-xl hover:opacity-90 active:scale-95 transition-all border border-zinc-700 bg-black text-white ${selected.audioData ? 'px-10' : 'w-full'}`}
              >
                {currentMode === 'ai' && playbackState === 'playing' ? (
                   <><i className="fas fa-pause"></i> Ndalo AI</>
                ) : currentMode === 'ai' && playbackState === 'paused' ? (
                   <><i className="fas fa-play"></i> Vazhdo AI</>
                ) : (
                   <><i className="fas fa-robot"></i> {selected.audioData ? "AI Lexo" : "Dëgjo me AI"}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const LeaderboardView: React.FC<{ users: User[], isDark?: boolean }> = ({ users, isDark }) => {
  const sorted = [...users].sort((a, b) => b.points - a.points);
  return (
    <div className="max-w-xl mx-auto space-y-10 animate-in fade-in duration-500 pb-10">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black tracking-tight">Renditja Botërore</h2>
        <p className="text-sm font-medium text-gray-500">Më të mirët e platformës.</p>
      </div>
      <div className="space-y-3">
        {sorted.map((u, i) => (
          <div key={u.id} className={`flex items-center justify-between p-5 rounded-3xl shadow-sm border transition-all ${isDark ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-600' : 'bg-white border-black/5 hover:scale-102'}`}>
            <div className="flex items-center gap-5">
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : i === 1 ? 'bg-zinc-300 text-black' : i === 2 ? 'bg-orange-300 text-black' : (isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-gray-100 text-gray-400')}`}>{i + 1}</span>
              <div className="flex flex-col">
                <span className="font-black text-sm flex items-center gap-2">
                  {u.name} 
                  {u.isAdmin && <i className="fas fa-shield-halved text-[10px] text-indigo-500" title="Admin"></i>}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Streak: {u.streak}d</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-lg">{u.points}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>XP</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const StreakView: React.FC<{ user: User, isDark?: boolean }> = ({ user, isDark }) => (
  <div className="flex flex-col items-center justify-center py-24 space-y-8 animate-in zoom-in duration-700">
    <div className={`relative w-40 h-40 rounded-[3rem] flex items-center justify-center text-6xl text-orange-500 shadow-2xl transition-all ${isDark ? 'bg-zinc-900' : 'bg-white border border-black/5'}`}>
      <div className="absolute inset-0 bg-orange-500/20 blur-3xl rounded-full animate-pulse"></div>
      <i className="fas fa-fire relative z-10"></i>
    </div>
    <div className="text-center space-y-2">
      <h2 className="text-6xl font-black tracking-tighter">{user.streak} Ditë</h2>
      <p className={`text-lg font-bold ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Vazhdimësia jote është e shkëlqyer!</p>
    </div>
    <div className="flex flex-wrap justify-center gap-3 mt-4">
       {user.badges.length === 0 && <p className="text-xs text-gray-400 italic">Akoma nuk keni fituar distinktivë.</p>}
       {user.badges.map(b => (
         <span key={b} className={`px-5 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all hover:scale-110 ${isDark ? 'bg-zinc-900 text-indigo-400 border-zinc-800' : 'bg-white text-indigo-600 border-indigo-100 shadow-xl shadow-indigo-600/5'}`}>{b}</span>
       ))}
    </div>
  </div>
);

const GamesView: React.FC<{ onWin: (p: number) => void, level: Proficiency, isDark?: boolean }> = ({ onWin, level, isDark }) => {
  const [active, setActive] = useState<string | null>(null);
  
  const games = [
    { id: 'wordle', title: 'Wordle', icon: 'grip', desc: 'Gjej fjalën 5 shkronjëshe', color: 'bg-green-500' },
    { id: 'hangman', title: 'Hangman', icon: 'user-large', desc: 'Mos lejo xhelatin të fitojë', color: 'bg-red-500' },
    { id: 'scramble', title: 'Scramble', icon: 'random', desc: 'Rregullo shkronjat', color: 'bg-orange-500' },
    { id: 'memory', title: 'Memory', icon: 'clone', desc: 'Lidh fjalët e njëjta', color: 'bg-purple-500' },
    { id: 'builder', title: 'Builder', icon: 'puzzle-piece', desc: 'Ndërto fjali të sakta', color: 'bg-indigo-500' }
  ];

  if (active) {
    const renderGame = () => {
      switch(active) {
        case 'wordle': return <Wordle onWin={onWin} level={level} />;
        case 'hangman': return <Hangman onWin={onWin} level={level} />;
        case 'scramble': return <WordScramble onWin={onWin} level={level} />;
        case 'memory': return <MemoryMatch onWin={onWin} level={level} />;
        case 'builder': return <SentenceBuilder onWin={onWin} level={level} />;
        default: return null;
      }
    };

    return (
      <div className="space-y-8 max-w-2xl mx-auto pb-10">
        <button 
          onClick={() => setActive(null)} 
          className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-3 px-4 py-2 rounded-full border transition-all ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-500' : 'bg-white border-black/5 text-gray-500 hover:text-black hover:border-black shadow-sm'}`}
        >
          <i className="fas fa-arrow-left text-[8px]"></i> Kthehu te lojërat
        </button>
        {renderGame()}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-12 animate-in fade-in duration-500 pb-10">
      <div className="space-y-2 text-center md:text-left">
        <h2 className="text-3xl font-black tracking-tight">Lojëra Educative</h2>
        <p className={`${isDark ? 'text-zinc-500' : 'text-gray-500'} text-sm font-medium`}>Mëso fjalë të reja dhe ndërto fjali duke u argëtuar.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
        {games.map(game => (
          <button key={game.id} onClick={() => setActive(game.id)} className={`p-10 border rounded-[2.5rem] transition-all text-center space-y-6 shadow-xl group hover:scale-105 active:scale-95 ${isDark ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-500' : 'bg-white border-black/5 hover:border-black'}`}>
            <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-white text-xl shadow-lg transition-transform group-hover:rotate-12 ${game.color}`}>
               <i className={`fas fa-${game.icon}`}></i>
            </div>
            <div className="space-y-1">
              <p className="font-black text-lg">{game.title}</p>
              <p className={`text-[10px] font-bold uppercase tracking-widest leading-tight ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>{game.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

const SuggestionsView: React.FC<{ suggestions: Suggestion[], onAdd: (t: string) => void, isDark?: boolean }> = ({ suggestions, onAdd, isDark }) => {
  const [text, setText] = useState('');
  return (
    <div className="max-w-2xl mx-auto space-y-12 animate-in fade-in duration-500 pb-10">
      <div className="text-center md:text-left space-y-2">
        <h2 className="text-3xl font-black tracking-tight">Sugjerime</h2>
        <p className="text-sm font-medium text-gray-500">Na trego si mund ta përmirësojmë platformën.</p>
      </div>
      <div className="space-y-4">
        <textarea className={`w-full h-36 p-6 rounded-3xl border outline-none transition-all resize-none shadow-2xl font-medium ${isDark ? 'bg-zinc-900 border-zinc-800 focus:border-zinc-500' : 'bg-white border-black/5 focus:border-black'}`} placeholder="Ideja jote këtu..." value={text} onChange={e => setText(e.target.value)} />
        <button onClick={() => { if(text.trim()){ onAdd(text); setText(''); alert('Faleminderit! Sugjerimi yt u dërgua te administratori.'); } }} className="bg-black text-white px-8 py-4 rounded-2xl font-black text-sm w-full shadow-2xl hover:opacity-90 active:scale-98 transition-all border border-zinc-700">Dërgo Sugjerimin</button>
      </div>
      <div className="space-y-4 pt-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Sugjerimet e fundit</h3>
        {suggestions.length === 0 && <p className="italic text-gray-400 text-sm">Akoma nuk ka sugjerime.</p>}
        {suggestions.map(s => (
          <div key={s.id} className={`p-6 border rounded-3xl text-sm shadow-xl transition-all hover:scale-[1.01] ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-black/5'}`}>
             <div className="font-black mb-2 flex justify-between items-center">
               <span className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] text-white">{s.userName[0]}</div> {s.userName}</span>
               <span className={`text-[9px] font-black tracking-tighter px-2 py-0.5 rounded-full ${isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-gray-50 text-gray-400'}`}>{s.date}</span>
             </div>
             <div className={`leading-relaxed font-medium ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>{s.text}</div>
             {s.adminResponse && <div className={`mt-4 p-4 rounded-2xl text-xs font-bold border-l-4 shadow-inner ${isDark ? 'bg-zinc-800 border-indigo-900 text-zinc-300' : 'bg-indigo-50 border-indigo-600 text-indigo-900'}`}><i className="fas fa-reply mr-2 opacity-50"></i> Mësuesi: {s.adminResponse}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

const SettingsView: React.FC<{ currentTheme: ThemeColor, onThemeChange: (t: ThemeColor) => void, isDark?: boolean }> = ({ currentTheme, onThemeChange, isDark }) => (
  <div className="max-w-2xl mx-auto space-y-12 animate-in fade-in duration-500 pb-10">
    <div className="text-center md:text-left space-y-2">
      <h2 className="text-3xl font-black tracking-tight">Cilësimet</h2>
      <p className="text-sm font-medium text-gray-500">Personalizo pamjen e platformës sate.</p>
    </div>
    <div className={`p-10 rounded-[2.5rem] border shadow-2xl ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-black/5'}`}>
      <h3 className={`text-[10px] font-black uppercase mb-8 tracking-[0.2em] px-2 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Zgjidh Temën Ngjyrë</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
        {[
          { id: 'default', label: 'Drita', color: 'bg-white border-gray-200' },
          { id: 'black', label: 'Errësira', color: 'bg-zinc-950 border-zinc-800 shadow-zinc-950/20 shadow-lg' },
          { id: 'blue', label: 'E Kaltër', color: 'bg-blue-200 border-blue-400 shadow-blue-500/10 shadow-lg' },
          { id: 'red', label: 'E Kuqe', color: 'bg-red-200 border-red-400 shadow-red-500/10 shadow-lg' },
          { id: 'grey', label: 'E Hirtë', color: 'bg-gray-300 border-gray-500' },
          { id: 'purple', label: 'Vjollcë', color: 'bg-purple-200 border-purple-400 shadow-purple-500/10 shadow-lg' },
          { id: 'cyan', label: 'Cyan', color: 'bg-cyan-200 border-cyan-400 shadow-cyan-500/10 shadow-lg' },
          { id: 'orange', label: 'Portokalli', color: 'bg-orange-200 border-orange-400 shadow-orange-500/10 shadow-lg' },
          { id: 'green', label: 'E Gjelbër', color: 'bg-green-200 border-green-400 shadow-green-500/10 shadow-lg' },
          { id: 'pink', label: 'Rozë', color: 'bg-pink-200 border-pink-400 shadow-pink-500/10 shadow-lg' },
          { id: 'emerald', label: 'Smarald', color: 'bg-emerald-200 border-emerald-400 shadow-emerald-500/10 shadow-lg' },
          { id: 'amber', label: 'Amber', color: 'bg-amber-200 border-amber-400 shadow-amber-500/10 shadow-lg' },
          { id: 'rose', label: 'Trendafili', color: 'bg-rose-200 border-rose-400 shadow-rose-500/10 shadow-lg' },
        ].map(t => (
          <button 
            key={t.id} 
            onClick={() => onThemeChange(t.id as ThemeColor)} 
            className={`flex flex-col items-center gap-4 p-5 rounded-3xl border-2 transition-all hover:scale-105 active:scale-95 ${currentTheme === t.id ? 'border-indigo-600 ring-4 ring-indigo-500/10 shadow-2xl' : (isDark ? 'border-zinc-800 bg-zinc-800/20' : 'border-transparent bg-gray-50 hover:bg-gray-100')}`}
          >
            <div className={`w-14 h-14 rounded-full border-4 shadow-inner ${t.color}`}></div>
            <span className={`font-black text-[11px] uppercase tracking-[0.1em] ${currentTheme === t.id ? 'text-indigo-600' : (isDark ? 'text-zinc-500' : 'text-zinc-600')}`}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

const AdminView: React.FC<{ 
  users: User[], 
  suggestions: Suggestion[], 
  loginLogs: LoginEvent[],
  onDialogueAdd: (d: Dialogue) => void,
  onMakeAdmin: (id: string, pass: string) => void,
  onRespondSuggestion: (id: string, msg: string) => void,
  isDark?: boolean
}> = ({ users, suggestions, loginLogs, onDialogueAdd, onMakeAdmin, onRespondSuggestion, isDark }) => {
  const [tab, setTab] = useState('users');
  const [newD, setNewD] = useState({ title: '', content: '', level: 'Beginner' as Proficiency, audioData: '' });
  const [resp, setResp] = useState<{[k: string]: string}>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewD({ ...newD, audioData: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-10 animate-in fade-in duration-500 pb-10">
      <div className={`flex gap-6 border-b transition-all ${isDark ? 'border-zinc-800' : 'border-black/5'} overflow-x-auto whitespace-nowrap custom-scrollbar pb-1`}>
        {['users', 'dialogues', 'suggestions', 'history'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`pb-4 text-[11px] font-black uppercase tracking-[0.2em] transition-all relative ${tab === t ? (isDark ? 'text-white' : 'text-black') : (isDark ? 'text-zinc-600 hover:text-white' : 'text-gray-400 hover:text-black')}`}>
            {t === 'users' ? 'Studentët' : t === 'dialogues' ? 'Dialogjet' : t === 'suggestions' ? 'Sugjerimet' : 'Logjet'}
            {tab === t && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500 rounded-t-full"></div>}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className={`border rounded-[2rem] overflow-hidden shadow-2xl transition-all ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-black/5'}`}>
          <table className="w-full text-left text-sm border-collapse">
            <thead className={`${isDark ? 'bg-zinc-800/50' : 'bg-gray-50'}`}>
              <tr>
                <th className={`p-6 font-black uppercase text-[10px] tracking-widest ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Përdoruesi</th>
                <th className={`p-6 font-black uppercase text-[10px] tracking-widest ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Hyrja e Fundit</th>
                <th className={`p-6 font-black uppercase text-[10px] tracking-widest ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Veprime</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-zinc-800' : 'divide-black/5'}`}>
              {users.map(u => (
                <tr key={u.id} className="hover:bg-indigo-500/5 transition-colors">
                  <td className="p-6">
                    <div className="flex flex-col">
                      <span className="font-black text-sm">{u.name}</span>
                      <span className={`text-[10px] font-bold ${u.isAdmin ? 'text-indigo-400' : 'text-gray-400'}`}>{u.isAdmin ? 'Administrator' : 'Student'}</span>
                    </div>
                  </td>
                  <td className={`p-6 text-xs font-medium ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                    {new Date(u.lastLogin).toLocaleString('sq-AL')}
                  </td>
                  <td className="p-6">
                    {!u.isAdmin && (
                      <button onClick={() => {const p = prompt("Fjalëkalimi i ri për këtë admin:"); if(p) onMakeAdmin(u.id, p)}} className="bg-black text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-zinc-700 hover:scale-105 active:scale-95 transition-all">
                        Bëje Admin
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'dialogues' && (
        <div className={`p-8 rounded-[2.5rem] space-y-6 border shadow-2xl ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-black/5'}`}>
          <div className="space-y-1">
            <h3 className={`font-black text-lg tracking-tight`}>Krijo Përmbajtje të Re</h3>
            <p className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">Shto dialogjet që do të shohin studentët</p>
          </div>
          <div className="space-y-4">
            <input className={`w-full p-5 border rounded-2xl text-sm font-bold outline-none transition-all ${isDark ? 'bg-zinc-800 border-zinc-700 focus:border-zinc-500 text-white' : 'bg-gray-50 border-black/5 focus:border-black'}`} placeholder="Titulli i Dialogut" value={newD.title} onChange={e => setNewD({...newD, title: e.target.value})} />
            <textarea className={`w-full p-6 border rounded-3xl text-sm h-40 resize-none outline-none transition-all font-serif italic ${isDark ? 'bg-zinc-800 border-zinc-700 focus:border-zinc-500 text-white' : 'bg-gray-50 border-black/5 focus:border-black'}`} placeholder="Teksti i Bisedës... (A: / B:)" value={newD.content} onChange={e => setNewD({...newD, content: e.target.value})} />
            <div className="grid grid-cols-2 gap-4">
              <select className={`w-full p-5 border rounded-2xl text-sm font-bold outline-none transition-all ${isDark ? 'bg-zinc-900 border-zinc-700 focus:border-zinc-500 text-white' : 'bg-gray-50 border-black/5 focus:border-black'}`} value={newD.level} onChange={e => setNewD({...newD, level: e.target.value as Proficiency})}>
                <option value="Beginner">Fillestar</option>
                <option value="Intermediate">Mesatar</option>
                <option value="Advanced">I Avancuar</option>
              </select>
              <div className={`relative p-5 border rounded-2xl shadow-inner transition-all ${isDark ? 'bg-zinc-900/50 border-zinc-700' : 'bg-gray-50 border-black/5'}`}>
                <label className={`block text-[9px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Zëri i regjistruar</label>
                <input type="file" accept="audio/*" ref={fileInputRef} onChange={handleAudioUpload} className="w-full text-[10px] font-bold cursor-pointer file:hidden" />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                   {newD.audioData ? <i className="fas fa-check-circle text-green-500"></i> : <i className="fas fa-upload text-gray-300"></i>}
                </div>
              </div>
            </div>
          </div>
          <button onClick={() => { if(newD.title && newD.content){ onDialogueAdd({ id: Date.now().toString(), ...newD, addedBy: 'Admin' }); setNewD({title:'', content:'', level:'Beginner', audioData:''}); if(fileInputRef.current) fileInputRef.current.value = ""; alert("Dialogu u publikua!"); } }} className="bg-black text-white px-8 py-5 rounded-[1.5rem] font-black text-sm w-full shadow-2xl hover:opacity-90 active:scale-95 transition-all border border-zinc-700 uppercase tracking-[0.2em]">Publiko</button>
        </div>
      )}

      {tab === 'suggestions' && (
        <div className="space-y-6">
          {suggestions.length === 0 && <p className={`text-center py-24 text-sm italic border-4 border-dashed rounded-[3rem] ${isDark ? 'text-zinc-600 border-zinc-900' : 'text-gray-300 border-gray-100'}`}>Nuk ka mesazhe.</p>}
          {suggestions.map(s => (
            <div key={s.id} className={`p-8 border rounded-[2.5rem] shadow-2xl transition-all ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-black/5'}`}>
              <div className="flex justify-between items-center mb-5">
                 <p className="text-sm font-black">{s.userName}</p>
                 <span className="text-[10px] font-black text-gray-400">{s.date}</span>
              </div>
              <p className="text-sm mb-6 leading-relaxed">{s.text}</p>
              {!s.adminResponse ? (
                <div className="flex gap-3">
                  <input className={`flex-1 p-4 border rounded-2xl text-xs font-bold outline-none ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50'}`} placeholder="Përgjigju..." value={resp[s.id] || ''} onChange={e => setResp({...resp, [s.id]: e.target.value})} />
                  <button onClick={() => { if(resp[s.id]){ onRespondSuggestion(s.id, resp[s.id]); } }} className="bg-black text-white px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all active:scale-95">Dërgo</button>
                </div>
              ) : (
                <div className="p-4 rounded-2xl text-[11px] font-bold border-l-4 italic bg-indigo-50 border-indigo-500 text-indigo-700">Përgjigjur: {s.adminResponse}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div className={`border rounded-[2rem] overflow-hidden shadow-2xl ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-black/5'}`}>
          <div className="p-6 border-b border-black/5">
            <h3 className="font-black text-sm uppercase tracking-widest">Historiku i Hyrjeve</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Regjistri i aktiviteteve</p>
          </div>
          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead className={`${isDark ? 'bg-zinc-800/50' : 'bg-gray-50'}`}>
                <tr>
                  <th className="p-4 font-black text-[10px] tracking-widest text-gray-400">Përdoruesi</th>
                  <th className="p-4 font-black text-[10px] tracking-widest text-gray-400">Koha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {loginLogs.map(log => (
                  <tr key={log.id} className="hover:bg-indigo-500/5 transition-colors">
                    <td className="p-4 font-bold">{log.userName}</td>
                    <td className="p-4 text-xs font-medium text-gray-500">{new Date(log.timestamp).toLocaleString('sq-AL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
