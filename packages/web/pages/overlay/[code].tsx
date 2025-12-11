import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { io, Socket } from 'socket.io-client';

/**
 * Overlay OBS Professionnel pour SourceKuizz
 * URL: /overlay/[code]
 * 
 * Conçu pour être une source navigateur dans OBS (1920x1080)
 * Inclut des zones transparentes pour:
 * - Caméra du streamer
 * - Chat Twitch
 */

interface Player {
  id: string;
  nickname: string;
  score: number;
}

interface QuestionOption {
  id: string;
  label: string;
}

interface Question {
  questionId: string;
  prompt: string;
  type: string;
  options: QuestionOption[];
  mediaUrl?: string;
  mediaType?: string;
  timeLimitMs: number;
  index: number;
  totalQuestions: number;
}

export default function OverlayPage() {
  const router = useRouter();
  const { code } = router.query;
  
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<'connecting' | 'lobby' | 'question' | 'reveal' | 'finished'>('connecting');
  
  // Game state
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [correctOptionIds, setCorrectOptionIds] = useState<string[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [hostId, setHostId] = useState<string | null>(null);
  
  // Animation states
  const [showQuestion, setShowQuestion] = useState(false);

  // Timer countdown
  useEffect(() => {
    if (phase !== 'question' || timeRemaining <= 0) return;
    const timer = setInterval(() => {
      setTimeRemaining(prev => Math.max(0, prev - 100));
    }, 100);
    return () => clearInterval(timer);
  }, [phase, timeRemaining]);

  // WebSocket connection
  useEffect(() => {
    if (!code) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
    
    // Récupérer le quizId depuis l'API
    fetch(`/api/sessions/${code}/info`)
      .then(res => {
        if (!res.ok) throw new Error('Session not found');
        return res.json();
      })
      .then(data => {
        if (!data.quizId) {
          console.error('[Overlay] No quizId in session info');
          return;
        }
        
        const socket = io(wsUrl, {
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
          console.log('[Overlay] Connected');
          setConnected(true);
          socket.emit('join_session', { code, quizId: data.quizId, spectator: true });
        });

        socket.on('disconnect', () => {
          console.log('[Overlay] Disconnected');
          setConnected(false);
          setPhase('connecting');
        });

        socket.on('error_generic', (err: any) => {
          console.error('[Overlay] Error:', err);
        });

        socket.on('join_rejected', (err: any) => {
          console.error('[Overlay] Join rejected:', err);
        });

        // Session state
        socket.on('session_state', (data: any) => {
          console.log('[Overlay] session_state:', data.status);
          const filteredPlayers = (data.players || []).filter((p: any) => p.id !== data.hostId);
          setPlayers(filteredPlayers);
          setHostId(data.hostId);
          setQuestionIndex(data.questionIndex || 0);
          setTotalQuestions(data.totalQuestions || 0);
          
          if (data.status === 'lobby') setPhase('lobby');
          else if (data.status === 'question') setPhase('question');
          else if (data.status === 'reveal') setPhase('reveal');
          else if (data.status === 'finished') setPhase('finished');
        });

        // Question started
        socket.on('question_started', (data: any) => {
          console.log('[Overlay] question_started:', data);
          setCurrentQuestion({
            questionId: data.questionId,
            prompt: data.prompt || 'Question...',
            type: data.type || 'multiple_choice',
            options: data.options || [],
            mediaUrl: data.mediaUrl,
            mediaType: data.mediaType,
            timeLimitMs: data.timeLimitMs,
            index: data.index,
            totalQuestions: data.totalQuestions,
          });
          setQuestionIndex(data.index);
          setTotalQuestions(data.totalQuestions);
          setTimeRemaining(data.timeLimitMs);
          setTotalTime(data.timeLimitMs);
          setCorrectOptionIds([]);
          setPhase('question');
          setShowQuestion(true);
        });

        // Question reveal
        socket.on('question_reveal', (data: any) => {
          console.log('[Overlay] question_reveal:', data);
          setCorrectOptionIds(data.correctOptionIds || []);
          setPhase('reveal');
          setTimeRemaining(0);
        });

        // Leaderboard update
        socket.on('leaderboard_update', (data: any) => {
          if (data.entries) {
            const filtered = data.entries.filter((e: any) => e.playerId !== hostId);
            setPlayers(filtered.map((e: any) => ({ 
              id: e.playerId, 
              nickname: e.nickname, 
              score: e.score 
            })));
          }
        });

        // Session finished
        socket.on('session_finished', (data: any) => {
          console.log('[Overlay] session_finished');
          setPhase('finished');
          if (data.final) {
            setPlayers(data.final.map((e: any) => ({ 
              id: e.playerId, 
              nickname: e.nickname, 
              score: e.score 
            })));
          }
        });
      })
      .catch(err => {
        console.error('[Overlay] Failed to get session info:', err);
      });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [code, hostId]);

  // Sorted leaderboard
  const leaderboard = useMemo(() => {
    return [...players].sort((a, b) => b.score - a.score).slice(0, 8);
  }, [players]);

  // Timer percentage
  const timerPercent = totalTime > 0 ? (timeRemaining / totalTime) * 100 : 0;
  const timerSeconds = Math.ceil(timeRemaining / 1000);

  // Option colors
  const optionColors = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22'];

  return (
    <>
      <Head>
        <title>Quiz Overlay - {code}</title>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap');
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Poppins', sans-serif;
            overflow: hidden;
            background: transparent;
          }
          
          @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          
          @keyframes slideInUp {
            from { transform: translateY(50px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          
          @keyframes correctAnswer {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); box-shadow: 0 0 30px rgba(46, 204, 113, 0.8); }
            100% { transform: scale(1); }
          }
          
          @keyframes timerPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
          
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          
          .animate-slide-in { animation: slideInRight 0.5s ease-out; }
          .animate-slide-up { animation: slideInUp 0.4s ease-out; }
          .animate-pulse { animation: pulse 2s infinite; }
          .animate-correct { animation: correctAnswer 0.6s ease-out; }
          .animate-timer-pulse { animation: timerPulse 0.5s ease-out infinite; }
        `}</style>
      </Head>

      <div style={{
        width: '1920px',
        height: '1080px',
        position: 'relative',
        background: 'transparent',
      }}>
        
        {/* Zone Caméra (en haut à gauche) - Transparente */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          width: '400px',
          height: '300px',
          border: phase === 'connecting' ? '3px dashed rgba(255,255,255,0.3)' : 'none',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {phase === 'connecting' && (
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>Zone Caméra</span>
          )}
        </div>

        {/* Zone Chat (à droite) - Transparente */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          width: '350px',
          height: '600px',
          border: phase === 'connecting' ? '3px dashed rgba(255,255,255,0.3)' : 'none',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {phase === 'connecting' && (
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>Zone Chat</span>
          )}
        </div>

        {/* Header - Code Session & Progress */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '12px 40px',
            borderRadius: '50px',
            boxShadow: '0 10px 40px rgba(102, 126, 234, 0.4)',
          }}>
            <span style={{ color: 'white', fontSize: '24px', fontWeight: 700, letterSpacing: '4px' }}>
              {code}
            </span>
          </div>
          
          {totalQuestions > 0 && (
            <div style={{
              background: 'rgba(0,0,0,0.6)',
              padding: '8px 24px',
              borderRadius: '20px',
              backdropFilter: 'blur(10px)',
            }}>
              <span style={{ color: 'white', fontSize: '16px' }}>
                Question {questionIndex + 1} / {totalQuestions}
              </span>
            </div>
          )}
        </div>

        {/* Leaderboard (en bas à droite) */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          width: '350px',
          background: 'rgba(0,0,0,0.8)',
          borderRadius: '20px',
          padding: '20px',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
        }} className="animate-slide-in">
          <h3 style={{
            color: 'white',
            fontSize: '18px',
            fontWeight: 700,
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <span style={{ fontSize: '24px' }}>🏆</span> Classement
          </h3>
          
          {leaderboard.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '20px' }}>
              En attente de joueurs...
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leaderboard.map((player, idx) => (
                <div
                  key={player.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    background: idx === 0 ? 'linear-gradient(135deg, #f1c40f 0%, #f39c12 100%)' :
                               idx === 1 ? 'linear-gradient(135deg, #bdc3c7 0%, #95a5a6 100%)' :
                               idx === 2 ? 'linear-gradient(135deg, #e67e22 0%, #d35400 100%)' :
                               'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    transform: idx < 3 ? 'scale(1)' : 'scale(0.95)',
                  }}
                  className="animate-slide-up"
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: idx < 3 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    color: 'white',
                    fontSize: '14px',
                  }}>
                    {idx === 0 ? '👑' : idx + 1}
                  </div>
                  <span style={{
                    flex: 1,
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '15px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {player.nickname}
                  </span>
                  <span style={{
                    color: idx < 3 ? 'rgba(0,0,0,0.8)' : 'white',
                    fontWeight: 700,
                    fontSize: '16px',
                  }}>
                    {player.score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Zone Question (Centre) */}
        {(phase === 'question' || phase === 'reveal') && currentQuestion && (
          <div style={{
            position: 'absolute',
            top: '340px',
            left: '440px',
            width: '1100px',
          }} className="animate-slide-up">
            {/* Timer */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '20px',
            }}>
              <div style={{
                position: 'relative',
                width: '100px',
                height: '100px',
              }} className={timerSeconds <= 5 && phase === 'question' ? 'animate-timer-pulse' : ''}>
                <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
                  <circle
                    cx="50" cy="50" r="45"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50" cy="50" r="45"
                    fill="none"
                    stroke={timerSeconds <= 5 ? '#e74c3c' : timerSeconds <= 10 ? '#f1c40f' : '#2ecc71'}
                    strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 45}`}
                    strokeDashoffset={`${2 * Math.PI * 45 * (1 - timerPercent / 100)}`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.1s linear' }}
                  />
                </svg>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '32px',
                  fontWeight: 800,
                }}>
                  {phase === 'reveal' ? '✓' : timerSeconds}
                </div>
              </div>
            </div>

            {/* Question */}
            <div style={{
              background: 'rgba(0,0,0,0.85)',
              borderRadius: '24px',
              padding: '30px 40px',
              marginBottom: '24px',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}>
              <p style={{
                color: 'white',
                fontSize: '28px',
                fontWeight: 700,
                textAlign: 'center',
                lineHeight: 1.4,
              }}>
                {currentQuestion.prompt}
              </p>
              
              {currentQuestion.mediaUrl && currentQuestion.mediaType === 'image' && (
                <div style={{ marginTop: '20px', textAlign: 'center' }}>
                  <img 
                    src={currentQuestion.mediaUrl} 
                    alt="Question media"
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '200px', 
                      borderRadius: '12px',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Options */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
            }}>
              {currentQuestion.options.map((option, idx) => {
                const isCorrect = correctOptionIds.includes(option.id);
                const showResult = phase === 'reveal';
                
                return (
                  <div
                    key={option.id}
                    style={{
                      background: showResult 
                        ? isCorrect 
                          ? 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)'
                          : 'rgba(255,255,255,0.1)'
                        : optionColors[idx % optionColors.length],
                      borderRadius: '16px',
                      padding: '20px 24px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      opacity: showResult && !isCorrect ? 0.5 : 1,
                      transform: showResult && isCorrect ? 'scale(1.02)' : 'scale(1)',
                      boxShadow: showResult && isCorrect 
                        ? '0 0 30px rgba(46, 204, 113, 0.6)' 
                        : '0 8px 30px rgba(0,0,0,0.3)',
                      transition: 'all 0.3s ease',
                    }}
                    className={showResult && isCorrect ? 'animate-correct' : 'animate-slide-up'}
                  >
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      background: 'rgba(0,0,0,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '20px',
                      fontWeight: 700,
                    }}>
                      {showResult && isCorrect ? '✓' : String.fromCharCode(65 + idx)}
                    </div>
                    <span style={{
                      color: 'white',
                      fontSize: '20px',
                      fontWeight: 600,
                      flex: 1,
                    }}>
                      {option.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Lobby State */}
        {phase === 'lobby' && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}>
            <div style={{
              background: 'rgba(0,0,0,0.8)',
              borderRadius: '30px',
              padding: '50px 80px',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }} className="animate-pulse">
              <div style={{ fontSize: '60px', marginBottom: '20px' }}>🎮</div>
              <h2 style={{ 
                color: 'white', 
                fontSize: '36px', 
                fontWeight: 700,
                marginBottom: '10px',
              }}>
                En attente...
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '20px' }}>
                {players.length} joueur{players.length > 1 ? 's' : ''} connecté{players.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}

        {/* Finished State */}
        {phase === 'finished' && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.9) 0%, rgba(118, 75, 162, 0.9) 100%)',
              borderRadius: '30px',
              padding: '50px 80px',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 30px 80px rgba(102, 126, 234, 0.5)',
            }}>
              <div style={{ fontSize: '80px', marginBottom: '20px' }}>🏆</div>
              <h2 style={{ 
                color: 'white', 
                fontSize: '42px', 
                fontWeight: 800,
                marginBottom: '20px',
              }}>
                Quiz Terminé !
              </h2>
              {leaderboard[0] && (
                <div style={{
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '20px',
                  padding: '20px 40px',
                }}>
                  <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '18px', marginBottom: '8px' }}>
                    Gagnant
                  </p>
                  <p style={{ color: 'white', fontSize: '32px', fontWeight: 700 }}>
                    👑 {leaderboard[0].nickname}
                  </p>
                  <p style={{ color: '#f1c40f', fontSize: '24px', fontWeight: 600 }}>
                    {leaderboard[0].score} points
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Connecting State */}
        {phase === 'connecting' && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}>
            <div style={{
              background: 'rgba(0,0,0,0.8)',
              borderRadius: '30px',
              padding: '50px 80px',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <div style={{
                width: '60px',
                height: '60px',
                border: '4px solid rgba(255,255,255,0.2)',
                borderTopColor: '#667eea',
                borderRadius: '50%',
                margin: '0 auto 24px',
                animation: 'spin 1s linear infinite',
              }} />
              <p style={{ color: 'white', fontSize: '20px' }}>
                Connexion à la session...
              </p>
            </div>
          </div>
        )}

        {/* Footer branding */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'rgba(0,0,0,0.6)',
          padding: '10px 20px',
          borderRadius: '30px',
          backdropFilter: 'blur(10px)',
        }}>
          <span style={{ fontSize: '24px' }}>🎯</span>
          <span style={{ color: 'white', fontSize: '16px', fontWeight: 600 }}>
            SourceKuizz
          </span>
        </div>
      </div>
    </>
  );
}
