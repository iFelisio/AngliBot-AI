
import React, { useState, useEffect } from 'react';
import { generateWord, generateSentence, generateWordPair } from '../services/openaiService';
import { Proficiency } from '../types';

interface GameProps {
  onWin: (points: number) => void;
  level: Proficiency;
}

export const Wordle: React.FC<GameProps> = ({ onWin }) => {
  const [target, setTarget] = useState('');
  const [guess, setGuess] = useState('');
  const [guesses, setGuesses] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'playing' | 'won' | 'lost'>('loading');

  const initGame = async () => {
    setStatus('loading');
    try {
      let word = "";
      let attempts = 0;
      while (word.length !== 5 && attempts < 5) {
        word = await generateWord('easy', 5);
        attempts++;
      }
      if (word.length !== 5) word = "STUDY";
      setTarget(word);
      setGuesses([]);
      setGuess('');
    } finally {
      setStatus('playing');
    }
  };

  useEffect(() => { initGame(); }, []);

  const submitGuess = () => {
    if (guess.length !== 5) return;
    const currentGuess = guess.toUpperCase();
    const newGuesses = [...guesses, currentGuess];
    setGuesses(newGuesses);
    setGuess('');

    if (currentGuess === target) {
      setStatus('won');
      onWin(50);
    } else if (newGuesses.length >= 6) {
      setStatus('lost');
    }
  };

  if (status === 'loading') {
    return <div className="flex justify-center p-12"><i className="fas fa-spinner fa-spin text-4xl text-indigo-500"></i></div>;
  }

  return (
    <div className="flex flex-col items-center space-y-6 p-8 bg-white/90 backdrop-blur rounded-[2.5rem] shadow-2xl border border-black/5 text-gray-900 animate-in fade-in zoom-in duration-500">
      <div className="text-center space-y-1">
        <h2 className="text-3xl font-black tracking-tight text-indigo-600">Wordle English</h2>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Gjej fjalën sekrete me 5 shkronja</p>
      </div>
      
      <div className="grid grid-rows-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => {
          const g = guesses[i] || (i === guesses.length ? guess.padEnd(5, ' ') : '     ');
          return (
            <div key={i} className="flex gap-2">
              {g.split('').map((char, j) => {
                let bg = 'bg-gray-50 border-gray-200';
                let textColor = 'text-gray-800';
                if (guesses[i]) {
                  if (target[j] === char) {
                    bg = 'bg-green-500 border-green-600';
                    textColor = 'text-white';
                  } else if (target.includes(char)) {
                    bg = 'bg-yellow-500 border-yellow-600';
                    textColor = 'text-white';
                  } else {
                    bg = 'bg-gray-400 border-gray-500';
                    textColor = 'text-white';
                  }
                }
                return (
                  <div key={j} className={`w-12 h-12 flex items-center justify-center font-black text-lg border-2 rounded-xl shadow-sm transition-all duration-500 ${bg} ${textColor}`}>
                    {char.trim()}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {status === 'playing' ? (
        <div className="flex gap-3 w-full max-w-xs">
          <input
            maxLength={5}
            autoFocus
            value={guess}
            onChange={(e) => setGuess(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            className="flex-1 border-2 border-gray-200 p-4 rounded-2xl font-black text-center text-xl focus:border-indigo-500 outline-none transition-all shadow-inner"
            placeholder="ABCDE"
            onKeyDown={(e) => e.key === 'Enter' && submitGuess()}
          />
          <button onClick={submitGuess} className="bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black text-sm shadow-xl active:scale-90 transition-all">PROVO</button>
        </div>
      ) : (
        <div className="text-center space-y-4 animate-in slide-in-from-bottom-4 duration-500">
          <div className={`p-4 rounded-2xl font-black ${status === 'won' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {status === 'won' ? 'URIME! +50 PIKË' : `HUMBE! FJALA ISHTE: ${target}`}
          </div>
          <button onClick={initGame} className="bg-black text-white px-10 py-4 rounded-2xl font-black text-sm shadow-2xl hover:opacity-90 active:scale-95 transition-all">LUAJ PËRSËRI</button>
        </div>
      )}
    </div>
  );
};

export const Hangman: React.FC<GameProps> = ({ onWin }) => {
  const [word, setWord] = useState('');
  const [guessed, setGuessed] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [status, setStatus] = useState<'loading' | 'playing'>('loading');

  const initGame = async () => {
    setStatus('loading');
    try {
      const w = await generateWord('medium');
      setWord(w);
      setGuessed([]);
      setMistakes(0);
    } finally {
      setStatus('playing');
    }
  };

  useEffect(() => { initGame(); }, []);

  const guessLetter = (l: string) => {
    if (guessed.includes(l) || mistakes >= 6) return;
    setGuessed([...guessed, l]);
    if (!word.includes(l)) setMistakes(mistakes + 1);
  };

  const isWon = word && word.split('').every(l => guessed.includes(l));
  const isLost = mistakes >= 6;

  useEffect(() => {
    if (isWon) onWin(30);
  }, [isWon]);

  if (status === 'loading') return <div className="flex justify-center p-12"><i className="fas fa-spinner fa-spin text-4xl text-red-500"></i></div>;

  return (
    <div className="flex flex-col items-center space-y-8 p-8 bg-white/90 backdrop-blur rounded-[2.5rem] shadow-2xl border border-black/5 text-gray-900 animate-in fade-in duration-500">
      <div className="text-center space-y-1">
        <h2 className="text-3xl font-black tracking-tight text-red-600">Hangman (Xhelati)</h2>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Gjej fjalën para se të mbarojnë mundësitë</p>
      </div>

      <div className="flex gap-4 items-center">
        <div className="text-5xl font-black tracking-widest font-mono text-indigo-600">
          {word.split('').map((l, i) => (
            <span key={i} className="mx-1 border-b-4 border-gray-200 min-w-[30px] inline-block text-center">
              {guessed.includes(l) ? l : ''}
            </span>
          ))}
        </div>
      </div>

      <div className={`text-sm font-black uppercase tracking-[0.2em] px-4 py-2 rounded-full ${mistakes >= 5 ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600'}`}>
        Gabime: {mistakes} / 6
      </div>

      <div className="flex flex-wrap justify-center gap-2 max-w-sm">
        { "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('').map(l => (
          <button
            key={l}
            disabled={guessed.includes(l) || isWon || isLost}
            onClick={() => guessLetter(l)}
            className={`w-10 h-10 rounded-xl font-black text-sm border-2 transition-all shadow-sm ${
              guessed.includes(l) 
                ? (word.includes(l) ? 'bg-green-100 border-green-200 text-green-700' : 'bg-red-100 border-red-200 text-red-300') 
                : 'bg-white border-gray-100 hover:border-red-400'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {(isWon || isLost) && (
        <div className="text-center space-y-4 animate-in zoom-in duration-300">
          <p className={`font-black text-xl ${isWon ? 'text-green-600' : 'text-red-600'}`}>
            {isWon ? 'SHKËLQYESHËM! +30 PIKË' : `MBAROI! FJALA ISHTE: ${word}`}
          </p>
          <button onClick={initGame} className="bg-black text-white px-10 py-4 rounded-2xl font-black text-sm shadow-2xl active:scale-95 transition-all">LUAJ PËRSËRI</button>
        </div>
      )}
    </div>
  );
};

export const WordScramble: React.FC<GameProps> = ({ onWin }) => {
  const [original, setOriginal] = useState('');
  const [scrambled, setScrambled] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<'loading' | 'playing' | 'won'>('loading');

  const initGame = async () => {
    setStatus('loading');
    try {
      const word = await generateWord('medium');
      setOriginal(word);
      setScrambled(word.split('').sort(() => Math.random() - 0.5).join(''));
      setAnswer('');
    } finally {
      setStatus('playing');
    }
  };

  useEffect(() => { initGame(); }, []);

  const check = () => {
    if (answer.toUpperCase() === original) {
      setStatus('won');
      onWin(25);
    } else {
      alert("Gabim! Provo përsëri.");
    }
  };

  if (status === 'loading') return <div className="flex justify-center p-12"><i className="fas fa-spinner fa-spin text-4xl text-orange-500"></i></div>;

  return (
    <div className="flex flex-col items-center space-y-8 p-8 bg-white rounded-[2.5rem] shadow-2xl border border-black/5 animate-in fade-in duration-500">
      <div className="text-center space-y-1">
        <h2 className="text-3xl font-black tracking-tight text-orange-500">Word Scramble</h2>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Rregullo shkronjat për të gjetur fjalën</p>
      </div>

      <div className="flex gap-2">
        {scrambled.split('').map((char, i) => (
          <div key={i} className="w-12 h-12 bg-orange-50 text-orange-600 flex items-center justify-center rounded-2xl border-2 border-orange-100 font-black text-xl shadow-sm rotate-2">
            {char}
          </div>
        ))}
      </div>

      {status === 'playing' ? (
        <div className="flex gap-3 w-full max-w-xs">
          <input 
            className="flex-1 border-2 border-gray-200 p-4 rounded-2xl font-black text-center text-xl outline-none focus:border-orange-500" 
            placeholder="Përgjigja..." 
            value={answer} 
            onChange={e => setAnswer(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && check()}
          />
          <button onClick={check} className="bg-orange-500 text-white px-6 rounded-2xl font-black text-sm shadow-xl active:scale-90 transition-all">OK</button>
        </div>
      ) : (
        <div className="text-center space-y-4">
          <p className="font-black text-xl text-green-600">SAKTË! +25 PIKË</p>
          <button onClick={initGame} className="bg-black text-white px-10 py-4 rounded-2xl font-black text-sm shadow-2xl active:scale-95 transition-all">TJETËR</button>
        </div>
      )}
    </div>
  );
};

export const MemoryMatch: React.FC<GameProps> = ({ onWin }) => {
  const [cards, setCards] = useState<{ id: number, text: string, pairId: number, isFlipped: boolean, isMatched: boolean }[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [status, setStatus] = useState<'loading' | 'playing' | 'won'>('loading');

  const initGame = async () => {
    setStatus('loading');
    try {
      const pairs = await generateWordPair();
      const gameCards = pairs.flatMap((p: any, i: number) => [
        { id: i * 2, text: p.en, pairId: i, isFlipped: false, isMatched: false },
        { id: i * 2 + 1, text: p.sq, pairId: i, isFlipped: false, isMatched: false }
      ]).sort(() => Math.random() - 0.5);
      setCards(gameCards);
      setFlipped([]);
    } finally {
      setStatus('playing');
    }
  };

  useEffect(() => { initGame(); }, []);

  const handleFlip = (id: number) => {
    if (flipped.length === 2 || cards.find(c => c.id === id)?.isMatched || flipped.includes(id)) return;
    const newFlipped = [...flipped, id];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      const first = cards.find(c => c.id === newFlipped[0])!;
      const second = cards.find(c => c.id === newFlipped[1])!;

      if (first.pairId === second.pairId) {
        setCards(cards.map(c => c.pairId === first.pairId ? { ...c, isMatched: true } : c));
        setFlipped([]);
      } else {
        setTimeout(() => setFlipped([]), 1000);
      }
    }
  };

  useEffect(() => {
    if (cards.length > 0 && cards.every(c => c.isMatched)) {
      setStatus('won');
      onWin(40);
    }
  }, [cards]);

  if (status === 'loading') return <div className="flex justify-center p-12"><i className="fas fa-spinner fa-spin text-4xl text-purple-500"></i></div>;

  return (
    <div className="flex flex-col items-center space-y-8 p-8 bg-white rounded-[2.5rem] shadow-2xl border border-black/5 animate-in fade-in duration-500">
      <div className="text-center space-y-1">
        <h2 className="text-3xl font-black tracking-tight text-purple-600">Memory Match</h2>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Lidh fjalën Anglisht me atë Shqip</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
        {cards.map(card => {
          const isVisible = card.isMatched || flipped.includes(card.id);
          return (
            <button
              key={card.id}
              onClick={() => handleFlip(card.id)}
              className={`h-24 rounded-2xl border-2 font-bold text-xs p-2 transition-all duration-300 flex items-center justify-center text-center shadow-sm ${
                isVisible 
                  ? (card.isMatched ? 'bg-green-100 border-green-300 text-green-700' : 'bg-purple-100 border-purple-300 text-purple-700 scale-105') 
                  : 'bg-zinc-100 border-zinc-200 text-zinc-400 hover:border-purple-300'
              }`}
            >
              {isVisible ? card.text : <i className="fas fa-question text-xl opacity-20"></i>}
            </button>
          );
        })}
      </div>

      {status === 'won' && (
        <div className="text-center space-y-4 animate-in zoom-in duration-300">
          <p className="font-black text-xl text-green-600">URIME! FITOVE +40 PIKË</p>
          <button onClick={initGame} className="bg-black text-white px-10 py-4 rounded-2xl font-black text-sm shadow-2xl active:scale-95 transition-all">LUAJ PËRSËRI</button>
        </div>
      )}
    </div>
  );
};

export const SentenceBuilder: React.FC<GameProps> = ({ onWin, level }) => {
  const [sentence, setSentence] = useState('');
  const [words, setWords] = useState<string[]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'playing' | 'won'>('loading');

  const initGame = async () => {
    setStatus('loading');
    try {
      const s = await generateSentence(level);
      setSentence(s);
      const split = s.replace(/[.,!?]/g, '').split(' ');
      setWords([...split].sort(() => Math.random() - 0.5));
      setSelection([]);
    } finally {
      setStatus('playing');
    }
  };

  useEffect(() => { initGame(); }, []);

  const addWord = (w: string, idx: number) => {
    setSelection([...selection, w]);
    setWords(words.filter((_, i) => i !== idx));
  };

  const removeWord = (w: string, idx: number) => {
    setWords([...words, w]);
    setSelection(selection.filter((_, i) => i !== idx));
  };

  const check = () => {
    const attempt = selection.join(' ');
    const original = sentence.replace(/[.,!?]/g, '');
    if (attempt === original) {
      setStatus('won');
      onWin(20);
    } else {
      alert("Gabim! Rradhitja nuk është e saktë.");
    }
  };

  if (status === 'loading') return <div className="flex justify-center p-12"><i className="fas fa-spinner fa-spin text-4xl text-green-500"></i></div>;

  return (
    <div className="flex flex-col items-center space-y-8 p-8 bg-white rounded-[2.5rem] shadow-2xl border border-black/5 w-full max-w-lg animate-in fade-in duration-500">
      <div className="text-center space-y-1">
        <h2 className="text-3xl font-black tracking-tight text-green-600">Sentence Builder</h2>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Rradhit fjalët për të krijuar fjalinë</p>
      </div>

      <div className="w-full min-h-[120px] bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-3xl p-6 flex flex-wrap gap-2 content-start shadow-inner">
        {selection.map((w, i) => (
          <button key={i} onClick={() => removeWord(w, i)} className="bg-white px-4 py-2 rounded-xl border-2 border-green-200 text-green-700 font-bold text-sm shadow-sm hover:scale-95 transition-all">{w}</button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {words.map((w, i) => (
          <button key={i} onClick={() => addWord(w, i)} className="bg-zinc-100 px-4 py-2 rounded-xl border-2 border-zinc-200 text-zinc-600 font-bold text-sm hover:bg-zinc-200 hover:border-zinc-300 transition-all">{w}</button>
        ))}
      </div>

      <div className="w-full flex gap-3">
        {status === 'playing' ? (
          <button onClick={check} className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all">KONTROLLO</button>
        ) : (
          <div className="text-center w-full space-y-4 animate-in zoom-in duration-300">
            <p className="text-green-600 font-black text-xl">SAKTË! +20 PIKË</p>
            <button onClick={initGame} className="w-full bg-black text-white py-4 rounded-2xl font-black text-sm shadow-2xl active:scale-95 transition-all">TJETËR</button>
          </div>
        )}
      </div>
    </div>
  );
};
