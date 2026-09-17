import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation, useQuery } from 'convex/react';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog, useToast } from '@/components/ui/overlays';
import { withAlpha } from '@/components/ui/primitives';
import { Radius, Space, type RoleKey } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';

/**
 * The single help desk room everyone at the event shares.
 *
 * Who is speaking is the whole job of this screen. A participant is shown with
 * their name, their team name and their team code, because the organiser
 * reading it has to know which table to walk to. Staff are shown with their
 * role. Runs of messages from the same person are grouped so a long thread
 * still reads as a conversation on a phone.
 */

/** Messages from the same person within this many ms are grouped. */
const GROUP_WINDOW = 5 * 60 * 1000;

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

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

/**
 * The help desk room.
 *
 * Takes no bottom inset: the tab bar is part of the layout rather than floating
 * over it, so the content area already ends where the tab bar begins.
 */
export function ChatRoom() {
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
  const [deleting, setDeleting] = useState<{ id: string; author: string } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const lastCount = useRef(0);

  const messages = useMemo(() => data?.messages ?? [], [data]);
  const unread = data?.unread ?? 0;
  const canModerate = profile?.roles?.includes('admin') ?? false;

  /**
   * "New messages" marks what has landed while this screen has been open.
   * Opening the room clears the unread count immediately, so anything newer
   * than that moment is what the reader has genuinely not seen.
   */
  const [openedAt] = useState(() => Date.now());
  const firstNewId = useMemo(
    () => messages.find((message) => !message.mine && message.createdAt > openedAt)?._id ?? null,
    [messages, openedAt],
  );

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
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setSending(false);
    }
  }

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <LinearGradient
      colors={[Brand.bgDeep, Brand.bg, Brand.bg]}
      style={styles.root}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}>
      <KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={0}>
        <View style={[styles.header, { paddingTop: insets.top + Space.md }]}>
          <View style={[styles.headerMark, { backgroundColor: withAlpha(Brand.cyan, 0.14) }]}>
            <MaterialCommunityIcons name="lifebuoy" size={19} color={Brand.cyan} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.headerTitle}>Help desk</Text>
            <Text style={styles.headerSubtitle}>
              {messages.length === 0
                ? 'Everyone at Hackfinity is in this room'
                : `${messages.length} message${messages.length === 1 ? '' : 's'} · everyone is in this room`}
            </Text>
          </View>
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
                  <MaterialCommunityIcons
                    name="message-text-outline"
                    size={24}
                    color={Brand.textFaint}
                  />
                </View>
                <Text style={styles.emptyTitle}>Nothing said yet</Text>
                <Text style={styles.emptyText}>
                  Ask about your lab, hardware, food or judging. Organisers and coordinators get a
                  notification the moment a participant posts.
                </Text>
              </View>
            ) : (
              messages.map((message, index) => {
                const previous = messages[index - 1];
                const next = messages[index + 1];
                const role = message.authorRole as RoleKey;
                const tone = RoleTheme[role].accent;

                const showDay =
                  !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);

                /** First message of a run by this person. */
                const startsRun =
                  showDay ||
                  !previous ||
                  previous.authorName !== message.authorName ||
                  previous.authorRole !== message.authorRole ||
                  message.createdAt - previous.createdAt > GROUP_WINDOW;

                /** Last of the run: only this one carries the time. */
                const endsRun =
                  !next ||
                  next.authorName !== message.authorName ||
                  next.authorRole !== message.authorRole ||
                  next.createdAt - message.createdAt > GROUP_WINDOW ||
                  dayLabel(next.createdAt) !== dayLabel(message.createdAt);

                const isParticipant = role === 'participant';

                return (
                  <View key={message._id}>
                    {showDay && (
                      <View style={styles.dayRow}>
                        <Text style={styles.dayText}>{dayLabel(message.createdAt)}</Text>
                      </View>
                    )}

                    {firstNewId === message._id && (
                      <View style={styles.unreadRow}>
                        <View style={[styles.unreadLine, { backgroundColor: Brand.cyan }]} />
                        <Text style={[styles.unreadText, { color: Brand.cyan }]}>
                          New messages
                        </Text>
                        <View style={[styles.unreadLine, { backgroundColor: Brand.cyan }]} />
                      </View>
                    )}

                    <View
                      style={[
                        styles.row,
                        message.mine ? styles.rowMine : styles.rowTheirs,
                        startsRun ? styles.rowSpaced : styles.rowTight,
                      ]}>
                      {/* Avatar column: only on the first of a run, never on mine. */}
                      {!message.mine &&
                        (startsRun ? (
                          <View
                            style={[
                              styles.avatar,
                              {
                                backgroundColor: withAlpha(tone, 0.16),
                                borderColor: withAlpha(tone, 0.36),
                              },
                            ]}>
                            <Text style={[styles.avatarText, { color: tone }]}>
                              {initials(message.authorName)}
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.avatarSpacer} />
                        ))}

                      <View style={styles.bubbleColumn}>
                        {!message.mine && startsRun && (
                          <View style={styles.identity}>
                            <Text style={[styles.author, { color: tone }]} numberOfLines={1}>
                              {message.authorName}
                            </Text>
                            <View
                              style={[
                                styles.roleTag,
                                {
                                  backgroundColor: withAlpha(tone, 0.14),
                                  borderColor: withAlpha(tone, 0.32),
                                },
                              ]}>
                              <Text style={[styles.roleTagText, { color: tone }]}>
                                {isParticipant
                                  ? (message.authorTeamCode ?? 'Participant')
                                  : RoleTheme[role].label}
                              </Text>
                            </View>
                          </View>
                        )}

                        {/* The team name, spelled out. This is what an organiser
                            needs to know which table to walk to. */}
                        {!message.mine && startsRun && isParticipant && !!message.authorTeamName && (
                          <View style={styles.teamRow}>
                            <MaterialCommunityIcons
                              name="account-group-outline"
                              size={11}
                              color={Brand.textFaint}
                            />
                            <Text style={styles.teamText} numberOfLines={1}>
                              {message.authorTeamName}
                            </Text>
                          </View>
                        )}

                        <Pressable
                          onLongPress={
                            canModerate && !message.mine
                              ? () =>
                                  setDeleting({ id: message._id, author: message.authorName })
                              : undefined
                          }
                          delayLongPress={350}
                          style={({ pressed }) => [
                            styles.bubble,
                            message.mine
                              ? {
                                  backgroundColor: withAlpha(Brand.cyan, 0.18),
                                  borderColor: withAlpha(Brand.cyan, 0.32),
                                  borderBottomRightRadius: endsRun ? 4 : Radius.lg,
                                }
                              : {
                                  backgroundColor: Brand.surfaceStrong,
                                  borderColor: Brand.borderSubtle,
                                  borderBottomLeftRadius: endsRun ? 4 : Radius.lg,
                                },
                            pressed && styles.pressed,
                          ]}>
                          <Text style={styles.body}>{message.body}</Text>
                        </Pressable>

                        {endsRun && (
                          <Text
                            style={[
                              styles.time,
                              message.mine ? styles.timeMine : styles.timeTheirs,
                            ]}>
                            {timeLabel(message.createdAt)}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {/*
          * The composer sits on the bottom of the content area, and that is
          * already above the tab bar: the tab bar is laid out in the flex
          * column rather than floating over the screen, and it carries the
          * home-indicator inset itself. Padding by `insets.bottom` and the tab
          * bar height here counted both of them a second time and left the
          * input floating roughly 110px up the screen with nothing under it.
          */}
        <View style={[styles.composer, { paddingBottom: Space.sm }]}>
          <View style={styles.inputWrap}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message the help desk"
              placeholderTextColor={Brand.textFaint}
              style={styles.input}
              multiline
              maxLength={2000}
              selectionColor={Brand.cyan}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!canSend}
            onPress={submit}
            style={({ pressed }) => [
              styles.send,
              {
                backgroundColor: canSend ? Brand.cyan : Brand.surfaceStrong,
                opacity: pressed ? 0.75 : 1,
              },
            ]}>
            {sending ? (
              <ActivityIndicator size="small" color={Brand.onAccent} />
            ) : (
              <MaterialCommunityIcons
                name="send"
                size={18}
                color={canSend ? Brand.onAccent : Brand.textFaint}
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={deleting !== null}
        title="Delete this message?"
        message={`It is removed for everyone in the room, including ${
          deleting?.author ?? 'the sender'
        }.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await removeMessage({ messageId: deleting.id as Id<'messages'> });
          } catch (error) {
            toast.show(errorMessage(error), 'error');
          } finally {
            setDeleting(null);
          }
        }}
      />
    </LinearGradient>
  );
}

const useStyles = makeStyles((Brand) => ({
  root: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingBottom: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.borderSubtle,
  },
  headerMark: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: Brand.text, fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: Brand.textFaint, fontSize: 11.5, marginTop: 2 },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messages: { paddingHorizontal: Space.lg, paddingVertical: Space.md },

  empty: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xxl * 2 },
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

  unreadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
  },
  unreadLine: { flex: 1, height: StyleSheet.hairlineWidth * 2, opacity: 0.5 },
  unreadText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 },

  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.sm },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  rowSpaced: { marginTop: Space.md },
  rowTight: { marginTop: 3 },

  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  avatarText: { fontSize: 11.5, fontWeight: '800' },
  avatarSpacer: { width: 32 },

  bubbleColumn: { maxWidth: '82%', gap: 3 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  author: { fontSize: 12.5, fontWeight: '800', flexShrink: 1 },
  roleTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  roleTagText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },

  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  teamText: { color: Brand.textMuted, fontSize: 11.5, fontWeight: '600', flexShrink: 1 },

  bubble: {
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  body: { color: Brand.text, fontSize: 15, lineHeight: 21 },

  time: { color: Brand.textFaint, fontSize: 10 },
  timeMine: { alignSelf: 'flex-end' },
  timeTheirs: { alignSelf: 'flex-start' },

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
  inputWrap: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.borderSubtle,
    backgroundColor: Brand.inputBg,
  },
  input: {
    color: Brand.text,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: Space.md,
    paddingTop: 11,
    paddingBottom: 11,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
