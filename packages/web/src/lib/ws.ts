import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, WSJoinSession, WSSubmitAnswer, WSToggleAutoNext, WSReaction, WSTransferHost, WSStartQuestion, WSForceReveal, WSAdvanceNext } from '@sourcekuizz/shared';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocket(baseUrl: string, token?: string): TypedSocket {
  const s: TypedSocket = io(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    auth: token ? { token } as any : undefined,
  });
  return s;
}

export const wsApi = (socket: TypedSocket) => ({
  joinSession(payload: WSJoinSession) { socket.emit('join_session', payload); },
  startQuestion(payload: WSStartQuestion) { socket.emit('start_question', payload); },
  toggleAutoNext(payload: WSToggleAutoNext) { socket.emit('toggle_auto_next', payload); },
  submitAnswer(payload: WSSubmitAnswer) { socket.emit('submit_answer', payload); },
  transferHost(payload: WSTransferHost) { socket.emit('transfer_host', payload); },
  reaction(payload: WSReaction) { socket.emit('reaction', payload); },
  forceReveal(payload: WSForceReveal) { socket.emit('force_reveal', payload); },
  advanceNext(payload: WSAdvanceNext) { socket.emit('advance_next', payload); },
  toggleSpectatorReactions(payload: { code: string; enabled: boolean }) { socket.emit('toggle_spectator_reactions', payload); },
});
