
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ThemeColor, User, Dialogue, Suggestion, Proficiency, Goal, LoginEvent } from './types';
import { translateText, chatWithAI } from './services/geminiService';
import { Wordle, Hangman, SentenceBuilder, WordScramble, MemoryMatch } from './components/Games';

// Custom Logo Component
const AngliBotLogo: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <div className={`${className} bg-black rounded-xl flex items-center justify-center overflow-hidden shadow-lg border border-zinc-800`}>
    <svg viewBox="0 0 100 100" className="w-3/4 h-3/4" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path 
        d="M50 10C50 10 25 40 25 65C25 80 36.1929 90 50 90C63.8071 90 75 80 75 65C75 40 50 10 50 10Z" 
        fill="white" 
      />
      <path d="M50 15V85" stroke="black" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
    </svg>
  </div>
);

const INITIAL_DIALOGUES: Dialogue[] = [
  { id: '1', title: 'Daily Greetings', content: 'A: Hello! How are you?\nB: I am fine, thank you.', addedBy: 'Admin', level: 'Beginner' },
];

const PREDEFINED_ADMINS: User[] = [
  { id: 'admin-main', name: 'Admin', isAdmin: true, password: '123admin', streak: 1, lastLogin: new Date().toISOString(), points: 0, badges: [] },
];

const NavLink: React.FC<{ to: string; icon: string; children: React.ReactNode; highlight?: boolean; onClick?: () => void; isDark?: boolean }> = ({ to, icon, children, highlight, onClick, isDark }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  const activeClass = isDark ? 'bg-zinc-800 text-white shadow-md' : 'bg-white/50 text-black shadow-sm backdrop-blur-sm';
  const inactiveClass = isDark ? 'text-zinc-400 hover:bg-zinc-800 hover:text-white' : 'text-gray-600 hover:bg-white/30 hover:text-black';
  
  return (
    <Link to={to} onClick={onClick} className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${isActive ? activeClass : inactiveClass} ${highlight ? 'text-indigo-600 font-semibold' : ''}`}>
      <i className={`fas fa-${icon} w-5 text-center text-sm ${isActive ? (isDark ? 'text-white' : 'text-black') : (isDark ? 'text-zinc-500' : 'text-gray-500')}`}></i>
      <span className="text-[14px] font-medium">{children}</span>
    </Link>
  );
};

const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeColor>('default');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [dialogues, setDialogues] = useState<Dialogue[]>([]);
  const [animations, setAnimations] = useState<AnimationMedia[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginEvent[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Persistence: Load on startup
  useEffect(() => {
    const savedTheme = localStorage.getItem('app_theme') as ThemeColor;
    if (savedTheme) setTheme(savedTheme);

    let storedUsers = [];
    try { storedUsers = JSON.parse(localStorage.getItem('app_users') || '[]'); } catch (e) {}
    const mergedUsers = [...storedUsers];
    PREDEFINED_ADMINS.forEach(admin => {
      if (!mergedUsers.find(u => u.name.toLowerCase() === admin.name.toLowerCase())) {
        mergedUsers.push(admin);
      }
    });
    setAllUsers(mergedUsers);

    let parsedDialogues = INITIAL_DIALOGUES;
    try { 
      const storedDialogues = localStorage.getItem('app_dialogues');
      if (storedDialogues) parsedDialogues = JSON.parse(storedDialogues);
    } catch (e) {}
    setDialogues(parsedDialogues);

    let parsedAnimations = [];
    try { parsedAnimations = JSON.parse(localStorage.getItem('app_animations') || '[]'); } catch (e) {}
    setAnimations(parsedAnimations);

    let parsedSuggestions = [];
    try { parsedSuggestions = JSON.parse(localStorage.getItem('app_suggestions') || '[]'); } catch (e) {}
    setSuggestions(parsedSuggestions);

    let parsedLoginLogs = [];
    try { parsedLoginLogs = JSON.parse(localStorage.getItem('app_login_logs') || '[]'); } catch (e) {}
    setLoginLogs(parsedLoginLogs);

    try {
      const persistedUser = localStorage.getItem('current_user');
      if (persistedUser) {
        const user = JSON.parse(persistedUser);
        const latest = mergedUsers.find((u: User) => u.id === user.id);
        if (latest) setCurrentUser(latest);
        else setCurrentUser(user);
      }
    } catch (e) {}
  }, []);

  // Persistence: Save on every state change
  useEffect(() => {
    try {
      localStorage.setItem('app_theme', theme);
      localStorage.setItem('app_users', JSON.stringify(allUsers));
      localStorage.setItem('app_dialogues', JSON.stringify(dialogues));
      localStorage.setItem('app_animations', JSON.stringify(animations));
      localStorage.setItem('app_suggestions', JSON.stringify(suggestions));
      localStorage.setItem('app_login_logs', JSON.stringify(loginLogs));
      if (currentUser) localStorage.setItem('current_user', JSON.stringify(currentUser));
    } catch (e) {
      console.error("Error saving to localStorage (might be full due to large media files):", e);
    }
  }, [theme, allUsers, dialogues, animations, suggestions, currentUser, loginLogs]);

  const login = (data: { name: string; password?: string }) => {
    const user = allUsers.find(u => u.name.toLowerCase() === data.name.toLowerCase());
    if (!user) {
      const newUser: User = { id: Date.now().toString(), name: data.name, password: data.password || 'student123', isAdmin: false, streak: 1, lastLogin: new Date().toISOString(), points: 0, badges: [] };
      setAllUsers(prev => [...prev, newUser]);
      setCurrentUser(newUser);
      setLoginLogs(prev => [{ id: Date.now().toString(), userId: newUser.id, userName: newUser.name, timestamp: newUser.lastLogin }, ...prev]);
      return;
    }
    if (user.password && user.password !== data.password) { alert("Fjalëkalim i pasaktë."); return; }

    const today = new Date().toDateString();
    const updatedUser = { ...user, lastLogin: new Date().toISOString() };
    const lastLoginDate = new Date(user.lastLogin);
    const diffDays = Math.ceil(Math.abs(new Date().getTime() - lastLoginDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (today !== lastLoginDate.toDateString()) {
      if (diffDays === 1) updatedUser.streak += 1;
      else if (diffDays > 1) updatedUser.streak = 1;
    }

    setAllUsers(allUsers.map(u => u.id === user.id ? updatedUser : u));
    setCurrentUser(updatedUser);
    setLoginLogs(prev => [{ id: Date.now().toString(), userId: updatedUser.id, userName: updatedUser.name, timestamp: updatedUser.lastLogin }, ...prev]);
  };

  const handleMakeAdmin = (userId: string, newPassword?: string) => {
    const updated = allUsers.map(u => u.id === userId ? { ...u, isAdmin: true, password: newPassword || u.password || 'admin123' } : u);
    setAllUsers(updated);
    if (currentUser && currentUser.id === userId) {
      const me = updated.find(u => u.id === userId);
      if (me) setCurrentUser(me);
    }
    alert("Përdoruesi tani është Administrator!");
  };

  const addPoints = (amount: number) => {
    if (!currentUser) return;
    const updated = { ...currentUser, points: currentUser.points + amount };
    setCurrentUser(updated);
    setAllUsers(allUsers.map(u => u.id === updated.id ? updated : u));
  };

  const isDarkTheme = theme === 'black';
  const themeBgMap: Record<ThemeColor, string> = {
    default: 'bg-white', black: 'bg-zinc-950 text-white', blue: 'bg-blue-50', red: 'bg-red-50', grey: 'bg-gray-100', purple: 'bg-purple-50',
    cyan: 'bg-cyan-50', orange: 'bg-orange-50', green: 'bg-green-50', pink: 'bg-pink-50', emerald: 'bg-emerald-50', amber: 'bg-amber-50', rose: 'bg-rose-50'
  };

  if (!currentUser) return <LoginScreen onLogin={login} />;
  if (!currentUser.proficiency && !currentUser.isAdmin) return <ProfileSetup onSave={(p, g) => { const u = { ...currentUser, proficiency: p, goal: g }; setCurrentUser(u); setAllUsers(allUsers.map(x => x.id === u.id ? u : x)); }} />;

  const SidebarContent = () => (
    <div className={`flex flex-col h-full ${isDarkTheme ? 'bg-zinc-900 border-zinc-800' : 'bg-black/5 border-black/5'}`}>
      <div className="p-3">
        <Link to="/" onClick={() => setIsSidebarOpen(false)} className={`flex items-center gap-3 w-full px-3 py-3 rounded-lg border transition-all mb-6 ${isDarkTheme ? 'border-zinc-800 hover:bg-zinc-800 text-white' : 'border-black/10 hover:bg-black/10 text-black'}`}>
          <i className="fas fa-plus text-xs"></i>
          <span className="text-sm font-semibold">Sesion i ri</span>
        </Link>
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar">
        <div className="text-[10px] uppercase font-bold px-3 mb-2 tracking-wider text-gray-400">Shërbimet</div>
        <NavLink to="/" icon="language" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Përkthim</NavLink>
        <NavLink to="/dialogues" icon="book-open" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Dialogje</NavLink>
        <NavLink to="/childrens-corner" icon="child" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Këndi i Fëmijëve</NavLink>
        <NavLink to="/games" icon="gamepad" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Lojëra</NavLink>
        <NavLink to="/chat" icon="message" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>AngliBot AI</NavLink>
        <div className="text-[10px] uppercase font-bold px-3 mt-6 mb-2 tracking-wider text-gray-400">Statistikat</div>
        <NavLink to="/leaderboard" icon="trophy" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Renditja</NavLink>
        <NavLink to="/streak" icon="bolt" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Streak</NavLink>
        <NavLink to="/suggestions" icon="lightbulb" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Sugjerime</NavLink>
        {currentUser.isAdmin && (
          <><div className="text-[10px] uppercase font-bold text-indigo-500 px-3 mt-6 mb-2 tracking-wider">Admin</div><NavLink to="/admin" icon="shield-halved" highlight isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Admin Panel</NavLink></>
        )}
      </nav>
      <div className="p-3 border-t border-black/5">
        <NavLink to="/settings" icon="gear" isDark={isDarkTheme} onClick={() => setIsSidebarOpen(false)}>Cilësimet</NavLink>
        <div className="flex items-center gap-3 p-3 mt-2 rounded-lg cursor-pointer transition-all hover:bg-black/5" onClick={() => { localStorage.removeItem('current_user'); setCurrentUser(null); }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/50 text-gray-500"><i className="fas fa-arrow-right-from-bracket"></i></div>
          <span className="text-sm font-medium">Dilni</span>
        </div>
      </div>
    </div>
  );

  return (
    <HashRouter>
      <div className={`flex h-screen overflow-hidden font-sans transition-all duration-500 ${themeBgMap[theme]} ${isDarkTheme ? 'text-white' : 'text-black'}`}>
        <aside className="w-[260px] flex-shrink-0 flex flex-col hidden md:flex border-r border-black/5"><SidebarContent /></aside>
        {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-50 md:hidden" onClick={() => setIsSidebarOpen(false)}><div className="absolute left-0 top-0 bottom-0 w-[280px] flex flex-col" onClick={e => e.stopPropagation()}><SidebarContent /></div></div>}
        <main className="flex-1 flex flex-col relative overflow-hidden">
          <header className={`h-14 border-b flex items-center justify-between px-4 sticky top-0 z-40 backdrop-blur-md ${isDarkTheme ? 'bg-zinc-950/80 border-zinc-800' : 'bg-white/30 border-black/5'}`}>
            <div className="flex items-center gap-4">
              <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2"><i className="fas fa-bars"></i></button>
              <div className="flex items-center gap-2"><AngliBotLogo /><h1 className="font-bold text-sm">AngliBot AI</h1></div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-full border bg-white/80 border-black/5 shadow-sm">
                <div className="flex items-center gap-1.5"><i className="fas fa-star text-yellow-500 text-[10px]"></i><span className="text-[11px] font-bold text-black">{currentUser.points}</span></div>
                <div className="w-px h-3 bg-gray-300"></div>
                <div className="flex items-center gap-1.5"><i className="fas fa-fire text-orange-500 text-[10px]"></i><span className="text-[11px] font-bold text-black">{currentUser.streak}</span></div>
              </div>
              <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold">{currentUser.name[0].toUpperCase()}</div>
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
                <Route path="/suggestions" element={<SuggestionsView suggestions={suggestions} onAdd={text => setSuggestions([...suggestions, { id: Date.now().toString(), userId: currentUser.id, userName: currentUser.name, text, date: new Date().toLocaleDateString() }])} isDark={isDarkTheme} />} />
                <Route path="/settings" element={<SettingsView currentTheme={theme} onThemeChange={setTheme} isDark={isDarkTheme} />} />
                {currentUser.isAdmin && <Route path="/admin" element={<AdminView users={allUsers} suggestions={suggestions} loginLogs={loginLogs} dialogues={dialogues} animations={animations} onDialogueAdd={d => setDialogues([...dialogues, d])} onDialogueRemove={id => setDialogues(dialogues.filter(d => d.id !== id))} onAnimationAdd={a => setAnimations([...animations, a])} onAnimationRemove={id => setAnimations(animations.filter(a => a.id !== id))} onMakeAdmin={handleMakeAdmin} onRespondSuggestion={(id, msg) => setSuggestions(suggestions.map(s => s.id === id ? { ...s, adminResponse: msg } : s))} isDark={isDarkTheme} />} />}
                <Route path="/childrens-corner" element={<ChildrensCornerView animations={animations} isDark={isDarkTheme} />} />
              </Routes>
            </div>
          </div>
        </main>
      </div>
    </HashRouter>
  );
};

const LoginScreen: React.FC<{ onLogin: (d: any) => void }> = ({ onLogin }) => {
  const [formData, setFormData] = useState({ name: '', password: '' });
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-black">
      <div className="w-full max-w-[320px] space-y-8">
        <div className="text-center"><AngliBotLogo className="w-24 h-24 mx-auto mb-6 shadow-2xl" /><h1 className="text-2xl font-black mb-2">AngliBot AI</h1><p className="text-gray-500 text-sm">Hyr në llogari</p></div>
        <form onSubmit={e => { e.preventDefault(); onLogin(formData); }} className="space-y-4">
          <input type="text" placeholder="Emri" className="w-full px-4 py-3.5 border rounded-2xl outline-none focus:border-black text-sm" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
          <input type="password" placeholder="Fjalëkalimi" className="w-full px-4 py-3.5 border rounded-2xl outline-none focus:border-black text-sm" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
          <button type="submit" className="w-full bg-black text-white py-4 rounded-2xl font-bold shadow-xl active:scale-95">Hyr</button>
        </form>
      </div>
    </div>
  );
};

const ProfileSetup: React.FC<{ onSave: (p: Proficiency, g: Goal) => void }> = ({ onSave }) => {
  const [p, setP] = useState<Proficiency>('Beginner');
  const [g, setG] = useState<Goal>('Conversational');
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 text-black">
      <div className="max-w-sm w-full space-y-10">
        <div className="text-center"><h2 className="text-3xl font-black">Mirësevini!</h2><p className="text-gray-500 text-sm">Zgjidh nivelin tënd</p></div>
        <div className="space-y-4">
          {['Beginner', 'Intermediate', 'Advanced'].map(lvl => (
            <button key={lvl} onClick={() => setP(lvl as Proficiency)} className={`w-full py-4 rounded-2xl border text-sm font-bold transition-all ${p === lvl ? 'bg-black text-white' : 'bg-gray-50'}`}>{lvl}</button>
          ))}
          <button onClick={() => onSave(p, g)} className="w-full bg-black text-white py-4 rounded-2xl font-black mt-10 shadow-2xl">Vazhdo</button>
        </div>
      </div>
    </div>
  );
};

const PerkthimView: React.FC<{ onTranslate: () => void, isDark?: boolean }> = ({ onTranslate, isDark }) => {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const handleTranslate = async () => {
    if (!text.trim()) return;
    setLoading(true);
    const res = await translateText(text, true);
    setResult(res);
    onTranslate();
    setLoading(false);
  };
  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <h2 className="text-3xl font-black">Përkthim</h2>
      <div className={`border rounded-3xl p-6 shadow-xl ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white'}`}>
        <textarea className="w-full h-40 bg-transparent outline-none text-xl font-medium resize-none" placeholder="Shkruani këtu..." value={text} onChange={e => setText(e.target.value)} />
        <div className="flex justify-end pt-4"><button onClick={handleTranslate} className="bg-black text-white px-8 py-3 rounded-2xl font-bold">{loading ? "..." : "Përkthe"}</button></div>
      </div>
      {result && <div className={`border p-8 rounded-3xl animate-in fade-in shadow-2xl ${isDark ? 'bg-zinc-800' : 'bg-white'}`}><p className="text-2xl font-bold">{result}</p></div>}
    </div>
  );
};

const ChatView: React.FC<{ level: Proficiency, isDark?: boolean }> = ({ level, isDark }) => {
  const [messages, setMessages] = useState<{ role: string, text: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const send = async () => {
    if (!input.trim()) return;
    const m = input; setInput(''); setMessages(p => [...p, { role: 'user', text: m }]);
    setLoading(true); const r = await chatWithAI(m, level); setMessages(p => [...p, { role: 'model', text: r }]); setLoading(false);
  };
  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      <div className="flex-1 overflow-y-auto space-y-6">
        {messages.map((m, i) => (
          <div key={i} className={`p-4 rounded-2xl max-w-[80%] ${m.role === 'user' ? 'bg-indigo-600 text-white ml-auto' : (isDark ? 'bg-zinc-800' : 'bg-gray-100')}`}>{m.text}</div>
        ))}
        {loading && <div className="p-4 italic text-gray-400">AngliBot po mendon...</div>}
      </div>
      <div className="pt-4 flex gap-2"><input className={`flex-1 p-4 rounded-2xl outline-none ${isDark ? 'bg-zinc-900' : 'bg-gray-100'}`} placeholder="Mesazhi..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} /><button onClick={send} className="bg-black text-white px-6 rounded-2xl">Dërgo</button></div>
    </div>
  );
};

const DialoguesView: React.FC<{ dialogues: Dialogue[], level: Proficiency, isDark?: boolean }> = ({ dialogues, level, isDark }) => {
  const [selectedLevel, setSelectedLevel] = useState<Proficiency | 'All'>('All');
  const [selected, setSelected] = useState<Dialogue | null>(null);
  const filtered = selectedLevel === 'All' ? dialogues : dialogues.filter(d => d.level === selectedLevel);
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-3xl font-black">Dialogje Praktike</h2>
        <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
          {(['All', 'Beginner', 'Intermediate', 'Advanced'] as const).map(l => (
            <button key={l} onClick={() => setSelectedLevel(l)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${selectedLevel === l ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'}`}>
              {l === 'All' ? 'Të gjitha' : l}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4">
        {filtered.length === 0 ? (
          <p className="text-gray-500">Nuk ka dialogje për këtë nivel.</p>
        ) : (
          filtered.map(d => (
            <button key={d.id} onClick={() => setSelected(d)} className={`p-6 rounded-3xl border text-left flex justify-between items-center ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white shadow-md'}`}>
              <div>
                <span className="font-bold text-lg block">{d.title}</span>
                <span className="text-xs text-gray-500">{d.level}</span>
              </div>
              <i className="fas fa-chevron-right"></i>
            </button>
          ))
        )}
      </div>
      {selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-lg p-10 rounded-[3rem] max-h-[90vh] overflow-y-auto ${isDark ? 'bg-zinc-900' : 'bg-white'}`}>
            <div className="flex justify-between items-start mb-6"><h3 className="text-3xl font-black">{selected.title}</h3><button onClick={() => setSelected(null)} className="text-2xl">&times;</button></div>
            <div className="whitespace-pre-wrap font-serif text-xl italic mb-10">{selected.content}</div>
            {selected.videoData && (
              <video controls className="w-full rounded-2xl mb-4 max-h-64 object-cover" src={selected.videoData}>
                Shfletuesi juaj nuk e mbështet videon.
              </video>
            )}
            {selected.audioData && <audio controls className="w-full mb-4" src={selected.audioData} />}
            <button onClick={() => setSelected(null)} className="w-full py-4 bg-black text-white rounded-2xl font-bold">Mbyll</button>
          </div>
        </div>
      )}
    </div>
  );
};

// Fixed GamesView component implementation
const GamesView: React.FC<{ onWin: (pts: number) => void, level: Proficiency, isDark?: boolean }> = ({ onWin, level, isDark }) => {
  const [activeGame, setActiveGame] = useState<string | null>(null);

  const games = [
    { id: 'wordle', name: 'Wordle', icon: 'font', color: 'text-indigo-600', component: Wordle },
    { id: 'hangman', name: 'Hangman', icon: 'skull-crossbones', color: 'text-red-600', component: Hangman },
    { id: 'scramble', name: 'Scramble', icon: 'shuffle', color: 'text-orange-500', component: WordScramble },
    { id: 'memory', name: 'Memory', icon: 'clone', color: 'text-purple-600', component: MemoryMatch },
    { id: 'builder', name: 'Builder', icon: 'align-left', color: 'text-green-600', component: SentenceBuilder },
  ];

  if (activeGame) {
    const game = games.find(g => g.id === activeGame);
    if (!game) return null;
    const GameComp = game.component;
    return (
      <div className="space-y-6">
        <button 
          onClick={() => setActiveGame(null)} 
          className={`flex items-center gap-2 text-sm font-bold opacity-70 hover:opacity-100 transition-all ${isDark ? 'text-white' : 'text-black'}`}
        >
          <i className="fas fa-arrow-left"></i> Kthehu te lojërat
        </button>
        <GameComp onWin={onWin} level={level} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-black">Lojëra</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {games.map(g => (
          <button
            key={g.id}
            onClick={() => setActiveGame(g.id)}
            className={`p-8 rounded-[2.5rem] border text-left transition-all hover:scale-[1.02] shadow-sm hover:shadow-xl ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-black/5'}`}
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${isDark ? 'bg-zinc-800' : 'bg-zinc-50'} ${g.color}`}>
              <i className={`fas fa-${g.icon} text-xl`}></i>
            </div>
            <h3 className="text-xl font-black mb-1">{g.name}</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Luaj tani</p>
          </button>
        ))}
      </div>
    </div>
  );
};

const LeaderboardView: React.FC<{ users: User[], isDark?: boolean }> = ({ users, isDark }) => (
  <div className="space-y-8">
    <h2 className="text-3xl font-black">Renditja</h2>
    {users.sort((a,b) => b.points - a.points).map((u, i) => (
      <div key={u.id} className={`flex items-center justify-between p-6 rounded-3xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white shadow-sm'}`}>
        <div className="flex items-center gap-4"><span className="font-black text-gray-400"># {i+1}</span><span className="font-bold">{u.name} {u.isAdmin && "🛡️"}</span></div>
        <div className="font-black">{u.points} XP</div>
      </div>
    ))}
  </div>
);

const StreakView: React.FC<{ user: User, isDark?: boolean }> = ({ user, isDark }) => (
  <div className="flex flex-col items-center py-20">
    <div className="text-8xl text-orange-500 mb-6"><i className="fas fa-fire animate-bounce"></i></div>
    <h2 className="text-6xl font-black">{user.streak} Ditë</h2>
    <p className="text-gray-500 text-xl font-bold mt-4">Vazhdimësia jote!</p>
  </div>
);

const SettingsView: React.FC<{ currentTheme: ThemeColor, onThemeChange: (t: ThemeColor) => void, isDark?: boolean }> = ({ currentTheme, onThemeChange, isDark }) => (
  <div className="space-y-10">
    <h2 className="text-3xl font-black">Cilësimet</h2>
    <div className={`p-8 rounded-[2.5rem] border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white shadow-xl'}`}>
      <h3 className="font-black text-sm uppercase tracking-widest mb-6">Ngjyra e Platformës</h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
        {[
          { id: 'default', color: 'bg-white' }, { id: 'black', color: 'bg-black' }, { id: 'blue', color: 'bg-blue-400' },
          { id: 'red', color: 'bg-red-400' }, { id: 'cyan', color: 'bg-cyan-400' }, { id: 'purple', color: 'bg-purple-400' },
          { id: 'orange', color: 'bg-orange-400' }, { id: 'green', color: 'bg-green-400' }, { id: 'pink', color: 'bg-pink-400' },
          { id: 'emerald', color: 'bg-emerald-400' }, { id: 'amber', color: 'bg-amber-400' }, { id: 'rose', color: 'bg-rose-400' }
        ].map(t => (
          <button key={t.id} onClick={() => onThemeChange(t.id as ThemeColor)} className={`h-16 rounded-2xl border-2 ${t.color} ${currentTheme === t.id ? 'ring-4 ring-black/10' : 'border-black/5'}`} />
        ))}
      </div>
    </div>
  </div>
);

const SuggestionsView: React.FC<{ suggestions: Suggestion[], onAdd: (t: string) => void, isDark?: boolean }> = ({ suggestions, onAdd, isDark }) => {
  const [text, setText] = useState('');
  return (
    <div className="space-y-10">
      <h2 className="text-3xl font-black">Sugjerime</h2>
      <div className="flex gap-2"><input className={`flex-1 p-4 rounded-2xl outline-none ${isDark ? 'bg-zinc-900' : 'bg-gray-100'}`} placeholder="Ideja jote..." value={text} onChange={e => setText(e.target.value)} /><button onClick={() => { onAdd(text); setText(''); }} className="bg-black text-white px-6 rounded-2xl">Dërgo</button></div>
      {suggestions.map(s => (
        <div key={s.id} className={`p-6 rounded-3xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white shadow-sm'}`}>
          <div className="font-bold mb-2">{s.userName} <span className="text-gray-400 text-[10px] ml-2">{s.date}</span></div>
          <p>{s.text}</p>
          {s.adminResponse && <div className="mt-4 p-4 rounded-2xl bg-indigo-50 border-l-4 border-indigo-600 text-sm italic">Përgjigjja: {s.adminResponse}</div>}
        </div>
      ))}
    </div>
  );
};

const ChildrensCornerView: React.FC<{ animations: AnimationMedia[], isDark?: boolean }> = ({ animations, isDark }) => {
  const [selected, setSelected] = useState<AnimationMedia | null>(null);
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-black">Këndi i Fëmijëve</h2>
      {animations.length === 0 ? (
        <p className="text-gray-500">Nuk ka ende animacione.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {animations.map(a => (
            <button key={a.id} onClick={() => setSelected(a)} className={`p-6 rounded-3xl border text-left flex flex-col justify-between items-start ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white shadow-md'}`}>
              <span className="font-bold text-lg mb-4">{a.title}</span>
              <div className="w-full h-40 bg-gray-200 rounded-xl flex items-center justify-center overflow-hidden relative">
                {a.videoData ? (
                  <>
                    <video src={a.videoData} className="w-full h-full object-cover opacity-60" />
                    <i className="fas fa-play-circle text-5xl text-white absolute drop-shadow-md"></i>
                  </>
                ) : (
                  <i className="fas fa-film text-4xl text-gray-400"></i>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-3xl p-6 rounded-[2rem] ${isDark ? 'bg-zinc-900' : 'bg-white'}`}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-2xl font-black">{selected.title}</h3>
              <button onClick={() => setSelected(null)} className="text-2xl">&times;</button>
            </div>
            <video controls autoPlay className="w-full rounded-xl mb-4 max-h-[60vh] bg-black" src={selected.videoData}>
              Shfletuesi juaj nuk e mbështet videon.
            </video>
            <button onClick={() => setSelected(null)} className="w-full py-3 bg-black text-white rounded-xl font-bold">Mbyll</button>
          </div>
        </div>
      )}
    </div>
  );
};

const AdminView: React.FC<{ users: User[], suggestions: Suggestion[], loginLogs: LoginEvent[], dialogues: Dialogue[], animations: AnimationMedia[], onDialogueAdd: (d: Dialogue) => void, onDialogueRemove: (id: string) => void, onAnimationAdd: (a: AnimationMedia) => void, onAnimationRemove: (id: string) => void, onMakeAdmin: (id: string, p?: string) => void, onRespondSuggestion: (id: string, msg: string) => void, isDark?: boolean }> = ({ users, suggestions, loginLogs, dialogues, animations, onDialogueAdd, onDialogueRemove, onAnimationAdd, onAnimationRemove, onMakeAdmin, onRespondSuggestion, isDark }) => {
  const [tab, setTab] = useState('users');
  const [newD, setNewD] = useState({ title: '', content: '', level: 'Beginner' as Proficiency, audioData: '', videoData: '' });
  const [newAnim, setNewAnim] = useState({ title: '', videoData: '' });
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap gap-4 border-b pb-2">
        <button onClick={() => setTab('users')} className={`font-bold ${tab === 'users' ? 'text-black' : 'text-gray-400'}`}>Studentët</button>
        <button onClick={() => setTab('dialogues')} className={`font-bold ${tab === 'dialogues' ? 'text-black' : 'text-gray-400'}`}>Dialogjet</button>
        <button onClick={() => setTab('animations')} className={`font-bold ${tab === 'animations' ? 'text-black' : 'text-gray-400'}`}>Animacionet</button>
        <button onClick={() => setTab('logs')} className={`font-bold ${tab === 'logs' ? 'text-black' : 'text-gray-400'}`}>Logjet</button>
      </div>
      {tab === 'users' && users.map(u => (
        <div key={u.id} className="flex justify-between items-center p-4 border rounded-2xl mb-2">
          <div><p className="font-bold">{u.name}</p><p className="text-xs text-gray-400">{u.isAdmin ? "Administrator" : "Student"}</p></div>
          {!u.isAdmin && <button onClick={() => onMakeAdmin(u.id)} className="bg-black text-white px-4 py-2 rounded-xl text-xs font-bold">Bëje Admin</button>}
        </div>
      ))}
      {tab === 'dialogues' && (
        <div className="space-y-6">
          <div className="space-y-4 border-b pb-6">
            <h3 className="font-bold text-lg">Shto Dialog të Ri</h3>
            <input className="w-full p-4 border rounded-2xl outline-none" placeholder="Titulli" value={newD.title} onChange={e => setNewD({...newD, title: e.target.value})} />
            <select className="w-full p-4 border rounded-2xl outline-none" value={newD.level} onChange={e => setNewD({...newD, level: e.target.value as Proficiency})}>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
            <textarea className="w-full h-40 p-4 border rounded-2xl outline-none" placeholder="Teksti i bisedës" value={newD.content} onChange={e => setNewD({...newD, content: e.target.value})} />
            <div>
              <label className="block text-xs font-bold mb-1">Audio (Opsionale)</label>
              <input type="file" accept="audio/*" onChange={e => {
                const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onloadend = () => setNewD({...newD, audioData: r.result as string}); r.readAsDataURL(f); }
              }} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Video MP4 (Ngarko Skedar - max 2MB)</label>
              <input type="file" accept="video/mp4,video/*" onChange={e => {
                const f = e.target.files?.[0]; 
                if (f) { 
                  if (f.size > 2 * 1024 * 1024) {
                    alert("Skedari është shumë i madh për t'u ruajtur në shfletues. Ju lutem përdorni një URL ose një skedar më të vogël se 2MB.");
                    e.target.value = '';
                    return;
                  }
                  const r = new FileReader(); 
                  r.onloadend = () => setNewD({...newD, videoData: r.result as string}); 
                  r.readAsDataURL(f); 
                }
              }} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Ose vendosni URL-në e Videos (p.sh. https://.../video.mp4)</label>
              <input className="w-full p-4 border rounded-2xl outline-none text-sm" placeholder="URL e videos" value={newD.videoData.startsWith('http') ? newD.videoData : ''} onChange={e => setNewD({...newD, videoData: e.target.value})} />
            </div>
            <button onClick={() => { onDialogueAdd({ id: Date.now().toString(), ...newD, addedBy: 'Admin' }); setNewD({title:'', content:'', level:'Beginner', audioData:'', videoData:''}); alert("U publikua!"); }} className="w-full py-4 bg-black text-white rounded-2xl font-bold">Publiko Dialogun</button>
          </div>
          <div>
            <h3 className="font-bold text-lg mb-4">Dialogjet Ekzistuese</h3>
            {dialogues.map(d => (
              <div key={d.id} className="flex justify-between items-center p-4 border rounded-2xl mb-2">
                <div><p className="font-bold">{d.title}</p><p className="text-xs text-gray-400">{d.level}</p></div>
                <button onClick={() => { if(window.confirm('Jeni i sigurt që doni ta fshini?')) onDialogueRemove(d.id); }} className="bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold">Fshi</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'animations' && (
        <div className="space-y-6">
          <div className="space-y-4 border-b pb-6">
            <h3 className="font-bold text-lg">Shto Animacion të Ri</h3>
            <input className="w-full p-4 border rounded-2xl outline-none" placeholder="Titulli i Animacionit" value={newAnim.title} onChange={e => setNewAnim({...newAnim, title: e.target.value})} />
            <div>
              <label className="block text-xs font-bold mb-1">Video MP4 (Ngarko Skedar - max 2MB)</label>
              <input type="file" accept="video/mp4,video/*" onChange={e => {
                const f = e.target.files?.[0]; 
                if (f) { 
                  if (f.size > 2 * 1024 * 1024) {
                    alert("Skedari është shumë i madh për t'u ruajtur në shfletues. Ju lutem përdorni një URL ose një skedar më të vogël se 2MB.");
                    e.target.value = '';
                    return;
                  }
                  const r = new FileReader(); 
                  r.onloadend = () => setNewAnim({...newAnim, videoData: r.result as string}); 
                  r.readAsDataURL(f); 
                }
              }} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Ose vendosni URL-në e Videos</label>
              <input className="w-full p-4 border rounded-2xl outline-none text-sm" placeholder="URL e videos" value={newAnim.videoData.startsWith('http') ? newAnim.videoData : ''} onChange={e => setNewAnim({...newAnim, videoData: e.target.value})} />
            </div>
            <button onClick={() => { onAnimationAdd({ id: Date.now().toString(), ...newAnim, addedBy: 'Admin' }); setNewAnim({title:'', videoData:''}); alert("Animacioni u publikua!"); }} className="w-full py-4 bg-black text-white rounded-2xl font-bold">Publiko Animacionin</button>
          </div>
          <div>
            <h3 className="font-bold text-lg mb-4">Animacionet Ekzistuese</h3>
            {animations.map(a => (
              <div key={a.id} className="flex justify-between items-center p-4 border rounded-2xl mb-2">
                <p className="font-bold">{a.title}</p>
                <button onClick={() => { if(window.confirm('Jeni i sigurt që doni ta fshini?')) onAnimationRemove(a.id); }} className="bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold">Fshi</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'logs' && loginLogs.slice(0, 50).map(l => (
        <div key={l.id} className="text-xs p-2 border-b"><b>{l.userName}</b> hyri në {new Date(l.timestamp).toLocaleString()}</div>
      ))}
    </div>
  );
};

export default App;
