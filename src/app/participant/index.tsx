import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TeamIdentity, TeamResults } from '@/components/participant-extras';
import { RegistrationDetails } from '@/components/registration-details';
import { TAB_BAR_INSET } from '@/components/role-shell';
import { Button } from '@/components/ui/button';
import {
  Avatar,
  Banner,
  Card,
  EmptyState,
  KeyValue,
  Pill,
  ProgressBar,
  Section,
  withAlpha,
} from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { attendanceStatusMeta, EVENT, paymentStatusMeta, Space, type AttendanceStatus, type PaymentStatus } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import { useSession } from '@/lib/session';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';


export default function MyTeam() {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const accent = useRoleTheme().participant.accent;
  const { profile } = useSession();
  const data = useQuery(api.participants.myTeam, profile?.teamId ? {} : 'skip');

  if (!profile?.teamId) {
    return (
      <Screen gradient={RoleTheme.participant.gradient} bottomInset={TAB_BAR_INSET}>
        <ScreenHeader eyebrow="Participant" title="No team linked" />
        <EmptyState
          icon="account-question-outline"
          title="Your account is not linked to a team"
          message={`Ask the organisers to re-run the participant setup, or email ${EVENT.supportEmail}.`}
        />
      </Screen>
    );
  }

  if (data === undefined) {
    return (
      <Screen gradient={RoleTheme.participant.gradient} bottomInset={TAB_BAR_INSET}>
        <ScreenLoading label="Loading your team" />
      </Screen>
    );
  }

  const { team, lab, coordinator, members, attendance } = data;
  const payment = paymentStatusMeta(Brand)[(team.payment.status ?? 'pending') as PaymentStatus];
  const attended = attendance.filter((a) => a.myStatus === 'present' || a.myStatus === 'late').length;

  return (
    <Screen gradient={RoleTheme.participant.gradient} bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow={team.code}
        title={team.name}
        subtitle={team.projectTitle ?? 'No project title recorded yet.'}
      />

      <TeamIdentity code={team.code} teamName={team.name} />

      <TeamResults accent={accent} />

      {team.status !== 'active' && (
        <Banner
          tone="danger"
          title={`Team marked ${team.status}`}
          message="Contact the organisers straight away if this is not right."
        />
      )}

      {!!team.photoUrl && (
        <Image source={{ uri: team.photoUrl }} style={styles.hero} contentFit="cover" transition={200} />
      )}

      {/* Payment ---------------------------------------------------------- */}
      <Section title="Registration">
        <Card accent={payment.color}>
          <View style={styles.payTop}>
            <View
              style={[styles.payIcon, { backgroundColor: withAlpha(payment.color, 0.14) }]}>
              <MaterialCommunityIcons
                name={payment.icon as never}
                size={20}
                color={payment.color}
              />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.payStatus, { color: payment.color }]}>{payment.label}</Text>
              <Text style={styles.paySub}>
                {team.payment.amount != null
                  ? `₹${team.payment.amount.toLocaleString('en-IN')}`
                  : 'Amount not recorded'}
                {team.payment.reference ? ` · ref ${team.payment.reference}` : ''}
              </Text>
            </View>
          </View>

          <RegistrationDetails
            bordered
            teamSize={team.registration.teamSize}
            rosterCount={members.length}
            accommodationCount={team.registration.accommodationCount}
            feePerPerson={team.registration.feePerPerson}
            stayFeePerPerson={team.registration.stayFeePerPerson}
            amount={team.payment.amount}
            registeredAt={team.registration.registeredAt}
          />

          {!!team.payment.proofUrl && (
            <Pressable
              accessibilityRole="button"
              onPress={() => Linking.openURL(team.payment.proofUrl!).catch(() => {})}>
              <Image
                source={{ uri: team.payment.proofUrl }}
                style={styles.proof}
                contentFit="contain"
                transition={200}
              />
            </Pressable>
          )}

          {!!team.payment.link && team.payment.status !== 'paid' && (
            <Button
              label="Open payment link"
              icon="credit-card-outline"
              accent={payment.color}
              style={styles.payButton}
              full
              onPress={() => Linking.openURL(team.payment.link!).catch(() => {})}
            />
          )}
        </Card>
      </Section>

      {/* Where to be ------------------------------------------------------ */}
      <Section title="Where to be">
        <Card>
          <View style={styles.kvGrid}>
            <KeyValue label="Lab" value={lab?.name} color={accent} />
            <KeyValue label="Block" value={lab?.block} />
            <KeyValue label="Table" value={team.tableNo} />
            <KeyValue label="Venue" value={EVENT.host} />
          </View>

          {!!coordinator && (
            <View style={styles.coordinator}>
              <Avatar name={coordinator.name} size={38} color={Brand.green} />
              <View style={styles.flex}>
                <Text style={styles.coordLabel}>YOUR COORDINATOR</Text>
                <Text style={styles.coordName}>{coordinator.name}</Text>
              </View>
              {!!coordinator.phone && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${coordinator.name}`}
                  onPress={() => Linking.openURL(`tel:${coordinator.phone}`).catch(() => {})}
                  style={[styles.callButton, { backgroundColor: withAlpha(Brand.green, 0.15) }]}>
                  <MaterialCommunityIcons name="phone" size={17} color={Brand.green} />
                </Pressable>
              )}
            </View>
          )}
        </Card>
      </Section>

      {/* Project ---------------------------------------------------------- */}
      <Section title="Project">
        <Card>
          <View style={styles.kvGrid}>
            <KeyValue label="Problem code" value={team.problemStatementId} color={accent} />
            <KeyValue label="Track" value={team.track} />
            <KeyValue label="Domain" value={team.domain} />
            <KeyValue label="Problem domain" value={team.problemDomain} />
            <KeyValue label="College" value={team.college} />
          </View>
          {!!team.notes && <Text style={styles.notes}>{team.notes}</Text>}
        </Card>
      </Section>

      {/* Members ---------------------------------------------------------- */}
      <Section title="Team members" hint={`${members.length} registered`}>
        <View style={styles.memberList}>
          {members.map((member) => (
            <Card key={member._id} accent={member.isMe ? accent : undefined}>
              <View style={styles.memberRow}>
                {member.photoUrl ? (
                  <Image
                    source={{ uri: member.photoUrl }}
                    style={styles.memberPhoto}
                    contentFit="cover"
                    transition={150}
                  />
                ) : (
                  <Avatar name={member.name} size={46} color={member.isMe ? accent : Brand.blue} />
                )}

                <View style={styles.flex}>
                  <View style={styles.memberNameRow}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {member.name}
                    </Text>
                    {member.isLeader && <Pill label="Leader" color={Brand.amber} compact />}
                    {member.isMe && <Pill label="You" color={accent} compact />}
                  </View>
                  <Text style={styles.memberMeta} numberOfLines={1}>
                    {[member.rollNo, member.department, member.year].filter(Boolean).join(' · ') ||
                      'No academic details recorded'}
                  </Text>
                  {!!member.email && (
                    <Text style={styles.memberContact} numberOfLines={1}>
                      {member.email}
                    </Text>
                  )}
                </View>

                <View style={styles.memberActions}>
                  {!!member.phone && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${member.name}`}
                      onPress={() => Linking.openURL(`tel:${member.phone}`).catch(() => {})}
                      style={styles.miniButton}>
                      <MaterialCommunityIcons name="phone" size={15} color={Brand.textDim} />
                    </Pressable>
                  )}
                  {!!member.email && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Email ${member.name}`}
                      onPress={() => Linking.openURL(`mailto:${member.email}`).catch(() => {})}
                      style={styles.miniButton}>
                      <MaterialCommunityIcons name="email-outline" size={15} color={Brand.textDim} />
                    </Pressable>
                  )}
                </View>
              </View>
            </Card>
          ))}
        </View>
      </Section>

      {/* Attendance ------------------------------------------------------- */}
      <Section title="Your attendance" hint={`${attended} of ${attendance.length} sessions`}>
        <Card>
          {attendance.length === 0 ? (
            <Text style={styles.notes}>No attendance sessions have been opened yet.</Text>
          ) : (
            <View style={styles.attendanceList}>
              <ProgressBar
                value={attended}
                max={Math.max(1, attendance.length)}
                color={accent}
              />
              {attendance.map((row) => {
                const meta = row.myStatus
                  ? attendanceStatusMeta(Brand)[row.myStatus as AttendanceStatus]
                  : null;
                return (
                  <View key={row.sessionId} style={styles.attendanceRow}>
                    <Text style={styles.sessionName} numberOfLines={1}>
                      {row.sessionName}
                    </Text>
                    <Text style={styles.teamCount}>
                      {row.present}/{row.total} team
                    </Text>
                    {meta ? (
                      <Pill label={meta.label} color={meta.color} icon={meta.icon as never} compact />
                    ) : (
                      <Pill label="Not marked" color={Brand.textFaint} compact />
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </Card>
      </Section>

      {/* Gallery ---------------------------------------------------------- */}
      {team.imageUrls.length > 0 && (
        <Section title="Photos">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
            {team.imageUrls.map((url) => (
              <Pressable key={url} onPress={() => Linking.openURL(url).catch(() => {})}>
                <Image source={{ uri: url }} style={styles.galleryItem} contentFit="cover" transition={150} />
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  hero: { width: '100%', height: 168, borderRadius: 16, backgroundColor: Brand.surface },

  payTop: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  payIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payStatus: { fontSize: 15.5, fontWeight: '800' },
  paySub: { color: Brand.textMuted, fontSize: 12.5, marginTop: 3 },
  proof: {
    width: '100%',
    height: 190,
    borderRadius: 12,
    marginTop: Space.lg,
    backgroundColor: Brand.surfaceStrong,
  },
  payButton: { marginTop: Space.lg },

  kvGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.lg },
  coordinator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.xl,
    paddingTop: Space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.borderSubtle,
  },
  coordLabel: { color: Brand.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  coordName: { color: Brand.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
  callButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  notes: { color: Brand.textMuted, fontSize: 13, lineHeight: 19, marginTop: Space.md },

  memberList: { gap: Space.md },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  memberPhoto: { width: 46, height: 46, borderRadius: 23, backgroundColor: Brand.surface },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, flexWrap: 'wrap' },
  memberName: { color: Brand.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  memberMeta: { color: Brand.textMuted, fontSize: 11.5, marginTop: 3 },
  memberContact: { color: Brand.textFaint, fontSize: 11, marginTop: 2 },
  memberActions: { flexDirection: 'row', gap: 6 },
  miniButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.inputBgFocused,
  },

  attendanceList: { gap: Space.md },
  attendanceRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  sessionName: { color: Brand.textDim, fontSize: 13, flex: 1 },
  teamCount: { color: Brand.textFaint, fontSize: 11.5, fontWeight: '600' },

  gallery: { flexDirection: 'row', gap: Space.sm, paddingRight: Space.lg },
  galleryItem: { width: 130, height: 96, borderRadius: 12, backgroundColor: Brand.surface },
}));
