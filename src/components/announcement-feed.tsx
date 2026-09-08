import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, View } from 'react-native';

import { Card, EmptyState, Pill, withAlpha } from '@/components/ui/primitives';
import { ScreenLoading } from '@/components/ui/screen';
import { Space } from '@/constants/brand';
import { makeStyles, useColors } from '@/lib/theme';

export type AnnouncementItem = {
  _id: string;
  title: string;
  body: string;
  audience: string;
  urgent: boolean;
  createdByName: string;
  createdAt: number;
  deliveredTo: number;
  pushedTo?: number;
};

function when(ts: number) {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AnnouncementFeed({
  items,
  accent,
  showAudience = false,
  onDelete,
}: {
  items: AnnouncementItem[] | undefined;
  accent: string;
  showAudience?: boolean;
  onDelete?: (id: string) => void;
}) {
  const Brand = useColors();
  const styles = useStyles();
  if (items === undefined) return <ScreenLoading label="Loading updates" />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon="bullhorn-outline"
        title="No announcements yet"
        message="Anything the organisers broadcast will land here and buzz your phone."
      />
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const tone = item.urgent ? Brand.orange : accent;
        return (
          <Card key={item._id} accent={tone}>
            <View style={styles.head}>
              <View style={[styles.icon, { backgroundColor: withAlpha(tone, 0.14) }]}>
                <MaterialCommunityIcons
                  name={item.urgent ? 'alert-decagram' : 'bullhorn-outline'}
                  size={17}
                  color={tone}
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.meta}>
                  {item.createdByName} · {when(item.createdAt)}
                </Text>
              </View>
              {item.urgent && <Pill label="Urgent" color={Brand.orange} compact />}
            </View>

            <Text style={styles.body}>{item.body}</Text>

            <View style={styles.footer}>
              {showAudience && (
                <Pill label={item.audience} color={Brand.blue} icon="account-multiple-outline" compact />
              )}
              {showAudience && (
                <Text style={styles.delivered}>
                  {item.pushedTo === undefined
                    ? `sent to ${item.deliveredTo}`
                    : `${item.deliveredTo} people · ${item.pushedTo} phone${
                        item.pushedTo === 1 ? '' : 's'
                      } buzzed`}
                </Text>
              )}
              <View style={styles.flex} />
              {!!onDelete && (
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={17}
                  color={Brand.textFaint}
                  onPress={() => onDelete(item._id)}
                />
              )}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  list: { gap: Space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: Brand.text, fontSize: 15, fontWeight: '700' },
  meta: { color: Brand.textFaint, fontSize: 11, marginTop: 2 },
  body: { color: Brand.textDim, fontSize: 13.5, lineHeight: 20, marginTop: Space.md },
  footer: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: Space.md },
  delivered: { color: Brand.textFaint, fontSize: 11 },
}));
