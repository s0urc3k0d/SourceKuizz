import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { io, Socket } from 'socket.io-client';

/**
 * Page Overlay Twitch pour OBS
 * URL: /overlay/[code]
 * 
 * Cette page est conçue pour être ajoutée comme source navigateur dans OBS.
 * Elle affiche en temps réel:
 * - La question en cours
 * - Les options de réponse
 * - Le timer
 * - Le leaderboard
 * - Les animations de réponses
 */

interface Player {
  id: string;
  nickname: string;
  score: number;
}

interface Question {
  id: string;
  type: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
  mediaUrl?: string;
  mediaType?: string;
  timeLimitMs: number;
}

interface AnswerResult {
  playerId: string;
  nickname: string;
  correct: boolean;
  points: number;
}

export default function OverlayPage() {
  const router = useRouter();
  const { code, theme = 'default' } = router.query;
  
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<'lobby' | 'playing' | 'finished'>('lobby');
  
  // Game state
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [lastAnswers, setLastAnswers] = useState<AnswerResult[]>([]);
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null);
  
  // Animation states
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [animateQuestion, setAnimateQuestion] = useState(false);

  useEffect(() => {
    if (!code) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const socket = io(apiUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Rejoindre en tant que spectateur
      socket.emit('spectate', { code });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // Session state update
    socket.on('session_state', (data: any) => {
      setPlayers(data.players || []);
      setSessionStatus(data.status);
      if (data.currentQuestion) {
        setCurrentQuestion(data.currentQuestion);
        setQuestionIndex(data.questionIndex || 0);
        setTotalQuestions(data.totalQuestions || 0);
      }
    });

    // Player joined
    socket.on('player_joined', (data: any) => {
      setPlayers(prev => {
        if (prev.find(p => p.id === data.playerId)) return prev;
        return [...prev, { id: data.playerId, nickname: data.nickname, score: 0 }];
      });
    });

    // Player left
    socket.on('player_left', (data: any) => {
      setPlayers(prev => prev.filter(p => p.id !== data.playerId));
    });

    // New question
    socket.on('question', (data: any) => {
      setShowResults(false);
      setCorrectOptionId(null);
      setLastAnswers([]);
      setAnimateQuestion(true);
      
      setCurrentQuestion({
        id: data.questionId,
        type: data.type || 'multiple_choice',
        prompt: data.prompt,
        options: data.options || [],
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        timeLimitMs: data.timeLimitMs,
      });
      setQuestionIndex(data.questionIndex);
      setTotalQuestions(data.totalQuestions);
      setTimeRemaining(data.timeLimitMs);
      setShowLeaderboard(false);

      // Désactiver l'animation après 500ms
      setTimeout(() => setAnimateQuestion(false), 500);
    });

    // Timer update
    socket.on('timer', (data: any) => {
      setTimeRemaining(data.remainingMs);
    });

    // Answer result (pour les animations)
    socket.on('answer_result', (data: any) => {
      setLastAnswers(prev => [...prev, {
        playerId: data.playerId,
        nickname: data.nickname || 'Joueur',
        correct: data.correct,
        points: data.points || 0,
      }]);
    });

    // Question ended - show correct answer
    socket.on('question_ended', (data: any) => {
      setShowResults(true);
      setCorrectOptionId(data.correctOptionId);
      
      // Afficher le leaderboard après 2 secondes
      setTimeout(() => {
        setShowLeaderboard(true);
      }, 2000);
    });

    // Leaderboard update
    socket.on('leaderboard', (data: any) => {
      setPlayers(data.leaderboard || []);
      setShowLeaderboard(true);
    });

    // Game started
    socket.on('game_started', () => {
      setSessionStatus('playing');
    });

    // Game ended
    socket.on('game_ended', (data: any) => {
      setSessionStatus('finished');
      setPlayers(data.finalLeaderboard || []);
      setShowLeaderboard(true);
    });

    return () => {
      socket.disconnect();
    };
  }, [code]);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining <= 0 || showResults) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => Math.max(0, prev - 100));
    }, 100);

    return () => clearInterval(timer);
  }, [timeRemaining, showResults]);

  const getThemeClasses = () => {
    switch (theme) {
      case 'minimal':
        return {
          bg: 'bg-transparent',
          card: 'bg-black/60 backdrop-blur-sm',
          text: 'text-white',
          accent: 'text-indigo-400',
        };
      case 'dark':
        return {
          bg: 'bg-gray-900',
          card: 'bg-gray-800',
          text: 'text-white',
          accent: 'text-indigo-400',
        };
      case 'twitch':
        return {
          bg: 'bg-[#0e0e10]',
          card: 'bg-[#18181b]',
          text: 'text-white',
          accent: 'text-[#9147ff]',
        };
      default:
        return {
          bg: 'bg-transparent',
          card: 'bg-black/70 backdrop-blur-md',
          text: 'text-white',
          accent: 'text-indigo-400',
        };
    }
  };

  const themeClasses = getThemeClasses();
  const timerSeconds = Math.ceil(timeRemaining / 1000);
  const timerPercent = currentQuestion 
    ? (timeRemaining / currentQuestion.timeLimitMs) * 100 
    : 100;

  if (!connected) {
    return (
      <div className={`min-h-screen ${themeClasses.bg} flex items-center justify-center`}>
        <div className={`${themeClasses.card} rounded-2xl p-8 text-center`}>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className={themeClasses.text}>Connexion à la session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${themeClasses.bg} p-4`}>
      <Head>
        <title>Overlay Quiz - {code}</title>
        <style>{`
          body { background: transparent !important; }
          @keyframes slideIn {
            from { transform: translateY(-20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          @keyframes correctPop {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
          }
          .animate-slideIn { animation: slideIn 0.5s ease-out; }
          .animate-pulse-slow { animation: pulse 2s ease-in-out infinite; }
          .animate-correct { animation: correctPop 0.5s ease-out; }
        `}</style>
      </Head>

      {/* Lobby State */}
      {sessionStatus === 'lobby' && (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className={`${themeClasses.card} rounded-2xl p-8 text-center max-w-md w-full`}>
            <div className="text-6xl mb-4">🎮</div>
            <h2 className={`text-2xl font-bold ${themeClasses.text} mb-2`}>
              En attente des joueurs
            </h2>
            <p className={`${themeClasses.accent} text-4xl font-mono font-bold mb-4`}>
              {code}
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {players.slice(0, 12).map((player) => (
                <span
                  key={player.id}
                  className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-sm"
                >
                  {player.nickname}
                </span>
              ))}
              {players.length > 12 && (
                <span className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded-full text-sm">
                  +{players.length - 12} autres
                </span>
              )}
            </div>
            <p className={`text-gray-400 mt-4`}>
              {players.length} joueur{players.length !== 1 ? 's' : ''} connecté{players.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Playing State */}
      {sessionStatus === 'playing' && currentQuestion && !showLeaderboard && (
        <div className={`max-w-4xl mx-auto ${animateQuestion ? 'animate-slideIn' : ''}`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className={`${themeClasses.card} rounded-xl px-4 py-2`}>
              <span className={themeClasses.text}>
                Question {questionIndex + 1}/{totalQuestions}
              </span>
            </div>
            
            {/* Timer */}
            <div className={`${themeClasses.card} rounded-xl px-6 py-3 relative overflow-hidden`}>
              <div
                className="absolute inset-0 bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-100"
                style={{ width: `${timerPercent}%`, opacity: 0.3 }}
              />
              <span className={`text-3xl font-bold ${timerSeconds <= 5 ? 'text-red-400 animate-pulse-slow' : themeClasses.text}`}>
                {timerSeconds}s
              </span>
            </div>
          </div>

          {/* Question Card */}
          <div className={`${themeClasses.card} rounded-2xl p-8 mb-6`}>
            {/* Media */}
            {currentQuestion.mediaUrl && (
              <div className="mb-6 flex justify-center">
                {currentQuestion.mediaType === 'image' && (
                  <img
                    src={currentQuestion.mediaUrl}
                    alt="Question media"
                    className="max-h-64 rounded-xl"
                  />
                )}
                {currentQuestion.mediaType === 'video' && (
                  <video
                    src={currentQuestion.mediaUrl}
                    className="max-h-64 rounded-xl"
                    autoPlay
                    muted
                    loop
                  />
                )}
              </div>
            )}

            {/* Question Text */}
            <h2 className={`text-3xl font-bold ${themeClasses.text} text-center mb-8`}>
              {currentQuestion.prompt}
            </h2>

            {/* Options */}
            {currentQuestion.type === 'multiple_choice' && (
              <div className="grid grid-cols-2 gap-4">
                {currentQuestion.options.map((option, index) => {
                  const isCorrect = showResults && option.id === correctOptionId;
                  const colors = [
                    'from-red-500 to-red-600',
                    'from-blue-500 to-blue-600',
                    'from-yellow-500 to-yellow-600',
                    'from-green-500 to-green-600',
                  ];
                  const icons = ['🔴', '🔵', '🟡', '🟢'];

                  return (
                    <div
                      key={option.id}
                      className={`
                        relative rounded-xl p-4 transition-all duration-300
                        ${isCorrect 
                          ? 'bg-gradient-to-r from-green-500 to-emerald-600 animate-correct ring-4 ring-green-400' 
                          : `bg-gradient-to-r ${colors[index % 4]}`
                        }
                        ${showResults && !isCorrect ? 'opacity-50' : ''}
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{icons[index % 4]}</span>
                        <span className="text-xl font-semibold text-white">
                          {option.label}
                        </span>
                        {isCorrect && (
                          <span className="ml-auto text-2xl">✓</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* True/False */}
            {currentQuestion.type === 'true_false' && (
              <div className="flex gap-4 justify-center">
                {currentQuestion.options.map((option) => {
                  const isCorrect = showResults && option.id === correctOptionId;
                  const isTrue = option.label.toLowerCase() === 'vrai' || option.label.toLowerCase() === 'true';

                  return (
                    <div
                      key={option.id}
                      className={`
                        rounded-xl p-6 min-w-[150px] text-center transition-all duration-300
                        ${isCorrect 
                          ? 'bg-gradient-to-r from-green-500 to-emerald-600 animate-correct ring-4 ring-green-400' 
                          : isTrue 
                            ? 'bg-gradient-to-r from-green-500 to-green-600'
                            : 'bg-gradient-to-r from-red-500 to-red-600'
                        }
                        ${showResults && !isCorrect ? 'opacity-50' : ''}
                      `}
                    >
                      <span className="text-3xl mb-2 block">{isTrue ? '✓' : '✗'}</span>
                      <span className="text-xl font-semibold text-white">{option.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Text Input */}
            {currentQuestion.type === 'text_input' && (
              <div className="text-center">
                <div className="inline-block bg-gray-700/50 rounded-xl px-8 py-4 border-2 border-dashed border-gray-500">
                  <span className="text-xl text-gray-400">✏️ Réponse texte libre</span>
                </div>
              </div>
            )}
          </div>

          {/* Live Answer Feed */}
          {lastAnswers.length > 0 && (
            <div className={`${themeClasses.card} rounded-xl p-4`}>
              <div className="flex flex-wrap gap-2">
                {lastAnswers.slice(-8).map((answer, i) => (
                  <span
                    key={i}
                    className={`px-3 py-1 rounded-full text-sm ${
                      answer.correct
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {answer.correct ? '✓' : '✗'} {answer.nickname}
                    {answer.correct && ` +${answer.points}`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Leaderboard */}
      {(showLeaderboard || sessionStatus === 'finished') && (
        <div className="flex items-center justify-center min-h-screen">
          <div className={`${themeClasses.card} rounded-2xl p-8 max-w-lg w-full animate-slideIn`}>
            <h2 className={`text-2xl font-bold ${themeClasses.text} text-center mb-6`}>
              {sessionStatus === 'finished' ? '🏆 Classement Final' : '📊 Classement'}
            </h2>
            
            <div className="space-y-3">
              {players.slice(0, 10).map((player, index) => (
                <div
                  key={player.id}
                  className={`
                    flex items-center gap-4 rounded-xl p-3 transition-all
                    ${index === 0 ? 'bg-yellow-500/20 ring-2 ring-yellow-500/50' : 
                      index === 1 ? 'bg-gray-400/20' :
                      index === 2 ? 'bg-amber-600/20' : 'bg-gray-700/30'}
                  `}
                >
                  <div className={`text-2xl font-bold w-10 ${
                    index === 0 ? 'text-yellow-400' :
                    index === 1 ? 'text-gray-400' :
                    index === 2 ? 'text-amber-600' : 'text-gray-500'
                  }`}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                  </div>
                  <div className="flex-1">
                    <span className={`font-semibold ${themeClasses.text}`}>
                      {player.nickname}
                    </span>
                  </div>
                  <div className={`font-bold ${themeClasses.accent}`}>
                    {player.score} pts
                  </div>
                </div>
              ))}
            </div>

            {sessionStatus === 'finished' && (
              <div className="mt-8 text-center">
                <p className="text-gray-400">Merci d'avoir joué ! 🎉</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
