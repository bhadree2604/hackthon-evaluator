import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation, useQuery } from 'convex/react';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/components/ui/overlays';
import { Pill, withAlpha } from '@/components/ui/primitives';
import { Radius, Space, type RoleKey } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';

function timeLabel(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(ts: number) {
  const date = new Date(ts);
  const today = new Date();
  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  return sameDay ? 'Today' : date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/**
 * The single room everyone at the event shares. Participants are labelled with
 * their team, staff with their role, so it is always clear who is speaking.
 */
export function ChatRoom({ bottomInset = 0 }: { bottomInset?: number }) {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { profile } = useSession();

  const data = useQuery(api.chat.room, { limit: 200 });
  const send = useMutation(api.chat.send);
  const markRead = useMutation(api.chat.markRead);
  const removeMessage = useMutation(api.chat.remove);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const lastCount = useRef(0);

  const messages = data?.messages ?? [];
  const unread = data?.unread ?? 0;
  const canModerate = profile?.roles?.includes('admin') ?? false;

  // Depends on the count, never on the array, so marking read cannot loop.
  useEffect(() => {
    if (unread === 0) return;
    markRead({}).catch(() => {});
  }, [markRead, unread]);

  useEffect(() => {
    if (messages.length === lastCount.current) return;
    lastCount.current = messages.length;
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [messages.length]);

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await send({ body });
      setDraft('');
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <LinearGradient
      colors={[Brand.bgDeep, Brand.bg, Brand.bg]}
      style={styles.root}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}>
      <KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={0}>
        <View style={[styles.header, { paddingTop: insets.top + Space.md }]}>
          <View style={styles.flex}>
            <Text style={styles.headerTitle}>Help desk</Text>
            <Text style={styles.headerSubtitle}>
              Everyone at Hackfinity is in this room
            </Text>
          </View>
          <MaterialCommunityIcons name="forum-outline" size={20} color={Brand.textFaint} />
        </View>

        {data === undefined ? (
          <View style={styles.loading}>
            <ActivityIndicator color={Brand.cyan} />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}>
            {messages.length === 0 ? (
              <View style={styles.empty}>
                <View style={[styles.emptyIcon, { backgroundColor: Brand.surfaceStrong }]}>
                  <MaterialCommunityIcons name="forum-outline" size={24} color={Brand.textFaint} />
                </View>
                <Text style={styles.emptyTitle}>Nothing said yet</Text>
                <Text style={styles.emptyText}>
                  Ask about your lab, hardware, food or judging. Organisers and coordinators get a
                  notification when a participant posts.
                </Text>
              </View>
            ) : (
              messages.map((message, index) => {
                const previous = messages[index - 1];
                const showDay =
                  !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
                const role = message.authorRole as RoleKey;
                const tone = RoleTheme[role].accent;

                // Participants carry their team, staff carry their role.
                const badge =
                  role === 'participant'
                    ? (message.authorTeamCode ?? message.authorTeamName ?? 'Participant')
                    : RoleTheme[role].label;

                return (
                  <View key={message._id}>
                    {showDay && (
                      <View style={styles.dayRow}>
                        <Text style={styles.dayText}>{dayLabel(message.createdAt)}</Text>
                      </View>
                    )}
                    <View
                      style={[
                        styles.bubbleRow,
                        message.mine ? styles.rowMine : styles.rowTheirs,
                      ]}>
                      <Pressable
                        onLongPress={
                          canModerate
                            ? () =>
                                removeMessage({ messageId: message._id as Id<'messages'> }).catch(
                                  (err) => toast.show(errorMessage(err), 'error'),
                                )
                            : undefined
                        }
                        style={[
                          styles.bubble,
                          message.mine
                            ? {
                                backgroundColor: withAlpha(Brand.cyan, 0.16),
                                borderColor: withAlpha(Brand.cyan, 0.3),
                              }
                            : styles.bubbleTheirs,
                        ]}>
                        {!message.mine && (
                          <View style={styles.authorRow}>
                            <Text style={[styles.author, { color: tone }]} numberOfLines={1}>
                              {message.authorName}
                            </Text>
                            <Pill label={badge} color={tone} compact />
                          </View>
                        )}
                        {!message.mine && role === 'participant' && !!message.authorTeamName && (
                          <Text style={styles.teamLine} numberOfLines={1}>
                            {message.authorTeamName}
                          </Text>
                        )}
                        <Text style={styles.body}>{message.body}</Text>
                        <Text style={styles.time}>{timeLabel(message.createdAt)}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        <View style={[styles.composer, { paddingBottom: insets.bottom + bottomInset + Space.sm }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message the room"
            placeholderTextColor={Brand.textFaint}
            style={styles.input}
            multiline
            maxLength={2000}
            selectionColor={Brand.cyan}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!draft.trim() || sending}
            onPress={submit}
            style={({ pressed }) => [
              styles.send,
              {
                backgroundColor: draft.trim() ? Brand.cyan : Brand.surfaceStrong,
                opacity: pressed ? 0.75 : 1,
              },
            ]}>
            {sending ? (
              <ActivityIndicator size="small" color={Brand.onAccent} />
            ) : (
              <MaterialCommunityIcons
                name="send"
                size={18}
                color={draft.trim() ? Brand.onAccent : Brand.textFaint}
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const useStyles = makeStyles((Brand) => ({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingBottom: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.borderSubtle,
  },
  headerTitle: { color: Brand.text, fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: Brand.textFaint, fontSize: 11.5, marginTop: 2 },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messages: { padding: Space.lg, gap: Space.sm },

  empty: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xxl },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: Brand.textDim, fontSize: 15, fontWeight: '700' },
  emptyText: {
    color: Brand.textFaint,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    maxWidth: 300,
  },

  dayRow: { alignItems: 'center', paddingVertical: Space.md },
  dayText: {
    color: Brand.textFaint,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    backgroundColor: Brand.surfaceStrong,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },

  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '86%',
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: 3,
  },
  bubbleTheirs: { backgroundColor: Brand.surfaceStrong, borderColor: Brand.borderSubtle },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, flexWrap: 'wrap' },
  author: { fontSize: 12, fontWeight: '800', flexShrink: 1 },
  teamLine: { color: Brand.textFaint, fontSize: 10.5, marginTop: 1 },
  body: { color: Brand.text, fontSize: 14.5, lineHeight: 20, marginTop: 2 },
  time: { color: Brand.textFaint, fontSize: 10, alignSelf: 'flex-end' },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.borderSubtle,
    backgroundColor: Brand.bgElevated,
  },
  input: {
    flex: 1,
    color: Brand.text,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: Space.md,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.borderSubtle,
    backgroundColor: Brand.inputBg,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
