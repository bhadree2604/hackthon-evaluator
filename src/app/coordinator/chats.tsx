import { ChatRoom } from '@/components/chat-room';
import { TAB_BAR_INSET } from '@/components/role-shell';

/**
 * The same shared room the organisers are in. A coordinator is the person a
 * team physically walks up to, so they need to see what is being asked without
 * having to be told about it second hand.
 */
export default function CoordinatorChats() {
  return <ChatRoom bottomInset={TAB_BAR_INSET} />;
}
