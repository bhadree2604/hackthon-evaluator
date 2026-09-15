import { StyleSheet, Text, View } from 'react-native';

import { KeyValue } from '@/components/ui/primitives';
import { Space } from '@/constants/brand';
import { makeStyles } from '@/lib/theme';

const rupees = (value: number) => `₹${value.toLocaleString('en-IN')}`;

/** "No one", "1 person", "3 people", or null when the sheet did not say. */
export function stayLabel(count: number | null | undefined) {
  if (count == null) return null;
  if (count === 0) return 'No one';
  return `${count} ${count === 1 ? 'person' : 'people'}`;
}

function registeredLabel(timestamp: number | null | undefined) {
  if (timestamp == null) return null;
  return new Date(timestamp).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * What the team filled in on the registration form: how many they said they
 * are, who needs a place to stay, and how the fee adds up.
 */
export function RegistrationDetails({
  teamSize,
  rosterCount,
  accommodationCount,
  feePerPerson,
  stayFeePerPerson,
  amount,
  reference,
  registeredAt,
  bordered = false,
}: {
  teamSize: number | null | undefined;
  rosterCount: number;
  accommodationCount: number | null | undefined;
  feePerPerson: number | null | undefined;
  stayFeePerPerson: number | null | undefined;
  amount: number | null | undefined;
  /** Left out where the reference is already shown next to the payment. */
  reference?: string | null;
  registeredAt: number | null | undefined;
  /** Draws a divider above, for use inside a card that already has content. */
  bordered?: boolean;
}) {
  const styles = useStyles();

  const size =
    teamSize == null
      ? null
      : teamSize === rosterCount
        ? `${teamSize} members`
        : `${teamSize} declared · ${rosterCount} on roster`;

  let breakdown: string | null = null;
  if (feePerPerson != null) {
    const people = teamSize ?? rosterCount;
    const stay = stayFeePerPerson != null ? (accommodationCount ?? 0) : 0;
    const parts = [`${people} × ${rupees(feePerPerson)} entry`];
    if (stay > 0 && stayFeePerPerson != null) {
      parts.push(`${stay} × ${rupees(stayFeePerPerson)} stay`);
    }
    const expected = people * feePerPerson + stay * (stayFeePerPerson ?? 0);
    breakdown = `${parts.join(' + ')} = ${rupees(expected)}`;
    if (amount != null && amount !== expected) breakdown += ` · recorded ${rupees(amount)}`;
  }

  return (
    <View style={[styles.root, bordered && styles.bordered]}>
      <View style={styles.grid}>
        <KeyValue label="Team size" value={size} />
        <KeyValue label="Need a stay" value={stayLabel(accommodationCount)} />
        {reference !== undefined && <KeyValue label="Txn ID" value={reference} />}
        <KeyValue label="Registered" value={registeredLabel(registeredAt)} />
      </View>
      {!!breakdown && <Text style={styles.breakdown}>{breakdown}</Text>}
    </View>
  );
}

const useStyles = makeStyles((Brand) => ({
  root: { gap: Space.md },
  bordered: {
    marginTop: Space.lg,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.borderSubtle,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.lg },
  breakdown: { color: Brand.textMuted, fontSize: 12.5, lineHeight: 18 },
}));
