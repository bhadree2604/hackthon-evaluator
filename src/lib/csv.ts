/**
 * Small CSV reader plus a mapper onto the Convex import row shape.
 * Registration exports never agree on column names, so headers are matched
 * against a list of aliases rather than an exact string.
 */

export type ImportRow = {
  teamCode: string;
  teamName: string;
  projectTitle?: string;
  problemStatementId?: string;
  domain?: string;
  track?: 'software' | 'hardware' | 'open';
  college?: string;
  lab?: string;
  tableNo?: string;
  coordinatorEmail?: string;
  teamPhotoUrl?: string;
  paymentStatus?: 'paid' | 'pending' | 'failed' | 'waived';
  paymentLink?: string;
  paymentAmount?: number;
  paymentReference?: string;
  paymentProofUrl?: string;
  memberName?: string;
  memberEmail?: string;
  memberPhone?: string;
  memberDepartment?: string;
  memberYear?: string;
  memberRollNo?: string;
  memberPhotoUrl?: string;
  isLeader?: boolean;
};

/** Handles quoted fields, escaped quotes, embedded newlines and CRLF. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const text = input.replace(/^﻿/, '');

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',' || char === '\t') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const ALIASES: Record<keyof ImportRow, string[]> = {
  teamCode: ['teamcode', 'code', 'teamid', 'team id', 'team code', 'teamno', 'team no'],
  teamName: ['teamname', 'team', 'team name', 'nameofteam', 'name of the team'],
  // "Problem statement" holds the prose in the registration export; the short
  // code lives in "Problem code" and is matched by problemStatementId above.
  projectTitle: [
    'projecttitle',
    'project',
    'project title',
    'idea',
    'ideatitle',
    'title',
    'problem statement',
  ],
  problemStatementId: [
    'problemstatementid',
    'problemstatement',
    'problem',
    'psid',
    'ps id',
    'problem id',
    'problem code',
    'problem statement id',
  ],
  domain: ['domain', 'category', 'theme'],
  track: ['track', 'type', 'stream'],
  college: ['college', 'institution', 'institute', 'collegename', 'college name'],
  lab: ['lab', 'room', 'venue', 'labname', 'lab name'],
  tableNo: ['table', 'tableno', 'table no', 'tablenumber', 'seat'],
  coordinatorEmail: ['coordinatoremail', 'coordinator email', 'coordinator', 'coordinatormail'],
  teamPhotoUrl: ['teamphoto', 'teamphotourl', 'team photo', 'team image', 'teamimage'],
  paymentStatus: [
    'paymentstatus',
    'payment status',
    'paid',
    'payment',
    'status',
    'feestatus',
    'fee status',
  ],
  paymentLink: ['paymentlink', 'payment link', 'paymenturl', 'payment url', 'paylink'],
  paymentAmount: ['amount', 'paymentamount', 'payment amount', 'total', 'fee', 'fees'],
  paymentReference: [
    'paymentreference',
    'payment reference',
    'paymentref',
    'transactionid',
    'transaction id',
    'txn',
    'txnid',
    'orderid',
  ],
  paymentProofUrl: [
    'paymentproof',
    'payment proof',
    'proof',
    'screenshot',
    'paymentscreenshot',
    'receipt',
  ],
  memberName: ['membername', 'member name', 'name', 'participant', 'participantname', 'student'],
  memberEmail: ['memberemail', 'member email', 'email', 'emailid', 'email id', 'mail'],
  memberPhone: ['memberphone', 'phone', 'mobile', 'contact', 'phonenumber', 'mobile number'],
  memberDepartment: ['department', 'dept', 'branch', 'memberdepartment'],
  memberYear: ['year', 'yearofstudy', 'year of study', 'studyyear'],
  memberRollNo: ['rollno', 'roll', 'roll no', 'registernumber', 'register number', 'regno', 'reg no'],
  memberPhotoUrl: ['photo', 'image', 'memberphoto', 'photourl', 'profilephoto', 'picture'],
  isLeader: ['isleader', 'leader', 'is leader', 'teamlead', 'team lead', 'role'],
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchColumn(header: string): keyof ImportRow | null {
  const normalized = normalizeHeader(header);
  const collapsed = normalized.replace(/\s/g, '');

  for (const [field, aliases] of Object.entries(ALIASES) as [keyof ImportRow, string[]][]) {
    if (aliases.some((alias) => alias === normalized || alias.replace(/\s/g, '') === collapsed)) {
      return field;
    }
  }
  return null;
}

function truthy(value: string) {
  return ['yes', 'y', 'true', '1', 'leader', 'team lead', 'lead'].includes(
    value.trim().toLowerCase(),
  );
}

function readTrack(value: string): ImportRow['track'] {
  const v = value.trim().toLowerCase();
  if (v.startsWith('soft') || v === 'sw') return 'software';
  if (v.startsWith('hard') || v === 'hw') return 'hardware';
  if (v.startsWith('open') || v.includes('wildcard')) return 'open';
  return undefined;
}

function readPayment(value: string): ImportRow['paymentStatus'] {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  if (
    ['paid', 'yes', 'y', 'true', '1', 'success', 'completed', 'done', 'verified'].includes(v)
  ) {
    return 'paid';
  }
  if (['waived', 'free', 'exempt', 'na', 'n/a'].includes(v)) return 'waived';
  if (['failed', 'fail', 'declined', 'error'].includes(v)) return 'failed';
  return 'pending';
}

/**
 * Spreadsheets store phone numbers as text by prefixing an apostrophe, which
 * then travels into the export. Strip it, and any spacing, so the number is
 * dialable straight from the app.
 */
function cleanPhone(value: string | undefined) {
  if (!value) return undefined;
  const cleaned = value.replace(/^'+/, '').replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

export type MappingReport = {
  rows: ImportRow[];
  matched: string[];
  ignored: string[];
  missingRequired: string[];
};

export function toImportRows(table: string[][]): MappingReport {
  if (table.length < 2) {
    return { rows: [], matched: [], ignored: [], missingRequired: ['teamCode', 'teamName'] };
  }

  const header = table[0];
  const columns = header.map(matchColumn);

  const matched: string[] = [];
  const ignored: string[] = [];
  header.forEach((name, index) => {
    if (columns[index]) matched.push(`${name.trim()} → ${columns[index]}`);
    else if (name.trim()) ignored.push(name.trim());
  });

  const missingRequired: string[] = [];
  if (!columns.includes('teamCode')) missingRequired.push('teamCode');
  if (!columns.includes('teamName')) missingRequired.push('teamName');

  const rows: ImportRow[] = [];

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const row: Record<string, string> = {};

    columns.forEach((field, index) => {
      if (!field) return;
      const value = (cells[index] ?? '').trim();
      if (value) row[field] = value;
    });

    if (!row.teamCode && !row.teamName) continue;

    const amount = row.paymentAmount ? Number(row.paymentAmount.replace(/[^\d.]/g, '')) : NaN;

    rows.push({
      teamCode: row.teamCode ?? '',
      teamName: row.teamName ?? '',
      projectTitle: row.projectTitle,
      problemStatementId: row.problemStatementId,
      domain: row.domain,
      // Falls back to the domain column: the registration export names the
      // track "Software" / "Hardware" / "Open Innovation" under Domain.
      track: readTrack(row.track ?? row.domain ?? ''),
      college: row.college,
      lab: row.lab,
      tableNo: row.tableNo,
      coordinatorEmail: row.coordinatorEmail,
      teamPhotoUrl: row.teamPhotoUrl,
      paymentStatus: row.paymentStatus ? readPayment(row.paymentStatus) : undefined,
      paymentLink: row.paymentLink,
      paymentAmount: Number.isFinite(amount) ? amount : undefined,
      paymentReference: row.paymentReference,
      paymentProofUrl: row.paymentProofUrl,
      memberName: row.memberName,
      memberEmail: row.memberEmail,
      memberPhone: cleanPhone(row.memberPhone),
      memberDepartment: row.memberDepartment,
      memberYear: row.memberYear,
      memberRollNo: row.memberRollNo,
      memberPhotoUrl: row.memberPhotoUrl,
      isLeader: row.isLeader ? truthy(row.isLeader) : undefined,
    });
  }

  return { rows, matched, ignored, missingRequired };
}

export const SAMPLE_CSV = `Team Code,Team Name,Project Title,Problem Statement,Track,Lab,Table,Payment Status,Amount,Member Name,Email,Phone,Department,Year,Roll No,Leader
HF3-001,Circuit Breakers,Offline LLM tutor,HF3-SW-08,software,Lab 1,T1,paid,500,Ravi Kumar,ravi@example.com,9876543210,CSE,III,21CS101,yes
HF3-001,Circuit Breakers,Offline LLM tutor,HF3-SW-08,software,Lab 1,T1,paid,500,Meera S,meera@example.com,9876543211,CSE,III,21CS102,no
HF3-002,Volt Runners,Edge fault detector,HF3-HW-03,hardware,Lab 2,T4,pending,500,Arun P,arun@example.com,9876543212,ECE,II,22EC010,yes`;
