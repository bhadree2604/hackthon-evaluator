import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation } from 'convex/react';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/inputs';
import { ConfirmDialog, useToast } from '@/components/ui/overlays';
import { Banner, Card, Pill, ProgressBar, Section } from '@/components/ui/primitives';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import { parseCsv, SAMPLE_CSV, toImportRows, type ImportRow } from '@/lib/csv';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';
import { errorMessage } from '@/lib/errors';

const CHUNK = 80;

/**
 * Native hands the picker a `file://` path that expo-file-system reads
 * directly. On web the picker returns a `blob:` URL plus the DOM File itself,
 * which that module cannot open, so the text comes from the File (or a fetch
 * of the blob) instead.
 */
async function readPickedText(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web') {
    const file = (asset as DocumentPicker.DocumentPickerAsset & { file?: Blob }).file;
    if (file && typeof file.text === 'function') return file.text();
    return (await fetch(asset.uri)).text();
  }
  return new File(asset.uri).text();
}

const TEMPLATE_HEADER =
  'Team Code,Team Name,Project Title,Problem Code,Domain,Problem Domain,College,Lab,Table,Coordinator Email,Status,Total,Txn ID,Payment Link,Team Photo,Members,Accommodation,Fee/person,Stay/person,Submitted,Member #,Member Name,Email,Phone,Department,Year,Roll No,Photo,Team lead';

type Result = {
  teamsCreated: number;
  teamsUpdated: number;
  membersCreated: number;
  membersUpdated: number;
  labsCreated: number;
  warnings: string[];
  warningCount: number;
};

export default function ImportData() {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const accent = useRoleTheme().admin.accent;
  const router = useRouter();
  const toast = useToast();
  const importRows = useMutation(api.importer.importRows);

  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const report = useMemo(() => {
    if (!raw.trim()) return null;
    try {
      return toImportRows(parseCsv(raw));
    } catch {
      return null;
    }
  }, [raw]);

  const teamCount = useMemo(() => {
    if (!report) return 0;
    return new Set(report.rows.map((r) => r.teamCode.trim().toUpperCase())).size;
  }, [report]);

  const memberCount = useMemo(
    () => report?.rows.filter((r) => r.memberName?.trim()).length ?? 0,
    [report],
  );

  const ready =
    !!report && report.rows.length > 0 && report.missingRequired.length === 0 && !busy;

  async function pickFile() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'text/plain',
          'application/vnd.ms-excel',
          '*/*',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      const asset = picked.assets[0];
      const text = await readPickedText(asset);
      setRaw(text);
      setFileName(asset.name ?? 'selected file');
      setResult(null);
      toast.show(`Loaded ${asset.name ?? 'file'}`, 'success');
    } catch (err) {
      toast.show(errorMessage(err, 'Could not read that file.'), 'error');
    }
  }

  async function runImport() {
    if (!report) return;
    setBusy(true);
    setProgress(0);
    setConfirming(false);

    const totals: Result = {
      teamsCreated: 0,
      teamsUpdated: 0,
      membersCreated: 0,
      membersUpdated: 0,
      labsCreated: 0,
      warnings: [],
      warningCount: 0,
    };

    try {
      const chunks: ImportRow[][] = [];
      for (let i = 0; i < report.rows.length; i += CHUNK) {
        chunks.push(report.rows.slice(i, i + CHUNK));
      }

      for (const [index, chunk] of chunks.entries()) {
        const outcome = await importRows({ rows: chunk });
        totals.teamsCreated += outcome.teamsCreated;
        totals.teamsUpdated += outcome.teamsUpdated;
        totals.membersCreated += outcome.membersCreated;
        totals.membersUpdated += outcome.membersUpdated;
        totals.labsCreated += outcome.labsCreated;
        totals.warnings.push(...outcome.warnings);
        totals.warningCount += outcome.warningCount;
        setProgress((index + 1) / chunks.length);
      }

      setResult(totals);
      toast.show(
        `${totals.teamsCreated} teams added, ${totals.teamsUpdated} updated`,
        totals.warningCount > 0 ? 'info' : 'success',
      );
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen gradient={RoleTheme.admin.gradient} bottomInset={TAB_BAR_INSET} keyboardAware>
      <ScreenHeader
        eyebrow="Organiser"
        title="Import teams"
        subtitle="One row per member. Re-uploading a corrected sheet updates rows instead of duplicating them."
        right={
          <Button
            label="Back"
            size="sm"
            variant="ghost"
            icon="chevron-left"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))}
          />
        }
      />

      <View style={styles.actions}>
        <Button
          label="Pick a CSV file"
          icon="file-delimited-outline"
          accent={accent}
          onPress={pickFile}
          style={styles.flex}
        />
        <Button
          label="Sample"
          variant="secondary"
          icon="text-box-outline"
          accent={accent}
          onPress={() => {
            setRaw(SAMPLE_CSV);
            setFileName('sample data');
            setResult(null);
          }}
        />
      </View>

      <Button
        label="Copy column template"
        variant="ghost"
        icon="content-copy"
        size="sm"
        onPress={async () => {
          await Clipboard.setStringAsync(TEMPLATE_HEADER);
          toast.show('Template header copied', 'success');
        }}
      />

      <TextField
        label={fileName ? `Data from ${fileName}` : 'Or paste rows here'}
        value={raw}
        onChangeText={(text) => {
          setRaw(text);
          setFileName(null);
          setResult(null);
        }}
        placeholder="Paste CSV or tab separated rows, including the header line"
        multiline
        accent={accent}
        style={styles.rawInput}
      />

      {!!report && (
        <Section title="Preview">
          <Card accent={report.missingRequired.length ? Brand.red : Brand.green}>
            <View style={styles.previewRow}>
              <Pill label={`${teamCount} teams`} color={accent} icon="account-group-outline" />
              <Pill label={`${memberCount} members`} color={Brand.blue} icon="account-multiple-outline" />
              <Pill label={`${report.rows.length} rows`} color={Brand.lilac} icon="table" />
            </View>

            {report.missingRequired.length > 0 ? (
              <Text style={styles.error}>
                Missing required columns: {report.missingRequired.join(', ')}. Add a team code and
                team name column, then try again.
              </Text>
            ) : (
              <Text style={styles.matched}>
                Matched {report.matched.length} columns
                {report.ignored.length > 0 ? `, ignoring ${report.ignored.join(', ')}` : ''}.
              </Text>
            )}

            <View style={styles.mappingList}>
              {report.matched.slice(0, 10).map((line) => (
                <View key={line} style={styles.mappingRow}>
                  <MaterialCommunityIcons name="check" size={12} color={Brand.green} />
                  <Text style={styles.mappingText}>{line}</Text>
                </View>
              ))}
            </View>
          </Card>
        </Section>
      )}

      {busy && (
        <Card>
          <Text style={styles.progressLabel}>Uploading {Math.round(progress * 100)}%</Text>
          <ProgressBar value={progress} max={1} color={accent} />
        </Card>
      )}

      <Button
        label="Import into Convex"
        icon="tray-arrow-up"
        accent={accent}
        size="lg"
        full
        disabled={!ready}
        loading={busy}
        onPress={() => setConfirming(true)}
      />

      {!!result && (
        <Section title="Result">
          <Banner
            tone={result.warningCount > 0 ? 'warn' : 'success'}
            title={`${result.teamsCreated} teams created · ${result.teamsUpdated} updated`}
            message={`${result.membersCreated} members added, ${result.membersUpdated} updated, ${result.labsCreated} labs created.`}
          />
          {result.warnings.length > 0 && (
            <Card accent={Brand.amber}>
              <Text style={styles.warnTitle}>
                {result.warningCount} warning{result.warningCount === 1 ? '' : 's'}
              </Text>
              {result.warnings.slice(0, 12).map((warning) => (
                <Text key={warning} style={styles.warnLine}>
                  · {warning}
                </Text>
              ))}
            </Card>
          )}
          <Button
            label="Create participant logins"
            variant="secondary"
            icon="key-outline"
            accent={Brand.lilac}
            full
            onPress={() => router.push('/admin/participants')}
          />
        </Section>
      )}

      <ConfirmDialog
        visible={confirming}
        title="Import this sheet?"
        message={`${teamCount} teams and ${memberCount} members will be created or updated. Existing assignments are preserved.`}
        confirmLabel="Import"
        loading={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={runImport}
      />
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: Space.sm },
  rawInput: { minHeight: 150, fontSize: 12.5 },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  error: { color: Brand.red, fontSize: 12.5, lineHeight: 18, marginTop: Space.md },
  matched: { color: Brand.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: Space.md },
  mappingList: { gap: 4, marginTop: Space.md },
  mappingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mappingText: { color: Brand.textFaint, fontSize: 11.5 },
  progressLabel: { color: Brand.textDim, fontSize: 12.5, fontWeight: '700', marginBottom: Space.sm },
  warnTitle: { color: Brand.amber, fontSize: 13.5, fontWeight: '700', marginBottom: Space.sm },
  warnLine: { color: Brand.textMuted, fontSize: 11.5, lineHeight: 17 },
}));
