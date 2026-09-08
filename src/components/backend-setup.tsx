import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/inputs';
import { Banner, Card } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/screen';
import { EVENT, Space } from '@/constants/brand';
import { deriveSiteUrl, isValidConvexUrl, normalizeConvexUrl, saveBackendUrl } from '@/lib/backend';
import { makeStyles, useColors, useNeutralGradient } from '@/lib/theme';

/**
 * First-launch screen for a build that shipped without EXPO_PUBLIC_CONVEX_URL.
 * One organiser pastes the deployment URL, everyone else never sees this.
 */
export function BackendSetup({ onSaved }: { onSaved: (convexUrl: string) => void }) {
  const Brand = useColors();
  const neutral = useNeutralGradient();
  const styles = useStyles();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeConvexUrl(url);
  const valid = url.trim().length > 0 && isValidConvexUrl(url);

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const config = await saveBackendUrl(url);
      onSaved(config.convexUrl);
    } catch {
      setError('Could not save that on this device. Check storage permissions and retry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen gradient={neutral} keyboardAware>
      <View style={styles.head}>
        <Image
          source={require('@/assets/images/brand/icon-512.png')}
          style={styles.mark}
          contentFit="contain"
        />
        <Text style={styles.title}>Connect the backend</Text>
        <Text style={styles.subtitle}>
          This build of {EVENT.name} does not have a Convex URL baked in. Paste it once and this
          phone remembers it.
        </Text>
      </View>

      <Banner
        tone="info"
        title="Where to find it"
        message="Run `npx convex dev` in the project, then copy the deployment URL it prints, for example https://cheerful-otter-123.convex.cloud"
      />

      <Card style={styles.form}>
        <TextField
          label="Convex deployment URL"
          value={url}
          onChangeText={(next) => {
            setUrl(next);
            setError(null);
          }}
          placeholder="https://your-deployment.convex.cloud"
          icon="cloud-outline"
          autoCapitalize="none"
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={save}
          error={error}
          hint={valid ? `HTTP routes: ${deriveSiteUrl(normalized)}` : undefined}
        />

        <Button
          label="Connect"
          icon="check"
          size="lg"
          full
          disabled={!valid}
          loading={busy}
          onPress={save}
        />
      </Card>

      <View style={styles.note}>
        <MaterialCommunityIcons name="information-outline" size={15} color={Brand.textFaint} />
        <Text style={styles.noteText}>
          A production build should set EXPO_PUBLIC_CONVEX_URL in .env.local so nobody has to do
          this.
        </Text>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  head: { alignItems: 'center', gap: Space.sm, paddingTop: Space.xxl },
  mark: { width: 58, height: 58 },
  title: {
    color: Brand.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: Space.md,
  },
  subtitle: {
    color: Brand.textMuted,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  form: { gap: Space.lg, padding: Space.xl },
  note: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'flex-start',
    paddingHorizontal: Space.sm,
  },
  noteText: {
    color: Brand.textFaint,
    fontSize: 11.5,
    lineHeight: 17,
    flex: 1,
  },
}));

