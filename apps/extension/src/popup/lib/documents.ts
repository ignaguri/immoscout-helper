// Client-side Mieterselbstauskunft PDF generation. Ports the Python
// fill_selbstauskunft.py: draws text at fixed coordinates onto the bundled
// template (which has no AcroForm fields) and appends user-uploaded attachments.
// Runs entirely in the popup (DOM context) - no server, no Python.

import { PDFDocument, type PDFFont, type PDFPage, StandardFonts } from 'pdf-lib';
import * as C from '../../shared/constants';
import { listAttachments } from '../../shared/idb-attachments';

const TEMPLATE_URL = 'templates/Selbstauskunft____neutral.pdf';
const COL_X = 250;

export interface DocumentsFormData {
  address: string;
  moveIn: string;
  name: string;
  maritalStatus: string;
  birthDate: string;
  currentAddress: string;
  phone: string;
  email: string;
  profession: string;
  netIncome: string;
  employer: string;
  employedSince: string;
  currentLandlord: string;
  landlordPhone: string;
  landlordEmail: string;
  signingDate: string;
  signatureName: string;
}

// ISO date (YYYY-MM-DD from a date input) -> German DD.MM.YYYY. Leaves other input as-is.
function formatDate(isoDate: string | undefined): string {
  if (!isoDate?.includes('-')) {
    return isoDate || '';
  }
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

// Plain number -> German currency "X.XXX,XX EUR".
function formatEurAmount(val: string | number | undefined): string {
  if (!val) {
    return '';
  }
  const num = Number.parseFloat(String(val));
  if (Number.isNaN(num)) {
    return String(val);
  }
  const parts = num.toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${intPart},${parts[1]} EUR`;
}

function todayGermanDate(): string {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${today.getFullYear()}`;
}

// Gather profile data from chrome.storage.local and format it into the shape the
// template filler expects. Ported from background/message-handler.ts.
export async function buildDocumentData(address: string, moveIn: string): Promise<DocumentsFormData> {
  const docKeys = [
    C.PROFILE_NAME_KEY,
    C.PROFILE_BIRTH_DATE_KEY,
    C.PROFILE_MARITAL_STATUS_KEY,
    C.PROFILE_CURRENT_ADDRESS_KEY,
    C.PROFILE_EMAIL_KEY,
    C.PROFILE_OCCUPATION_KEY,
    C.PROFILE_NET_INCOME_KEY,
    C.PROFILE_EMPLOYER_KEY,
    C.PROFILE_EMPLOYED_SINCE_KEY,
    C.PROFILE_CURRENT_LANDLORD_KEY,
    C.PROFILE_LANDLORD_PHONE_KEY,
    C.PROFILE_LANDLORD_EMAIL_KEY,
    C.FORM_PHONE_KEY,
  ];
  const profile: Record<string, string | undefined> = await chrome.storage.local.get(docKeys);

  const nameRaw = profile[C.PROFILE_NAME_KEY] || '';
  // Convert "First Last" to "Last, First" for the form.
  const nameParts = nameRaw.split(' ').filter(Boolean);
  const formName = nameParts.length >= 2 ? `${nameParts.slice(1).join(' ')}, ${nameParts[0]}` : nameRaw;

  return {
    address,
    name: formName,
    moveIn: formatDate(moveIn),
    birthDate: formatDate(profile[C.PROFILE_BIRTH_DATE_KEY]),
    maritalStatus: profile[C.PROFILE_MARITAL_STATUS_KEY] || '',
    currentAddress: profile[C.PROFILE_CURRENT_ADDRESS_KEY] || '',
    phone: profile[C.FORM_PHONE_KEY] || '',
    email: profile[C.PROFILE_EMAIL_KEY] || '',
    profession: profile[C.PROFILE_OCCUPATION_KEY] || '',
    netIncome: formatEurAmount(profile[C.PROFILE_NET_INCOME_KEY]),
    employer: profile[C.PROFILE_EMPLOYER_KEY] || '',
    employedSince: formatDate(profile[C.PROFILE_EMPLOYED_SINCE_KEY]),
    currentLandlord: profile[C.PROFILE_CURRENT_LANDLORD_KEY] || '',
    landlordPhone: profile[C.PROFILE_LANDLORD_PHONE_KEY] || '',
    landlordEmail: profile[C.PROFILE_LANDLORD_EMAIL_KEY] || '',
    signingDate: todayGermanDate(),
    signatureName: nameRaw,
  };
}

// Draws page 1. Coordinates copied verbatim from create_overlay_page1 in the
// Python source. pdf-lib origin is bottom-left, matching reportlab.
function drawPage1(page: PDFPage, helv: PDFFont, helvBold: PDFFont, data: DocumentsFormData): void {
  const put = (x: number, y: number, text: string, size = 10, font = helv) => {
    page.drawText(text, { x, y, size, font });
  };

  put(45, 708, data.address);
  put(75, 661, data.moveIn);
  put(COL_X, 496, data.name);
  put(COL_X, 476, data.maritalStatus);
  put(COL_X, 457, data.birthDate);

  const currentAddress = data.currentAddress;
  if (currentAddress.includes(',')) {
    const idx = currentAddress.indexOf(',');
    const street = currentAddress.slice(0, idx).trim();
    const city = currentAddress.slice(idx + 1).trim();
    put(COL_X, 440, street);
    put(COL_X, 427, city);
  } else {
    put(COL_X, 440, currentAddress);
  }

  put(COL_X, 369, data.phone);
  put(COL_X, 350, data.email);
  put(COL_X, 331, data.profession);
  put(COL_X, 312, data.netIncome);

  // Employer (Helvetica 9), split on first comma into up to 2 lines.
  const employer = data.employer;
  const employerLines = employer.includes(',')
    ? [employer.slice(0, employer.indexOf(',')).trim(), employer.slice(employer.indexOf(',') + 1).trim()]
    : [employer];
  put(COL_X, 295, employerLines[0], 9);
  if (employerLines.length > 1) {
    put(COL_X, 283, employerLines[1], 9);
  }
  if (data.employedSince) {
    const yEmployed = employerLines.length <= 1 ? 283 : 271;
    put(COL_X, yEmployed, `beschäftigt seit ${data.employedSince}`, 9);
  }

  // Current landlord (Helvetica 9).
  put(COL_X, 229, data.currentLandlord, 9);
  put(COL_X, 217, data.landlordPhone, 9);
  put(COL_X, 205, data.landlordEmail, 9);

  // "Weitere Personen" nein checkbox (Helvetica-Bold 11).
  put(399, 137, 'X', 11, helvBold);
}

// Draws page 2. Coordinates copied verbatim from create_overlay_page2.
function drawPage2(page: PDFPage, helv: PDFFont, helvBold: PDFFont, data: DocumentsFormData): void {
  // "nein" checkboxes (Helvetica-Bold 11).
  const neinX = 256;
  const rowsY = [753, 720, 681, 632, 591, 553, 508, 470];
  for (const y of rowsY) {
    page.drawText('X', { x: neinX, y, size: 11, font: helvBold });
  }

  // Ort, Datum (Helvetica 10).
  const signingDate = data.signingDate || todayGermanDate();
  page.drawText(`München, ${signingDate}`, { x: 40, y: 185, size: 10, font: helv });

  // Signature (Helvetica 10). signatureName is always provided by buildDocumentData,
  // but keep the Python fallback (flip "Last, First" -> "First Last") for safety.
  let signatureName = data.signatureName || data.name.split(',')[0].trim();
  const nameParts = data.name.split(',');
  if (nameParts.length === 2 && !data.signatureName) {
    signatureName = `${nameParts[1].trim()} ${nameParts[0].trim()}`;
  }
  page.drawText(signatureName, { x: 260, y: 185, size: 10, font: helv });
}

// Fills the template and appends stored attachments. Returns the final PDF bytes.
export async function fillSelbstauskunft(data: DocumentsFormData): Promise<Uint8Array> {
  const templateResp = await fetch(chrome.runtime.getURL(TEMPLATE_URL));
  if (!templateResp.ok) {
    throw new Error('Template PDF not found in extension bundle');
  }
  const templateBytes = await templateResp.arrayBuffer();

  const pdfDoc = await PDFDocument.load(templateBytes);
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  drawPage1(pdfDoc.getPage(0), helv, helvBold, data);
  drawPage2(pdfDoc.getPage(1), helv, helvBold, data);

  // Append attachments in upload order. Skip any that fail to parse.
  const attachments = await listAttachments();
  for (const attachment of attachments) {
    try {
      const donor = await PDFDocument.load(attachment.bytes);
      const copied = await pdfDoc.copyPages(donor, donor.getPageIndices());
      for (const donorPage of copied) {
        pdfDoc.addPage(donorPage);
      }
    } catch (err) {
      console.warn(`[Documents] Skipping unreadable attachment "${attachment.filename}":`, err);
    }
  }

  return pdfDoc.save();
}

// Builds the download filename: Bewerbungsunterlagen_<LastName>_<Street>.pdf
export function documentFilename(address: string, name: string): string {
  const nameParts = name.split(' ').filter(Boolean);
  const lastName = nameParts[nameParts.length - 1] || 'Tenant';
  const street = address.split(',')[0].trim().replace(/\s+/g, '_') || 'output';
  return `Bewerbungsunterlagen_${lastName}_${street}.pdf`;
}
