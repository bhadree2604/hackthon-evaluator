import { ChatRoom } from '@/components/chat-room';
import { TAB_BAR_INSET } from '@/components/role-shell';

export default function ParticipantChat() {
  return <ChatRoom bottomInset={TAB_BAR_INSET} />;
}
