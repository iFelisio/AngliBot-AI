import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ThemeColor, User, Dialogue, Suggestion, Proficiency, Goal, LoginEvent, AnimationMedia } from './types';
import { translateText, chatWithAI, processContent } from './services/geminiService';
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
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [configStatus, setConfigStatus] = useState<any>(null);
  const location = useLocation();

  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    // Initial fetch
    const fetchData = async () => {
      try {
        const me = await safeFetch('/api/auth/me');
        if (me.ok) {
          setCurrentUser(me.data);
          localStorage.setItem('anglibot_user', JSON.stringify(me.data));
        }

        const [users, dialogues, animations, suggestions, logs, config] = await Promise.all([
          safeFetch('/api/users'),
          safeFetch('/api/dialogues'),
          safeFetch('/api/animations'),
          safeFetch('/api/suggestions'),
          safeFetch('/api/logs'),
          safeFetch('/api/config/status')
        ]);

        if (users.ok) setAllUsers(users.data);
        if (dialogues.ok) setDialogues(dialogues.data);
        if (animations.ok) setAnimations(animations.data);
        if (suggestions.ok) setSuggestions(suggestions.data);
        if (logs.ok) setLoginLogs(logs.data);
        if (config.ok) setConfigStatus(config.data);
        
        // If any critical ones failed with non-auth errors
        const criticalErrors = [me, config].filter(r => !r.ok && r.status !== 401);
        if (criticalErrors.length > 0) {
          setGlobalError(`Gabim në rrjet: ${criticalErrors[0].data.error || 'Dështim i panjohur'}`);
        }
      } catch (e: any) {
        console.error("Error fetching initial data", e);
        setGlobalError(`Gabim në rrjet: ${e.message || 'Dështim i panjohur'}`);
      }
    };

    fetchData();
  }, []);

  const safeFetch = async (url: string, options?: RequestInit) => {
    const res = await fetch(url, { ...options, credentials: 'include' });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { error: text || res.statusText || 'Gabim i panjohur' };
    }
    return { ok: res.ok, status: res.status, data };
  };

  const addPoints = async (pts: number) => {
    if (!currentUser) return;
    const newPoints = (currentUser.points || 0) + pts;
    const res = await safeFetch(`/api/users/${currentUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: newPoints })
    });
    if (res.ok) {
      const updated = res.data;
      setCurrentUser(updated);
    }
  };

  const isDarkTheme = theme === 'dark' || (theme === 'default' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const isConfigured = configStatus && configStatus.GEMINI_API_KEY;

  if (globalError) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${isDarkTheme ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-black'}`}>
        <div className={`max-w-md w-full p-10 rounded-[32px] shadow-2xl border transition-all duration-500 ${isDarkTheme ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-white'}`}>
          <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-exclamation-triangle text-2xl"></i>
          </div>
          <h1 className="text-2xl font-black mb-2 tracking-tight text-center">Ndjesë!</h1>
          <p className="text-zinc-500 mb-8 text-sm font-medium leading-relaxed text-center">{globalError}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full bg-black text-white py-5 rounded-2xl font-bold hover:bg-zinc-800 active:scale-[0.98] transition-all shadow-xl shadow-black/10 mt-4"
          >
            Rifresko Faqen
          </button>
        </div>
      </div>
    );
  }

  if (configStatus && !isConfigured) {
    return <SetupRequiredView configStatus={configStatus} isDark={isDarkTheme} />;
  }

  if (!currentUser) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${isDarkTheme ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-black'}`}>
        <div className={`max-w-md w-full p-10 rounded-[32px] shadow-2xl border transition-all duration-500 ${isDarkTheme ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-white'}`}>
          <div className="flex justify-center mb-6">
            <AngliBotLogo className="w-16 h-16" />
          </div>
          <h1 className="text-3xl font-black mb-2 tracking-tight text-center">AngliBot AI</h1>
          <p className="text-zinc-500 mb-8 text-sm font-medium leading-relaxed text-center">Duke hapur aplikacionin...</p>
          <div className="flex justify-center">
            <i className="fas fa-circle-notch animate-spin text-4xl text-indigo-500"></i>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen overflow-hidden font-sans transition-colors duration-300 ${isDarkTheme ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`}>
      {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${isDarkTheme ? 'bg-zinc-900/50 border-r border-zinc-800' : 'bg-white/80 border-r border-zinc-200'} backdrop-blur-xl`}>
          <div className="flex flex-col h-full p-6">
            <div className="flex items-center justify-between mb-10 px-2">
              <div className="flex items-center gap-3">
                <AngliBotLogo />
                <span className="text-xl font-black tracking-tighter">AngliBot AI</span>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            
            <nav className="flex-1 space-y-1">
              <NavLink to="/" icon="language" isDark={isDarkTheme}>Përkthimi</NavLink>
              <NavLink to="/chat" icon="comment-dots" isDark={isDarkTheme}>Bisedo me AI</NavLink>
              <NavLink to="/dialogues" icon="book-open" isDark={isDarkTheme}>Dialogjet</NavLink>
              <NavLink to="/animations" icon="film" isDark={isDarkTheme}>Animacionet</NavLink>
              <NavLink to="/games" icon="gamepad" isDark={isDarkTheme}>Lojërat</NavLink>
              <NavLink to="/leaderboard" icon="trophy" isDark={isDarkTheme}>Renditja</NavLink>
              <NavLink to="/streak" icon="fire" isDark={isDarkTheme}>Streak</NavLink>
              <NavLink to="/suggestions" icon="lightbulb" isDark={isDarkTheme}>Sugjerime</NavLink>
              <NavLink to="/settings" icon="cog" isDark={isDarkTheme}>Cilësimet</NavLink>
              {currentUser.isAdmin && <NavLink to="/admin" icon="user-shield" highlight isDark={isDarkTheme}>Paneli Admin</NavLink>}
            </nav>

            <div className={`mt-auto p-4 rounded-2xl border transition-all ${isDarkTheme ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-100/50 border-zinc-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg">
                  {(currentUser.name || currentUser.displayName || 'U')[0].toUpperCase()}
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-bold truncate">{currentUser.name || currentUser.displayName || 'Përdorues'}</p>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{currentUser.points || 0} XP • {currentUser.streak || 0} DITË</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 relative">
          <header className={`h-16 flex items-center justify-between px-6 lg:px-10 border-b transition-colors ${isDarkTheme ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white/50 border-zinc-200'} backdrop-blur-md z-40`}>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="lg:hidden p-2 text-zinc-500">
              <i className={`fas fa-${isSidebarOpen ? 'times' : 'bars'} text-xl`}></i>
            </button>
            <div className="flex-1 lg:flex-none">
              <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest ml-4 lg:ml-0">
                {location.pathname === '/' ? 'Përkthimi' : 
                 location.pathname.substring(1).charAt(0).toUpperCase() + location.pathname.substring(2)}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <div className={`px-3 py-1.5 rounded-full flex items-center gap-2 border ${isDarkTheme ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-100 border-zinc-200'}`}>
                <i className="fas fa-fire text-orange-500"></i>
                <span className="text-xs font-bold">{currentUser.streak || 0}</span>
              </div>
              <div className={`px-3 py-1.5 rounded-full flex items-center gap-2 border ${isDarkTheme ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-100 border-zinc-200'}`}>
                <i className="fas fa-star text-yellow-500"></i>
                <span className="text-xs font-bold">{currentUser.points || 0} XP</span>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="max-w-3xl mx-auto w-full px-4 py-8 md:px-8">
              <Routes>
                <Route path="/" element={<PerkthimView onTranslate={() => addPoints(5)} isDark={isDarkTheme} />} />
                <Route path="/dialogues" element={<DialoguesView dialogues={dialogues} level={currentUser.proficiency || 'Beginner'} isDark={isDarkTheme} />} />
                <Route path="/animations" element={<AnimationsView animations={animations} isDark={isDarkTheme} />} />
                <Route path="/games" element={<GamesView onWin={addPoints} level={currentUser.proficiency || 'Beginner'} isDark={isDarkTheme} />} />
                <Route path="/leaderboard" element={<LeaderboardView users={allUsers} isDark={isDarkTheme} />} />
                <Route path="/chat" element={<ChatView level={currentUser.proficiency || 'Beginner'} isDark={isDarkTheme} />} />
                <Route path="/streak" element={<StreakView user={currentUser} isDark={isDarkTheme} />} />
                <Route path="/suggestions" element={<SuggestionsView suggestions={suggestions} onAdd={async text => {
                  await safeFetch('/api/suggestions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.id, userName: currentUser.name || currentUser.displayName || 'Përdorues', text })
                  });
                }} isDark={isDarkTheme} />} />
                <Route path="/settings" element={<SettingsView currentTheme={theme} onThemeChange={setTheme} isDark={isDarkTheme} />} />
                {currentUser.isAdmin && (
                  <Route path="/admin" element={
                    <AdminLoginWrapper isDark={isDarkTheme}>
                      <AdminView 
                        users={allUsers} 
                        suggestions={suggestions} 
                        loginLogs={loginLogs} 
                        dialogues={dialogues} 
                        animations={animations} 
                        onDialogueAdd={async d => { await safeFetch('/api/dialogues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }); }} 
                        onDialogueRemove={async id => { await safeFetch(`/api/dialogues/${id}`, { method: 'DELETE' }); }} 
                        onClearDialogues={async () => { for (const d of dialogues) { await safeFetch(`/api/dialogues/${d.id}`, { method: 'DELETE' }); } }}
                        onAnimationAdd={async a => { await safeFetch('/api/animations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) }); }} 
                        onAnimationRemove={async id => { await safeFetch(`/api/animations/${id}`, { method: 'DELETE' }); }} 
                        onMakeAdmin={async id => { await safeFetch(`/api/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isAdmin: true }) }); }} 
                        onRespondSuggestion={async (id, msg) => { await safeFetch(`/api/suggestions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminResponse: msg }) }); }} 
                        onClearLogs={async () => { await safeFetch('/api/logs', { method: 'DELETE' }); }} 
                        onDeleteUser={async id => { await safeFetch(`/api/users/${id}`, { method: 'DELETE' }); }} 
                        onClearScoreboard={async () => { for (const u of allUsers) { if (u.points > 0) { await safeFetch(`/api/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points: 0 }) }); } } }} 
                        onResetUserScore={async id => { await safeFetch(`/api/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points: 0 }) }); }} 
                        isDark={isDarkTheme} 
                      />
                    </AdminLoginWrapper>
                  } />
                )}
              </Routes>
            </div>
          </div>

          {/* AI Assistant Toggle */}
          <button 
            onClick={() => setIsAssistantOpen(!isAssistantOpen)}
            className={`fixed bottom-8 right-8 w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-500 z-50 ${isAssistantOpen ? 'bg-red-500 rotate-45' : 'bg-black hover:scale-110 active:scale-95'}`}
          >
            <i className={`fas fa-${isAssistantOpen ? 'times' : 'robot'} text-white text-2xl`}></i>
            {!isAssistantOpen && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500"></span>
              </span>
            )}
          </button>

          {/* AI Assistant Panel */}
          <div className={`fixed bottom-28 right-8 w-[90vw] md:w-[400px] h-[600px] rounded-[32px] shadow-2xl border transition-all duration-500 z-50 overflow-hidden flex flex-col ${isAssistantOpen ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-20 opacity-0 scale-90 pointer-events-none'} ${isDarkTheme ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
            <div className="p-6 border-b flex items-center justify-between bg-black text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <i className="fas fa-robot text-xl"></i>
                </div>
                <div>
                  <h3 className="font-bold">Asistenti AI</h3>
                  <p className="text-[10px] uppercase tracking-widest opacity-60">Gati për të ndihmuar</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatView level={currentUser.proficiency || 'Beginner'} isDark={isDarkTheme} embedded />
            </div>
          </div>
        </main>
      </div>
  );
};

// --- Views ---

const SetupRequiredView: React.FC<{ configStatus: any; isDark: boolean }> = ({ configStatus, isDark }) => {
  const missingKeys = Object.entries(configStatus)
    .filter(([key, value]) => !value && ['GEMINI_API_KEY', 'SESSION_SECRET'].includes(key))
    .map(([key]) => key);

  if (missingKeys.length === 0) return null;

  return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-black'}`}>
      <div className={`max-w-2xl w-full p-10 rounded-[40px] shadow-2xl border transition-all duration-500 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-white'}`}>
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-2xl">
            <i className="fas fa-tools"></i>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Konfigurimi i Nevojshëm</h1>
            <p className="text-zinc-500 font-medium">Ju lutem plotësoni variablat e mëposhtme në AI Studio.</p>
          </div>
        </div>

        <div className="space-y-4 mb-10">
          {Object.entries(configStatus).map(([key, isSet]) => (
            <div key={key} className={`p-5 rounded-2xl border flex items-center justify-between ${isSet ? 'bg-emerald-50/50 border-emerald-100' : 'bg-red-50/50 border-red-100'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSet ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                  <i className={`fas fa-${isSet ? 'check' : 'times'}`}></i>
                </div>
                <div>
                  <code className="text-sm font-bold">{key}</code>
                  <p className="text-[10px] uppercase tracking-widest opacity-60 mt-0.5">
                    {key === 'SESSION_SECRET' && 'Një tekst i rastësishëm për sigurinë'}
                    {key === 'GEMINI_API_KEY' && 'Çelësi i AI nga Google AI Studio'}
                  </p>
                </div>
              </div>
              {!isSet && <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Mungon</span>}
            </div>
          ))}
        </div>

        <div className={`p-6 rounded-3xl mb-8 ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <i className="fas fa-info-circle text-indigo-500"></i> Si t'i shtoni?
          </h3>
          <ol className="text-sm space-y-3 font-medium text-zinc-600 list-decimal pl-5">
            <li>Shkoni te menyja <strong>Settings</strong> (ikona e ingranazhit) në AI Studio.</li>
            <li>Zgjidhni <strong>Secrets</strong>.</li>
            <li>Shtoni çdo variabël të mësipërm me emrin dhe vlerën e duhur.</li>
            <li>Rifreskoni këtë faqe pasi t'i keni shtuar të gjitha.</li>
          </ol>
        </div>

        <button 
          onClick={() => window.location.reload()}
          className="w-full bg-black text-white py-5 rounded-2xl font-bold shadow-xl hover:bg-zinc-800 active:scale-[0.98] transition-all"
        >
          Rifresko Faqen
        </button>
      </div>
    </div>
  );
};

const PerkthimView: React.FC<{ onTranslate: () => void; isDark: boolean }> = ({ onTranslate, isDark }) => {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTranslate = async () => {
    if (!text.trim()) return;
    setLoading(true);
    const res = await translateText(text, true);
    setResult(res);
    setLoading(false);
    onTranslate();
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-black mb-3 tracking-tight">Përkthe & Mëso</h1>
        <p className="text-zinc-500 font-medium">Shkruani në shqip dhe AI do ta kthejë në anglisht me shpjegime.</p>
      </div>

      <div className={`p-8 rounded-[32px] shadow-xl border transition-all ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-white'}`}>
        <textarea 
          className={`w-full h-40 p-6 rounded-2xl outline-none text-lg font-medium resize-none transition-all ${isDark ? 'bg-zinc-800/50 text-white placeholder-zinc-600 focus:bg-zinc-800' : 'bg-zinc-50 text-black placeholder-zinc-400 focus:bg-zinc-100'}`}
          placeholder="Shkruaj fjalinë këtu..."
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <button 
          onClick={handleTranslate}
          disabled={loading}
          className={`w-full mt-6 py-5 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-[0.98] ${loading ? 'bg-zinc-400' : 'bg-black hover:bg-zinc-800 shadow-black/10'}`}
        >
          {loading ? <i className="fas fa-circle-notch animate-spin mr-2"></i> : <i className="fas fa-magic mr-2"></i>}
          Përkthe me AI
        </button>
      </div>

      {result && (
        <div className={`p-8 rounded-[32px] shadow-xl border animate-in zoom-in-95 duration-500 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-white'}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white text-xs">
              <i className="fas fa-check"></i>
            </div>
            <h3 className="font-bold text-lg">Rezultati</h3>
          </div>
          <div className={`prose max-w-none ${isDark ? 'prose-invert' : ''}`}>
            <div className="whitespace-pre-wrap font-medium leading-relaxed opacity-90">{result}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const DialoguesView: React.FC<{ dialogues: Dialogue[]; level: Proficiency; isDark: boolean }> = ({ dialogues, level, isDark }) => {
  const [selected, setSelected] = useState<Dialogue | null>(null);
  const filtered = dialogues.filter(d => d.level === level);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Dialogjet</h1>
          <p className="text-zinc-500 font-medium">Praktikoni bisedat për nivelin {level}.</p>
        </div>
        <div className={`px-4 py-2 rounded-xl text-xs font-bold ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>
          {filtered.length} Dialogje
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(d => (
          <button 
            key={d.id} 
            onClick={() => setSelected(d)}
            className={`p-6 rounded-[28px] text-left border transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl ${isDark ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800' : 'bg-white border-white hover:border-zinc-100'}`}
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4">
              <i className="fas fa-headphones text-xl"></i>
            </div>
            <h3 className="font-bold text-lg mb-1">{d.title}</h3>
            <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">{d.level}</p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[40px] shadow-2xl p-8 md:p-12 relative ${isDark ? 'bg-zinc-900 text-white' : 'bg-white text-black'}`}>
            <button onClick={() => setSelected(null)} className="absolute top-8 right-8 w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition-colors">
              <i className="fas fa-times"></i>
            </button>
            <h2 className="text-3xl font-black mb-2">{selected.title}</h2>
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-8">{selected.level}</p>
            
            <div className={`p-8 rounded-3xl mb-8 font-medium leading-relaxed text-lg ${isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
              <div className="whitespace-pre-wrap">{selected.content}</div>
            </div>

            {selected.videoData && (
              <div className="mb-8 p-8 rounded-3xl bg-indigo-50 dark:bg-zinc-800/50 border border-indigo-100 dark:border-zinc-700 text-center">
                <i className="fas fa-film text-4xl text-indigo-500 mb-4"></i>
                <h4 className="font-bold mb-4">Shiko Animacionin në Google Drive</h4>
                <a 
                  href={selected.videoData} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg"
                >
                  <i className="fab fa-google-drive"></i> Hap Animacionin
                </a>
              </div>
            )}

            {selected.audioData && (
              <div className="p-8 rounded-3xl bg-emerald-50 dark:bg-zinc-800/50 border border-emerald-100 dark:border-zinc-700 text-center">
                <i className="fas fa-headphones text-4xl text-emerald-500 mb-4"></i>
                <h4 className="font-bold mb-4">Dëgjo Audion në Google Drive</h4>
                <a 
                  href={selected.audioData} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg"
                >
                  <i className="fab fa-google-drive"></i> Hap Audion
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AnimationsView: React.FC<{ animations: AnimationMedia[]; isDark: boolean }> = ({ animations, isDark }) => {
  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Animacionet</h1>
          <p className="text-zinc-500 font-medium">Shikoni animacionet tona edukative.</p>
        </div>
        <div className={`px-4 py-2 rounded-xl text-xs font-bold ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>
          {animations.length} Animacione
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {animations.map(a => (
          <a 
            key={a.id} 
            href={a.videoData}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-6 rounded-[28px] text-left border transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl flex items-center gap-4 ${isDark ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800' : 'bg-white border-white hover:border-zinc-100'}`}
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <i className="fas fa-film text-xl"></i>
            </div>
            <div>
              <h3 className="font-bold text-lg">{a.title}</h3>
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Hap në Google Drive</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

const GamesView: React.FC<{ onWin: (pts: number) => void; level: Proficiency; isDark: boolean }> = ({ onWin, level, isDark }) => {
  const [activeGame, setActiveGame] = useState<string | null>(null);

  const games = [
    { id: 'wordle', name: 'Wordle', icon: 'font', color: 'bg-emerald-500', desc: 'Gjej fjalën e fshehur me 5 shkronja.' },
    { id: 'hangman', name: 'Hangman', icon: 'skull-crossbones', color: 'bg-red-500', desc: 'Shpëto personazhin duke gjetur shkronjat.' },
    { id: 'sentence', name: 'Sentence Builder', icon: 'align-left', color: 'bg-blue-500', desc: 'Ndërto fjali të sakta gramatikore.' },
    { id: 'scramble', name: 'Word Scramble', icon: 'random', color: 'bg-orange-500', desc: 'Rregullo shkronjat e përziera.' },
    { id: 'memory', name: 'Memory Match', icon: 'th-large', color: 'bg-purple-500', desc: 'Gjej çiftet e fjalëve dhe përkthimet.' },
  ];

  if (activeGame) {
    return (
      <div className="animate-in zoom-in-95 duration-500">
        <button onClick={() => setActiveGame(null)} className="mb-8 flex items-center gap-2 font-bold text-zinc-400 hover:text-black transition-colors">
          <i className="fas fa-arrow-left"></i> Kthehu te Lojërat
        </button>
        {activeGame === 'wordle' && <Wordle onWin={() => onWin(20)} isDark={isDark} />}
        {activeGame === 'hangman' && <Hangman onWin={() => onWin(15)} isDark={isDark} />}
        {activeGame === 'sentence' && <SentenceBuilder onWin={() => onWin(25)} isDark={isDark} />}
        {activeGame === 'scramble' && <WordScramble onWin={() => onWin(10)} isDark={isDark} />}
        {activeGame === 'memory' && <MemoryMatch onWin={() => onWin(30)} isDark={isDark} />}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black mb-3 tracking-tight">Mëso duke Luajtur</h1>
        <p className="text-zinc-500 font-medium">Fitoni pikë (XP) duke përfunduar sfidat e mëposhtme.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {games.map(g => (
          <button 
            key={g.id} 
            onClick={() => setActiveGame(g.id)}
            className={`p-8 rounded-[32px] text-left border transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl hover:shadow-2xl flex gap-6 items-start ${isDark ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800' : 'bg-white border-white hover:border-zinc-100'}`}
          >
            <div className={`w-16 h-16 rounded-2xl ${g.color} flex items-center justify-center text-white text-2xl shadow-lg`}>
              <i className={`fas fa-${g.icon}`}></i>
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-xl mb-2">{g.name}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{g.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

const LeaderboardView: React.FC<{ users: User[]; isDark: boolean }> = ({ users, isDark }) => {
  const sorted = [...users].sort((a, b) => (b.points || 0) - (a.points || 0));

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black mb-3 tracking-tight">Renditja</h1>
        <p className="text-zinc-500 font-medium">Kush janë studentët më aktivë të kësaj jave?</p>
      </div>

      <div className={`rounded-[32px] shadow-2xl border overflow-hidden ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-white'}`}>
        {sorted.map((u, i) => (
          <div key={u.id} className={`flex items-center gap-4 p-6 border-b last:border-0 transition-colors ${isDark ? 'border-zinc-800 hover:bg-zinc-800/50' : 'border-zinc-100 hover:bg-zinc-50'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${i === 0 ? 'bg-yellow-400 text-white' : i === 1 ? 'bg-zinc-300 text-white' : i === 2 ? 'bg-orange-400 text-white' : 'text-zinc-400'}`}>
              {i + 1}
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center font-bold text-zinc-500 shadow-inner">
              {u.name[0]}
            </div>
            <div className="flex-1">
              <p className="font-bold text-lg">{u.name}</p>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{u.streak || 0} DITË STREAK</p>
            </div>
            <div className="text-right">
              <p className="font-black text-xl text-indigo-600">{u.points || 0}</p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">XP TOTALE</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ChatView: React.FC<{ level: Proficiency; isDark: boolean; embedded?: boolean }> = ({ level, isDark, embedded }) => {
  const [messages, setMessages] = useState<{role: string, text: string}[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);
    
    const aiMsg = await chatWithAI(userMsg, level, messages);
    setMessages(prev => [...prev, { role: 'model', text: aiMsg }]);
    setLoading(false);
  };

  return (
    <div className={`flex flex-col h-full ${embedded ? '' : 'animate-in fade-in duration-700'}`}>
      {!embedded && (
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight">Bisedo me AI</h1>
          <p className="text-zinc-500 font-medium">Praktikoni anglishten me asistentin tuaj personal.</p>
        </div>
      )}

      <div className={`flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar ${isDark ? 'bg-zinc-900/30' : 'bg-zinc-50/50'} rounded-[32px] border ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`} ref={scrollRef}>
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-10">
            <div className="w-20 h-20 rounded-[32px] bg-black flex items-center justify-center text-white text-3xl mb-6 shadow-2xl">
              <i className="fas fa-robot"></i>
            </div>
            <h3 className="font-bold text-xl mb-2">Përshëndetje!</h3>
            <p className="text-zinc-500 max-w-xs">Unë jam asistenti juaj i anglishtes. Mund të bisedojmë për çdo gjë që dëshironi.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
            <div className={`max-w-[85%] p-5 rounded-[24px] shadow-sm font-medium leading-relaxed ${m.role === 'user' ? 'bg-black text-white rounded-tr-none' : (isDark ? 'bg-zinc-800 text-white rounded-tl-none' : 'bg-white text-black rounded-tl-none border border-zinc-100')}`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start animate-pulse">
            <div className={`p-5 rounded-[24px] rounded-tl-none ${isDark ? 'bg-zinc-800' : 'bg-white border border-zinc-100'}`}>
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <input 
          className={`flex-1 p-5 rounded-2xl outline-none font-medium shadow-lg transition-all ${isDark ? 'bg-zinc-800 text-white placeholder-zinc-600 focus:bg-zinc-700' : 'bg-white text-black placeholder-zinc-400 focus:bg-zinc-50 border border-zinc-200'}`}
          placeholder="Shkruaj mesazhin..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleSend()}
        />
        <button 
          onClick={handleSend}
          className="w-16 h-16 bg-black text-white rounded-2xl flex items-center justify-center shadow-xl hover:bg-zinc-800 active:scale-95 transition-all"
        >
          <i className="fas fa-paper-plane"></i>
        </button>
      </div>
    </div>
  );
};

const StreakView: React.FC<{ user: User; isDark: boolean }> = ({ user, isDark }) => {
  return (
    <div className="space-y-10 animate-in fade-in duration-700 text-center py-10">
      <div className="relative inline-block">
        <div className="w-48 h-48 rounded-[48px] bg-gradient-to-br from-orange-400 to-red-600 flex items-center justify-center text-white text-7xl shadow-2xl animate-bounce duration-[2000ms]">
          <i className="fas fa-fire"></i>
        </div>
        <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-black text-white flex items-center justify-center font-black text-2xl border-4 border-white shadow-xl">
          {user.streak || 0}
        </div>
      </div>

      <div>
        <h1 className="text-5xl font-black mb-4 tracking-tight">{user.streak || 0} Ditë Streak!</h1>
        <p className="text-xl text-zinc-500 font-medium max-w-md mx-auto leading-relaxed">Vazhdoni punën e shkëlqyer! Mos e lini zjarrin të fiket.</p>
      </div>

      <div className="grid grid-cols-7 gap-3 max-w-md mx-auto pt-10">
        {['H', 'M', 'M', 'E', 'P', 'S', 'D'].map((d, i) => (
          <div key={i} className="space-y-3">
            <div className={`w-full aspect-square rounded-2xl flex items-center justify-center text-xl shadow-inner ${i < (user.streak || 0) % 7 ? 'bg-orange-500 text-white' : (isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-100 text-zinc-300')}`}>
              <i className="fas fa-check-circle"></i>
            </div>
            <p className="text-[10px] font-black text-zinc-400">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const SuggestionsView: React.FC<{ suggestions: Suggestion[]; onAdd: (text: string) => void; isDark: boolean }> = ({ suggestions, onAdd, isDark }) => {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (!text.trim()) return;
    onAdd(text);
    setText('');
    alert("Sugjerimi u dërgua me sukses!");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black mb-3 tracking-tight">Sugjerimet Tuaja</h1>
        <p className="text-zinc-500 font-medium">Na ndihmoni të përmirësojmë AngliBot AI.</p>
      </div>

      <div className={`p-8 rounded-[32px] shadow-xl border transition-all ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-white'}`}>
        <textarea 
          className={`w-full h-32 p-6 rounded-2xl outline-none font-medium resize-none transition-all ${isDark ? 'bg-zinc-800/50 text-white placeholder-zinc-600 focus:bg-zinc-800' : 'bg-zinc-50 text-black placeholder-zinc-400 focus:bg-zinc-100'}`}
          placeholder="Shkruani sugjerimin tuaj këtu..."
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <button 
          onClick={handleSubmit}
          className="w-full mt-6 py-5 bg-black text-white rounded-2xl font-bold shadow-xl active:scale-[0.98] transition-all"
        >
          Dërgo Sugjerimin
        </button>
      </div>

      <div className="space-y-4 pt-10">
        <h3 className="font-bold text-xl mb-6">Sugjerimet e Fundit</h3>
        {suggestions.slice().reverse().map(s => (
          <div key={s.id} className={`p-6 rounded-[28px] border shadow-sm ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
            <div className="flex justify-between items-start mb-3">
              <p className="font-bold">{s.userName}</p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{s.date}</p>
            </div>
            <p className="text-zinc-500 font-medium mb-4">{s.text}</p>
            {s.adminResponse && (
              <div className={`p-4 rounded-2xl border-l-4 border-indigo-500 ${isDark ? 'bg-zinc-800' : 'bg-indigo-50'}`}>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Përgjigjja e Adminit</p>
                <p className="text-sm font-medium">{s.adminResponse}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const SettingsView: React.FC<{ currentTheme: ThemeColor; onThemeChange: (t: ThemeColor) => void; isDark: boolean }> = ({ currentTheme, onThemeChange, isDark }) => {
  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <h1 className="text-3xl font-black tracking-tight mb-10">Cilësimet</h1>

      <div className={`p-8 rounded-[32px] shadow-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-white'}`}>
        <h3 className="font-bold text-lg mb-6 flex items-center gap-3">
          <i className="fas fa-palette text-indigo-500"></i> Tema e Aplikacionit
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button onClick={() => onThemeChange('default')} className={`p-5 rounded-2xl border-2 font-bold transition-all ${currentTheme === 'default' ? 'border-black bg-black text-white' : 'border-zinc-100 hover:border-zinc-200'}`}>Sistemi</button>
          <button onClick={() => onThemeChange('light')} className={`p-5 rounded-2xl border-2 font-bold transition-all ${currentTheme === 'light' ? 'border-black bg-black text-white' : 'border-zinc-100 hover:border-zinc-200'}`}>Dritë</button>
          <button onClick={() => onThemeChange('dark')} className={`p-5 rounded-2xl border-2 font-bold transition-all ${currentTheme === 'dark' ? 'border-black bg-black text-white' : 'border-zinc-100 hover:border-zinc-200'}`}>Errët</button>
        </div>
      </div>

      <div className={`p-8 rounded-[32px] shadow-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-white'}`}>
        <h3 className="font-bold text-lg mb-6 flex items-center gap-3">
          <i className="fas fa-info-circle text-indigo-500"></i> Rreth AngliBot AI
        </h3>
        <p className="text-zinc-500 font-medium leading-relaxed">AngliBot AI është një platformë edukative e krijuar për të ndihmuar studentët shqiptarë të mësojnë anglisht përmes teknologjisë më të fundit të Inteligjencës Artificiale.</p>
        <div className="mt-6 pt-6 border-t border-zinc-100 flex justify-between items-center">
          <span className="text-xs font-bold text-zinc-400">Versioni 2.0.0 (Full-Stack)</span>
          <div className="flex gap-4">
            <i className="fab fa-instagram text-zinc-400 hover:text-black cursor-pointer"></i>
            <i className="fab fa-facebook text-zinc-400 hover:text-black cursor-pointer"></i>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminLoginWrapper: React.FC<{ children: React.ReactNode; isDark: boolean }> = ({ children, isDark }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        const user = await res.json();
        localStorage.setItem('anglibot_user', JSON.stringify(user));
        setIsAuthenticated(true);
        setError('');
        window.location.reload();
      } else {
        const data = await res.json();
        setError(data.error || 'Kredencialet e gabuara');
      }
    } catch (err) {
      setError('Gabim në lidhje me serverin');
    }
  };

  return (
    <div className={`flex items-center justify-center h-full ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`}>
      <div className={`p-8 rounded-2xl shadow-xl w-full max-w-md ${isDark ? 'bg-zinc-900 border border-zinc-800' : 'bg-white border border-zinc-200'}`}>
        <h2 className="text-2xl font-black mb-6 text-center">Hyrja e Administratorit</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-2">Përdoruesi</label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              className={`w-full p-3 rounded-xl border focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${isDark ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-zinc-50 border-zinc-300 text-black'}`}
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-2">Fjalëkalimi</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className={`w-full p-3 rounded-xl border focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${isDark ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-zinc-50 border-zinc-300 text-black'}`}
            />
          </div>
          {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
          <button type="submit" className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors">
            Hyr
          </button>
        </form>
      </div>
    </div>
  );
};

const AdminView: React.FC<{ 
  users: User[]; 
  suggestions: Suggestion[]; 
  loginLogs: LoginEvent[]; 
  dialogues: Dialogue[]; 
  animations: AnimationMedia[];
  onDialogueAdd: (d: Dialogue) => Promise<void>; 
  onDialogueRemove: (id: string) => Promise<void>; 
  onClearDialogues: () => Promise<void>;
  onAnimationAdd: (a: AnimationMedia) => Promise<void>; 
  onAnimationRemove: (id: string) => Promise<void>; 
  onMakeAdmin: (id: string) => Promise<void>; 
  onRespondSuggestion: (id: string, msg: string) => Promise<void>; 
  onClearLogs: () => Promise<void>; 
  onDeleteUser: (id: string) => Promise<void>; 
  onClearScoreboard: () => Promise<void>; 
  onResetUserScore: (id: string) => Promise<void>; 
  isDark: boolean 
}> = ({ 
  users, 
  suggestions, 
  loginLogs, 
  dialogues, 
  animations,
  onDialogueAdd, 
  onDialogueRemove, 
  onClearDialogues, 
  onAnimationAdd, 
  onAnimationRemove, 
  onMakeAdmin, 
  onRespondSuggestion, 
  onClearLogs, 
  onDeleteUser, 
  onClearScoreboard, 
  onResetUserScore, 
  isDark 
}) => {
  const [tab, setTab] = useState('users');
  const [newD, setNewD] = useState({ title: '', content: '', level: 'Beginner' as Proficiency, audioData: '', videoData: '' });
  const [newAnim, setNewAnim] = useState({ title: '', videoData: '' });
  
  const [isUploading, setIsUploading] = useState(false);

  const handlePublishDialogue = async () => {
    setIsUploading(true);
    try {
      await onDialogueAdd({ 
        id: Date.now().toString(), 
        ...newD, 
        addedBy: 'Admin' 
      });
      
      setNewD({title:'', content:'', level:'Beginner', audioData:'', videoData:''}); 
      alert("U publikua me sukses!");
    } catch (error: any) {
      console.error("Error adding dialogue:", error);
      alert(`Gabim: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handlePublishAnimation = async () => {
    setIsUploading(true);
    try {
      await onAnimationAdd({ 
        id: Date.now().toString(), 
        ...newAnim, 
        addedBy: 'Admin' 
      });
      
      setNewAnim({title:'', videoData:''}); 
      alert("Animacioni u publikua me sukses!");
    } catch (error: any) {
      console.error("Error adding animation:", error);
      alert(`Gabim: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap gap-4 border-b pb-2">
        <button onClick={() => setTab('users')} className={`font-bold ${tab === 'users' ? 'text-black' : 'text-gray-400'}`}>Studentët</button>
        <button onClick={() => setTab('scoreboard')} className={`font-bold ${tab === 'scoreboard' ? 'text-black' : 'text-gray-400'}`}>Renditja</button>
        <button onClick={() => setTab('dialogues')} className={`font-bold ${tab === 'dialogues' ? 'text-black' : 'text-gray-400'}`}>Dialogjet</button>
        <button onClick={() => setTab('animations')} className={`font-bold ${tab === 'animations' ? 'text-black' : 'text-gray-400'}`}>Animacionet</button>
        <button onClick={() => setTab('logs')} className={`font-bold ${tab === 'logs' ? 'text-black' : 'text-gray-400'}`}>Logjet</button>
      </div>
      {tab === 'users' && users.map(u => (
        <div key={u.id} className="flex justify-between items-center p-4 border rounded-2xl mb-2">
          <div><p className="font-bold">{u.name}</p><p className="text-xs text-gray-400">{u.isAdmin ? "Administrator" : "Student"}</p></div>
          <div className="flex gap-2">
            {!u.isAdmin && <button onClick={() => onMakeAdmin(u.id)} className="bg-black text-white px-4 py-2 rounded-xl text-xs font-bold">Bëje Admin</button>}
            {!u.isAdmin && <button onClick={() => { if(window.confirm(`Jeni i sigurt që doni të fshini studentin ${u.name}?`)) onDeleteUser(u.id); }} className="bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold">Fshi Studentin</button>}
          </div>
        </div>
      ))}
      {tab === 'scoreboard' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg">Menaxho Renditjen</h3>
            <button 
              onClick={() => { if(window.confirm('Jeni i sigurt që doni të pastroni të gjithë renditjen (të gjithë do të kenë 0 pikë)?')) onClearScoreboard(); }} 
              className="bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold"
            >
              Pastro Renditjen
            </button>
          </div>
          {users.filter(u => u.points > 0).sort((a,b) => b.points - a.points).map(u => (
            <div key={u.id} className="flex justify-between items-center p-4 border rounded-2xl mb-2">
              <div><p className="font-bold">{u.name}</p><p className="text-xs text-gray-400">{u.points} XP</p></div>
              <button onClick={() => { if(window.confirm(`Jeni i sigurt që doni të fshini pikët e ${u.name}?`)) onResetUserScore(u.id); }} className="bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold">Pastro Pikët</button>
            </div>
          ))}
        </div>
      )}
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
              <label className="block text-xs font-bold mb-1">Linku i Audios (Google Drive)</label>
              <input className="w-full p-4 border rounded-2xl outline-none" placeholder="https://drive.google.com/..." value={newD.audioData} onChange={e => setNewD({...newD, audioData: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Linku i Animacionit (Google Drive)</label>
              <input className="w-full p-4 border rounded-2xl outline-none" placeholder="https://drive.google.com/..." value={newD.videoData} onChange={e => setNewD({...newD, videoData: e.target.value})} />
            </div>
            <button 
              onClick={handlePublishDialogue} 
              disabled={isUploading}
              className={`w-full py-4 text-white rounded-2xl font-bold transition-all ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-black active:scale-95'}`}
            >
              {isUploading ? `Duke ngarkuar...` : 'Publiko Dialogun'}
            </button>
          </div>
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Dialogjet Ekzistuese</h3>
              <button 
                onClick={() => { if(window.confirm('Jeni i sigurt që doni të fshini TË GJITHA dialogjet?')) onClearDialogues(); }} 
                className="bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg hover:bg-red-700 transition-colors"
              >
                Pastro të Gjitha
              </button>
            </div>
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
              <label className="block text-xs font-bold mb-1">Linku i Animacionit (Google Drive)</label>
              <input className="w-full p-4 border rounded-2xl outline-none" placeholder="https://drive.google.com/..." value={newAnim.videoData} onChange={e => setNewAnim({...newAnim, videoData: e.target.value})} />
            </div>
            <button 
              onClick={handlePublishAnimation} 
              disabled={isUploading}
              className={`w-full py-4 text-white rounded-2xl font-bold transition-all ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-black active:scale-95'}`}
            >
              {isUploading ? `Duke ngarkuar...` : 'Publiko Animacionin'}
            </button>
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
      {tab === 'logs' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg">Historiku i Logimeve</h3>
            <button 
              onClick={() => { if(window.confirm('Jeni i sigurt që doni të pastroni të gjithë historikun e logimeve?')) onClearLogs(); }} 
              className="bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold"
            >
              Pastro Historikun
            </button>
          </div>
          {loginLogs.slice(0, 50).map(l => (
            <div key={l.id} className="text-xs p-2 border-b"><b>{l.userName}</b> hyri në {new Date(l.timestamp).toLocaleString()}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default App;
